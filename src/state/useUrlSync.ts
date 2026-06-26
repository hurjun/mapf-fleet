'use client';

/**
 * Two-way sync between the simulator configuration and the URL query string, so
 * a specific setup is shareable by copying the link. Reads (and validates) the
 * query once on mount, then keeps the URL updated as the configuration changes.
 */

import { useEffect, useRef } from 'react';
import { useSim } from './store';
import { PlannerKind } from '@/sim/engine';
import { optimizeFleet } from '@/sim/optimize';
import { DEFAULT_PARAMS, PARAM_BOUNDS, ScenarioParams } from '@/sim/scenarios';
import { ScenarioId } from '@/sim/types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Recommended fleet size for a given building (matches the store's optimizer). */
function recommendedFor(params: ScenarioParams): number {
  return optimizeFleet({
    params,
    loadTicks: 4,
    unloadTicks: 4,
    tickSeconds: 1,
    maxRobots: PARAM_BOUNDS.robotCount.max,
  }).recommended;
}

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
    // Default the fleet to the recommendation for *this* building (not the
    // initial scenario's), used only when the URL omits `n`.
    const robotCount = num('n', recommendedFor(params), PARAM_BOUNDS.robotCount);
    const planner: PlannerKind = q.get('p') === 'cbs' ? 'cbs' : 'prioritized';

    useSim.getState().applyConfig(params, robotCount, planner);
  }, []);

  // Persist configuration changes back to the URL.
  const scenario = useSim((s) => s.scenario);
  const params = useSim((s) => s.params);
  const robotCount = useSim((s) => s.robotCount);
  const planner = useSim((s) => s.planner);

  // Skip the very first persist so we don't clobber the incoming URL before the
  // restore effect's applyConfig has been reflected in the store.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
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
