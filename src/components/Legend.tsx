'use client';

/** Explains the robot state colors and the station/elevator markers. */

import { COLORS, STATE_LEGEND } from '@/three/constants';
import { Panel } from './ui';

const MARKERS: Array<{ label: string; color: string }> = [
  { label: 'Pickup', color: COLORS.pickup },
  { label: 'Dropoff', color: COLORS.dropoff },
  { label: 'Lift board', color: COLORS.boardPad },
  { label: 'Lift exit', color: COLORS.exitPad },
];

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-[11px] text-white/60">{label}</span>
    </div>
  );
}

export function Legend() {
  return (
    <Panel title="Legend">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {STATE_LEGEND.map((s) => (
          <Swatch key={s.label} {...s} />
        ))}
      </div>
      <div className="my-2 h-px bg-white/10" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {MARKERS.map((m) => (
          <Swatch key={m.label} {...m} />
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-white/35">
        Fleet: forklift · cart · lifter · scout
      </p>
    </Panel>
  );
}
