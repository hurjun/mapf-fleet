'use client';

/** Live detail panel for the selected robot. Click a robot in the 3D view. */

import { useSim } from '@/state/store';
import { RobotPhase } from '@/sim/types';
import { robotColor } from '@/three/constants';
import { Panel } from './ui';

const PHASE_LABEL: Record<RobotPhase, string> = {
  idle: 'Idle',
  to_pickup: 'Heading to pickup',
  loading: 'Loading',
  to_dropoff: 'Carrying to dropoff',
  unloading: 'Unloading',
  awaiting_elevator: 'Waiting for elevator',
  riding: 'Riding elevator',
  to_charger: 'Heading to charger',
  charging: 'Charging',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-white/45">{label}</span>
      <span className="font-mono tabular-nums text-white/85">{value}</span>
    </div>
  );
}

export function RobotInspector() {
  const selectedId = useSim((s) => s.selectedRobotId);
  const robots = useSim((s) => s.snapshot.robots);
  const setSelected = useSim((s) => s.setSelected);

  if (selectedId == null) return null;
  const r = robots.find((x) => x.id === selectedId);
  if (!r) return null;

  const cell = (c: { floor: number; x: number; y: number }) => `F${c.floor} · ${c.x},${c.y}`;

  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: robotColor(r) }}
          />
          <h2 className="text-sm font-semibold text-white">
            Robot #{r.id}
            <span className="ml-1.5 text-xs font-normal capitalize text-white/45">{r.kind}</span>
          </h2>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1.5">
        <Row label="Status" value={PHASE_LABEL[r.phase]} />
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-white/45">Battery</span>
            <span className="font-mono tabular-nums text-white/85">{Math.round(r.battery * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(3, r.battery * 100)}%`,
                backgroundColor: r.battery > 0.5 ? '#4ade80' : r.battery > 0.25 ? '#fbbf24' : '#ef4444',
              }}
            />
          </div>
        </div>
        <Row label="Carrying" value={r.carrying ? 'Yes' : 'No'} />
        <Row label="Position" value={cell({ floor: r.floor, x: r.x, y: r.y })} />
        {r.pickup && <Row label="Pickup" value={cell(r.pickup)} />}
        {r.dropoff && <Row label="Dropoff" value={cell(r.dropoff)} />}
        <Row label="Plan length" value={`${Math.max(0, r.path.length - 1)} steps`} />
      </div>
    </Panel>
  );
}
