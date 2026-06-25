'use client';

/**
 * Elevator shafts (static) and cars (animated). Each car's vertical position is
 * read straight from the latest simulation snapshot every frame via the store's
 * non-reactive getState(), so the cars glide smoothly with the cars' continuous
 * `floorPos` without triggering React re-renders.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { CELL, COLORS, FLOOR_GAP, floorHeight, toScene } from './constants';

export function Elevators() {
  const world = useSim((s) => s.world);
  const cars = useRef(new Map<number, THREE.Group>());
  const topHeight = floorHeight(world.numFloors - 1);
  const shaftHeight = topHeight + FLOOR_GAP;

  useFrame(() => {
    const snap = useSim.getState().snapshot;
    for (const e of snap.elevators) {
      const group = cars.current.get(e.id);
      if (!group) continue;
      group.position.y = floorHeight(e.floorPos) + 0.35;
    }
  });

  return (
    <group>
      {world.elevators.map((e) => {
        const [x, , z] = toScene(e.x, e.y, 0, world.width, world.height);
        return (
          <group key={e.id}>
            {/* Glassy shaft spanning the whole height. */}
            <mesh position={[x, topHeight / 2, z]}>
              <boxGeometry args={[CELL * 0.96, shaftHeight, CELL * 0.96]} />
              <meshStandardMaterial
                color={COLORS.shaft}
                transparent
                opacity={0.1}
                metalness={0.1}
                roughness={0.2}
              />
            </mesh>
            {/* The car. */}
            <group
              ref={(o) => {
                if (o) cars.current.set(e.id, o);
                else cars.current.delete(e.id);
              }}
              position={[x, 0.35, z]}
            >
              <mesh castShadow>
                <boxGeometry args={[CELL * 0.84, 0.78, CELL * 0.84]} />
                <meshStandardMaterial color={COLORS.car} metalness={0.5} roughness={0.35} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
