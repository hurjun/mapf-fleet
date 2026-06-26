'use client';

/**
 * When enabled, draws every navigating robot's planned path as a faint,
 * state-colored line — a direct view of the MAPF planner coordinating the whole
 * fleet at once.
 */

import { Line } from '@react-three/drei';
import { useSim } from '@/state/store';
import { floorHeight, robotColor, toScene } from './constants';

export function AllPaths() {
  const show = useSim((s) => s.showPaths);
  const snapshot = useSim((s) => s.snapshot);
  const world = useSim((s) => s.world);
  const focusFloor = useSim((s) => s.focusFloor);
  const viewFloor = useSim((s) => s.viewFloor);

  if (!show) return null;

  return (
    <group>
      {snapshot.robots.map((r) => {
        if (r.path.length < 2) return null;
        if (focusFloor && r.floor !== viewFloor) return null;
        const points = r.path.map(
          (p) =>
            toScene(p.x, p.y, floorHeight(r.floor) + 0.16, world.width, world.height) as [
              number,
              number,
              number,
            ],
        );
        return (
          <Line key={r.id} points={points} color={robotColor(r)} lineWidth={1.2} transparent opacity={0.4} />
        );
      })}
    </group>
  );
}
