'use client';

/** Live performance metrics, refreshed every simulation tick. */

import { useSim } from '@/state/store';
import { Panel, Stat } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Download the recorded metric history for the current run as a CSV file. */
function exportCsv() {
  const s = useSim.getState();
  const lines = ['sample,throughput_per_min,congestion_pct,elevator_load_pct'];
  s.history.forEach((h, i) => {
    lines.push(`${i},${h.throughput},${(h.congestion * 100).toFixed(1)},${(h.elevator * 100).toFixed(1)}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mapf-${s.scenario}-${s.robotCount}robots.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StatsPanel() {
  const m = useSim((s) => s.snapshot.metrics);

  return (
    <Panel title="Live metrics">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Throughput" value={`${m.throughput}/min`} accent />
        <Stat label="Delivered" value={`${m.deliveries}`} />
        <Stat label="Moving" value={pct(m.utilization)} />
        <Stat label="Waiting" value={pct(m.congestion)} />
        <Stat label="Elevator load" value={pct(m.elevatorUtilization)} />
        <Stat label="Avg wait" value={`${m.avgWaitPerDelivery.toFixed(0)}s`} />
        <Stat label="Avg battery" value={pct(m.avgBattery)} />
        <Stat label="Deadlocks cleared" value={`${m.deadlocksResolved}`} />
      </div>
      <button
        onClick={exportCsv}
        className="mt-2.5 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/85"
      >
        Download metrics CSV
      </button>
    </Panel>
  );
}
