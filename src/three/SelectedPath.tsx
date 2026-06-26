'use client';

/**
 * Draws the planned path of the currently selected robot as a line on its floor,
 * so you can watch the planner's windowed plan update tick by tick.
 */

import { Line } from '@react-three/drei';
import { useSim } from '@/state/store';
import { floorHeight, toScene } from './constants';

export function SelectedPath() {
  const selectedId = useSim((s) => s.selectedRobotId);
  const snapshot = useSim((s) => s.snapshot);
  const world = useSim((s) => s.world);

  if (selectedId == null) return null;
  const r = snapshot.robots.find((rr) => rr.id === selectedId);
  if (!r || r.path.length < 2) return null;

  const points = r.path.map(
    (p) => toScene(p.x, p.y, floorHeight(r.floor) + 0.25, world.width, world.height) as [number, number, number],
  );

  return <Line points={points} color="#5eead4" lineWidth={2.5} transparent opacity={0.9} />;
}
