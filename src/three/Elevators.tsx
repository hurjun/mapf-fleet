'use client';

/**
 * Elevator shafts (static frame) and cars (animated). Each car's vertical
 * position is read from the latest snapshot every frame via the store's
 * non-reactive getState(), so cars glide smoothly with their continuous
 * `floorPos` without triggering React re-renders. (Robots riding a car are
 * drawn by Fleet at the car's position, so they ride up/down inside it.)
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
  const r = CELL * 0.46; // shaft half-width for the corner guide rails

  useFrame(() => {
    const snap = useSim.getState().snapshot;
    for (const e of snap.elevators) {
      const group = cars.current.get(e.id);
      if (!group) continue;
      group.position.y = floorHeight(e.floorPos) + 0.4;
    }
  });

  return (
    <group>
      {world.elevators.map((e) => {
        const [x, , z] = toScene(e.x, e.y, 0, world.width, world.height);
        return (
          <group key={e.id}>
            {/* Faint glass enclosure. */}
            <mesh position={[x, topHeight / 2, z]}>
              <boxGeometry args={[CELL * 0.92, shaftHeight, CELL * 0.92]} />
              <meshStandardMaterial color={COLORS.shaft} transparent opacity={0.08} roughness={0.2} />
            </mesh>

            {/* Four steel guide rails so the shaft reads as a structure. */}
            {([
              [r, r],
              [-r, r],
              [r, -r],
              [-r, -r],
            ] as Array<[number, number]>).map(([dx, dz], i) => (
              <mesh key={i} position={[x + dx, topHeight / 2, z + dz]}>
                <boxGeometry args={[0.12, shaftHeight, 0.12]} />
                <meshStandardMaterial color={COLORS.beam} metalness={0.5} roughness={0.5} />
              </mesh>
            ))}

            {/* The car — lit so it stands out as it travels. */}
            <group
              ref={(o) => {
                if (o) cars.current.set(e.id, o);
                else cars.current.delete(e.id);
              }}
              position={[x, 0.4, z]}
            >
              <mesh castShadow>
                <boxGeometry args={[CELL * 0.82, 0.9, CELL * 0.82]} />
                <meshStandardMaterial
                  color={COLORS.car}
                  emissive={COLORS.shaft}
                  emissiveIntensity={0.18}
                  metalness={0.5}
                  roughness={0.3}
                />
              </mesh>
              {/* Accent roof strip. */}
              <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[CELL * 0.86, 0.08, CELL * 0.86]} />
                <meshStandardMaterial color={COLORS.shaft} emissive={COLORS.shaft} emissiveIntensity={0.6} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
