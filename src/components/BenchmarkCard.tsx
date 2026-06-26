'use client';

/**
 * On-demand planner comparison. Runs both planners on the current building/fleet
 * and shows the trade-off (quality vs. compute). The run is synchronous, so we
 * paint a "Comparing…" state first, then compute on the next tick.
 */

import { useEffect, useState } from 'react';
import { useSim } from '@/state/store';
import { BenchmarkResult, comparePlanners } from '@/sim/benchmark';
import { Panel } from './ui';

const TICKS = 350;

export function BenchmarkCard() {
  const params = useSim((s) => s.params);
  const robotCount = useSim((s) => s.robotCount);
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [res, setRes] = useState<BenchmarkResult | null>(null);

  // A prior comparison is meaningless once the building or fleet changes.
  useEffect(() => {
    setRes(null);
    setStatus('idle');
  }, [params, robotCount]);

  const run = () => {
    setStatus('running');
    setTimeout(() => {
      setRes(comparePlanners(params, robotCount, TICKS));
      setStatus('done');
    }, 30);
  };

  return (
    <Panel title="Planner benchmark">
      <button
        onClick={run}
        disabled={status === 'running'}
        className="w-full rounded-lg border border-accent/30 bg-accent/20 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-60"
      >
        {status === 'running' ? 'Comparing…' : 'Compare prioritized vs CBS'}
      </button>

      {res && status === 'done' && (
        <div className="mt-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-xs">
            <span className="text-white/40" />
            <span className="text-right font-medium text-white/55">Prioritized</span>
            <span className="text-right font-medium text-white/55">CBS</span>

            <Row label="Deliveries" a={res.prioritized.deliveries} b={res.cbs.deliveries} better="high" />
            <Row label="Avg wait" a={res.prioritized.avgWait} b={res.cbs.avgWait} unit="s" better="low" />
            <Row
              label="Congestion"
              a={res.prioritized.congestion * 100}
              b={res.cbs.congestion * 100}
              unit="%"
              better="low"
            />
            <Row label="Compute" a={res.prioritized.ms} b={res.cbs.ms} unit="ms" better="low" />
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-white/35">
        Runs {TICKS} ticks per planner on this exact building, fleet, and seed.
      </p>
    </Panel>
  );
}

function Row({
  label,
  a,
  b,
  unit = '',
  better,
}: {
  label: string;
  a: number;
  b: number;
  unit?: string;
  better: 'high' | 'low';
}) {
  const aWins = better === 'high' ? a > b : a < b;
  const bWins = better === 'high' ? b > a : b < a;
  const fmt = (v: number) => `${Math.round(v)}${unit}`;
  return (
    <>
      <span className="text-white/55">{label}</span>
      <span className={`text-right font-mono tabular-nums ${aWins ? 'text-accent' : 'text-white/80'}`}>
        {fmt(a)}
      </span>
      <span className={`text-right font-mono tabular-nums ${bWins ? 'text-accent' : 'text-white/80'}`}>
        {fmt(b)}
      </span>
    </>
  );
}
