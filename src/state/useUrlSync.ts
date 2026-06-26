'use client';

/**
 * Two-way sync between the simulator configuration and the URL query string, so
 * a specific setup is shareable by copying the link. Reads (and validates) the
 * query once on mount, then keeps the URL updated as the configuration changes.
 */

import { useEffect } from 'react';
import { useSim } from './store';
import { PlannerKind } from '@/sim/engine';
import { DEFAULT_PARAMS, PARAM_BOUNDS, ScenarioParams } from '@/sim/scenarios';
import { ScenarioId } from '@/sim/types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function useUrlSync(): void {
  // Restore from the URL on first mount.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (Array.from(q.keys()).length === 0) return;

    const s = q.get('s');
    const scenario: ScenarioId =
      s === 'apartment' || s === 'factory' || s === 'warehouse' ? s : useSim.getState().scenario;
    const base = DEFAULT_PARAMS[scenario];

    const num = (key: string, def: number, b: { min: number; max: number }) => {
      const v = parseInt(q.get(key) ?? '', 10);
      return Number.isFinite(v) ? clamp(v, b.min, b.max) : def;
    };

    const params: ScenarioParams = {
      ...base,
      numFloors: num('f', base.numFloors, PARAM_BOUNDS.numFloors),
      elevatorCount: num('e', base.elevatorCount, PARAM_BOUNDS.elevatorCount),
      elevatorCapacity: num('c', base.elevatorCapacity, PARAM_BOUNDS.elevatorCapacity),
      width: num('w', base.width, PARAM_BOUNDS.width),
      height: num('h', base.height, PARAM_BOUNDS.height),
    };
    const robotCount = num('n', useSim.getState().optimizer.recommended, PARAM_BOUNDS.robotCount);
    const planner: PlannerKind = q.get('p') === 'cbs' ? 'cbs' : 'prioritized';

    useSim.getState().applyConfig(params, robotCount, planner);
  }, []);

  // Persist configuration changes back to the URL.
  const scenario = useSim((s) => s.scenario);
  const params = useSim((s) => s.params);
  const robotCount = useSim((s) => s.robotCount);
  const planner = useSim((s) => s.planner);

  useEffect(() => {
    const q = new URLSearchParams();
    q.set('s', scenario);
    q.set('f', String(params.numFloors));
    q.set('e', String(params.elevatorCount));
    q.set('c', String(params.elevatorCapacity));
    q.set('w', String(params.width));
    q.set('h', String(params.height));
    q.set('n', String(robotCount));
    q.set('p', planner);
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  }, [scenario, params, robotCount, planner]);
}
