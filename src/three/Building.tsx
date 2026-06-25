'use client';

/**
 * Static building geometry: floor slabs, structural columns / machine blocks,
 * pickup & dropoff stations, and the elevator boarding/exit pads.
 *
 * Everything here is derived once from the immutable `world` (memoized), since
 * the structure only changes when the scenario or its parameters change. Repeated
 * elements (columns, stations, pads) use instanced meshes so even a tall, busy
 * building stays cheap to draw.
 */

import { useMemo } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { Cell, World } from '@/sim/types';
import { CELL, COLORS, FLOOR_GAP, floorHeight, toScene } from './constants';

type Vec3 = [number, number, number];

export function Building({ world }: { world: World }) {
  const geometry = useMemo(() => buildGeometry(world), [world]);
  const totalHeight = floorHeight(world.numFloors - 1);

  return (
    <group>
      {/* Ground plane to catch shadows and anchor the scene. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.7, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>

      {/* Translucent floor slabs (the cutaway look). */}
      {world.floors.map((g) => (
        <mesh key={g.floor} position={[0, floorHeight(g.floor) - 0.18, 0]} receiveShadow>
          <boxGeometry args={[world.width * CELL, 0.12, world.height * CELL]} />
          <meshStandardMaterial
            color={COLORS.slab}
            transparent
            opacity={0.16}
            roughness={0.9}
          />
        </mesh>
      ))}

      <InstanceGroup positions={geometry.structures} args={[0.7, 1.5, 0.7]} color={COLORS.column} />
      <InstanceGroup positions={geometry.pickups} args={[0.82, 0.08, 0.82]} color={COLORS.pickup} emissive />
      <InstanceGroup positions={geometry.dropoffs} args={[0.82, 0.08, 0.82]} color={COLORS.dropoff} emissive />
      <InstanceGroup positions={geometry.boardPads} args={[0.78, 0.1, 0.78]} color={COLORS.boardPad} emissive />
      <InstanceGroup positions={geometry.exitPads} args={[0.78, 0.1, 0.78]} color={COLORS.exitPad} emissive />

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
        emissiveIntensity={emissive ? 0.35 : 0}
      />
      {positions.map((p, i) => (
        <Instance key={i} position={p} />
      ))}
    </Instances>
  );
}

function buildGeometry(world: World) {
  const { width, height } = world;

  // Cells occupied by elevator shafts (rendered separately, not as columns).
  const shaft = new Set<string>();
  for (const e of world.elevators) {
    shaft.add(`${e.x}|0`);
    shaft.add(`${e.x}|1`);
  }

  const structures: Vec3[] = [];
  for (const g of world.floors) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (g.cells[y * width + x] !== Cell.Wall) continue;
        if (shaft.has(`${x}|${y}`)) continue;
        structures.push(toScene(x, y, floorHeight(g.floor) + 0.7, width, height));
      }
    }
  }

  const pickups: Vec3[] = [];
  const dropoffs: Vec3[] = [];
  for (const s of world.stations) {
    const pos = toScene(s.x, s.y, floorHeight(s.floor) + 0.02, width, height);
    (s.role === 'pickup' ? pickups : dropoffs).push(pos);
  }

  const boardPads: Vec3[] = [];
  const exitPads: Vec3[] = [];
  for (const e of world.elevators) {
    for (const g of world.floors) {
      boardPads.push(toScene(e.inCell.x, e.inCell.y, floorHeight(g.floor) + 0.04, width, height));
      exitPads.push(toScene(e.outCell.x, e.outCell.y, floorHeight(g.floor) + 0.04, width, height));
    }
  }

  return { structures, pickups, dropoffs, boardPads, exitPads };
}
