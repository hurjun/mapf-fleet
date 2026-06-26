'use client';

/**
 * Top-down 2D plan of one floor: walls, stations, elevator pads, and live robot
 * positions. Complements the 3D view, and clicking a robot dot selects it
 * (kept in sync with the 3D scene). A stepper switches floors.
 */

import { ReactElement, useMemo } from 'react';
import { useSim } from '@/state/store';
import { Cell } from '@/sim/types';
import { COLORS, robotColor } from '@/three/constants';
import { Panel } from './ui';

export function Minimap() {
  const world = useSim((s) => s.world);
  const viewFloor = useSim((s) => s.viewFloor);
  const setViewFloor = useSim((s) => s.setViewFloor);
  const robots = useSim((s) => s.snapshot.robots);
  const selectedId = useSim((s) => s.selectedRobotId);
  const setSelected = useSim((s) => s.setSelected);

  const floor = Math.min(viewFloor, world.numFloors - 1);
  const grid = world.floors[floor];
  const W = world.width;
  const H = world.height;

  // Static layer (walls / stations / pads) only changes with the floor.
  const statics = useMemo(() => {
    const els: ReactElement[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid.cells[y * W + x] === Cell.Wall) {
          els.push(<rect key={`w${x}-${y}`} x={x} y={y} width={1} height={1} fill="#2b3445" />);
        }
      }
    }
    for (const s of world.stations) {
      if (s.floor !== floor) continue;
      const color =
        s.role === 'pickup' ? COLORS.pickup : s.role === 'dropoff' ? COLORS.dropoff : COLORS.charger;
      els.push(<rect key={`s${s.id}`} x={s.x} y={s.y} width={1} height={1} fill={color} opacity={0.9} />);
    }
    for (const e of world.elevators) {
      els.push(<rect key={`sh${e.id}`} x={e.x} y={0} width={1} height={2} fill="#0e7490" opacity={0.8} />);
      els.push(<rect key={`in${e.id}`} x={e.inCell.x} y={e.inCell.y} width={1} height={1} fill={COLORS.boardPad} />);
      els.push(<rect key={`out${e.id}`} x={e.outCell.x} y={e.outCell.y} width={1} height={1} fill={COLORS.exitPad} />);
    }
    return els;
  }, [world, grid, floor, W, H]);

  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Floor map
        </h2>
        <div className="flex items-center gap-1.5">
          <FloorBtn label="−" onClick={() => setViewFloor(floor - 1)} disabled={floor <= 0} />
          <span className="w-8 text-center font-mono text-xs tabular-nums text-white/75">
            F{floor}
          </span>
          <FloorBtn
            label="+"
            onClick={() => setViewFloor(floor + 1)}
            disabled={floor >= world.numFloors - 1}
          />
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded bg-black/40"
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
      >
        {statics}
        {robots
          .filter((r) => r.floor === floor && r.phase !== 'riding')
          .map((r) => (
            <circle
              key={r.id}
              cx={r.x + 0.5}
              cy={r.y + 0.5}
              r={selectedId === r.id ? 1.1 : 0.72}
              fill={robotColor(r)}
              stroke={selectedId === r.id ? '#ffffff' : 'none'}
              strokeWidth={0.18}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(r.id)}
            />
          ))}
      </svg>
    </Panel>
  );
}

function FloorBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-5 w-5 rounded border border-white/10 text-xs leading-none text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30"
    >
      {label}
    </button>
  );
}
