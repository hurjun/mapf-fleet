'use client';

/**
 * Static building geometry: floor slabs, structural columns / machine blocks,
 * pickup / dropoff / charger stations, and elevator boarding/exit pads.
 *
 * Geometry is derived once from the immutable `world` (memoized) and rendered
 * per floor, so single-floor "focus" mode can isolate one level by hiding the
 * others. Repeated elements use instanced meshes to stay cheap to draw.
 */

import { useMemo } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useSim } from '@/state/store';
import { Cell, World } from '@/sim/types';
import { CELL, COLORS, FLOOR_GAP, floorHeight, toScene } from './constants';

type Vec3 = [number, number, number];

interface FloorGeometry {
  floor: number;
  structures: Vec3[];
  pickups: Vec3[];
  dropoffs: Vec3[];
  chargers: Vec3[];
  boardPads: Vec3[];
  exitPads: Vec3[];
}

export function Building({ world }: { world: World }) {
  const floors = useMemo(() => buildGeometry(world), [world]);
  const focusFloor = useSim((s) => s.focusFloor);
  const viewFloor = useSim((s) => s.viewFloor);
  const totalHeight = floorHeight(world.numFloors - 1);

  return (
    <group>
      {/* Ground plane to catch shadows and anchor the scene. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.7, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>

      {floors.map((f) => {
        const focused = !focusFloor || f.floor === viewFloor;
        const slabOpacity = focusFloor ? (f.floor === viewFloor ? 0.22 : 0.04) : 0.16;
        return (
          <group key={f.floor}>
            {/* Floor slab (always drawn for context; faded when not focused). */}
            <mesh position={[0, floorHeight(f.floor) - 0.18, 0]} receiveShadow>
              <boxGeometry args={[world.width * CELL, 0.12, world.height * CELL]} />
              <meshStandardMaterial color={COLORS.slab} transparent opacity={slabOpacity} roughness={0.9} />
            </mesh>

            <group visible={focused}>
              <InstanceGroup positions={f.structures} args={[0.42, 0.9, 0.42]} color={COLORS.column} />
              <InstanceGroup positions={f.pickups} args={[0.7, 0.07, 0.7]} color={COLORS.pickup} emissive />
              <InstanceGroup positions={f.dropoffs} args={[0.7, 0.07, 0.7]} color={COLORS.dropoff} emissive />
              <InstanceGroup positions={f.chargers} args={[0.7, 0.09, 0.7]} color={COLORS.charger} emissive />
              <InstanceGroup positions={f.boardPads} args={[0.74, 0.09, 0.74]} color={COLORS.boardPad} emissive />
              <InstanceGroup positions={f.exitPads} args={[0.74, 0.09, 0.74]} color={COLORS.exitPad} emissive />
            </group>
          </group>
        );
      })}

      {/* Faint outer frame so the tower reads as one structure. */}
      <mesh position={[0, totalHeight / 2, 0]}>
        <boxGeometry args={[world.width * CELL + 0.4, totalHeight + FLOOR_GAP, world.height * CELL + 0.4]} />
        <meshStandardMaterial color={COLORS.slabEdge} transparent opacity={0.04} wireframe />
      </mesh>
    </group>
  );
}

function InstanceGroup({
  positions,
  args,
  color,
  emissive = false,
}: {
  positions: Vec3[];
  args: Vec3;
  color: string;
  emissive?: boolean;
}) {
  if (positions.length === 0) return null;
  return (
    <Instances limit={positions.length} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        metalness={0.1}
        emissive={emissive ? color : '#000000'}
        emissiveIntensity={emissive ? 0.22 : 0}
      />
      {positions.map((p, i) => (
        <Instance key={i} position={p} />
      ))}
    </Instances>
  );
}

function buildGeometry(world: World): FloorGeometry[] {
  const { width, height } = world;

  const shaft = new Set<string>();
  for (const e of world.elevators) {
    shaft.add(`${e.x}|0`);
    shaft.add(`${e.x}|1`);
  }

  const byFloor = new Map<number, FloorGeometry>();
  for (const g of world.floors) {
    byFloor.set(g.floor, {
      floor: g.floor,
      structures: [],
      pickups: [],
      dropoffs: [],
      chargers: [],
      boardPads: [],
      exitPads: [],
    });
  }

  for (const g of world.floors) {
    const f = byFloor.get(g.floor)!;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (g.cells[y * width + x] !== Cell.Wall) continue;
        if (shaft.has(`${x}|${y}`)) continue;
        f.structures.push(toScene(x, y, floorHeight(g.floor) + 0.35, width, height));
      }
    }
  }

  for (const s of world.stations) {
    const f = byFloor.get(s.floor)!;
    const pos = toScene(s.x, s.y, floorHeight(s.floor) + 0.02, width, height);
    if (s.role === 'pickup') f.pickups.push(pos);
    else if (s.role === 'dropoff') f.dropoffs.push(pos);
    else f.chargers.push(pos);
  }

  for (const e of world.elevators) {
    for (const g of world.floors) {
      const f = byFloor.get(g.floor)!;
      f.boardPads.push(toScene(e.inCell.x, e.inCell.y, floorHeight(g.floor) + 0.04, width, height));
      f.exitPads.push(toScene(e.outCell.x, e.outCell.y, floorHeight(g.floor) + 0.04, width, height));
    }
  }

  return [...byFloor.values()];
}
