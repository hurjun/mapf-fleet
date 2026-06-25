'use client';

/** Live performance metrics, refreshed every simulation tick. */

import { useSim } from '@/state/store';
import { Panel, Stat } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;

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
      </div>
    </Panel>
  );
}
