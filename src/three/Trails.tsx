'use client';

/**
 * Fading motion trails behind robots. Each tick the robot's current cell is
 * appended to a short per-robot ring buffer (reset when it changes floor), and
 * each buffer is drawn as a faint line so recent flow through the site is
 * visible at a glance.
 */

import { useEffect, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { floorHeight, robotColor, toScene } from './constants';

const MAX_POINTS = 14;

interface Trail {
  floor: number;
  points: THREE.Vector3[];
  color: string;
}

export function Trails() {
  const show = useSim((s) => s.showTrails);
  const snapshot = useSim((s) => s.snapshot);
  const world = useSim((s) => s.world);
  const buffers = useRef(new Map<number, Trail>());
  const [, bump] = useState(0);

  // A rebuilt world resets robot ids, so drop stale buffers to avoid trails
  // that connect old-world positions to new ones.
  useEffect(() => {
    buffers.current.clear();
  }, [world]);

  useEffect(() => {
    if (!show) {
      buffers.current.clear();
      return;
    }
    const seen = new Set<number>();
    for (const r of snapshot.robots) {
      if (r.phase === 'riding') continue;
      seen.add(r.id);
      const [x, , z] = toScene(r.x, r.y, 0, world.width, world.height);
      const y = floorHeight(r.floor) + 0.16;
      let t = buffers.current.get(r.id);
      if (!t || t.floor !== r.floor) {
        t = { floor: r.floor, points: [], color: robotColor(r) };
        buffers.current.set(r.id, t);
      }
      t.color = robotColor(r);
      const last = t.points[t.points.length - 1];
      if (!last || last.x !== x || last.z !== z) {
        t.points.push(new THREE.Vector3(x, y, z));
        if (t.points.length > MAX_POINTS) t.points.shift();
      }
    }
    for (const id of Array.from(buffers.current.keys())) {
      if (!seen.has(id)) buffers.current.delete(id);
    }
    bump((n) => n + 1);
  }, [snapshot, show, world]);

  if (!show) return null;

  return (
    <group>
      {Array.from(buffers.current.entries()).map(([id, t]) =>
        t.points.length >= 2 ? (
          // Pass a fresh array so drei's geometry memo (keyed on the points
          // reference) actually rebuilds as the trail grows/shifts.
          <Line key={id} points={t.points.slice()} color={t.color} lineWidth={1} transparent opacity={0.28} />
        ) : null,
      )}
    </group>
  );
}
