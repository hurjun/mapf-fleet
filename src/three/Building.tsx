'use client';

/**
 * Building geometry, designed to read clearly as a stack of distinct floors:
 *
 *  - each floor is a semi-opaque deck with a bright outlined edge, so levels are
 *    obvious and countable while you can still see through to the floors below;
 *  - a steel frame (corner columns + per-floor edge beams) ties the levels into
 *    one structure — a construction-site skeleton;
 *  - floor-number labels run up the side;
 *  - stations, charger pads, elevator pads and structural columns sit on each
 *    deck (instanced), and single-floor "focus" hides the other levels.
 */

import { useMemo } from 'react';
import { Edges, Html, Instance, Instances } from '@react-three/drei';
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

  const W = world.width * CELL;
  const D = world.height * CELL;
  const top = floorHeight(world.numFloors - 1);
  const labelX = -W / 2 - 1.4;
  const labelZ = D / 2;

  return (
    <group>
      {/* Ground plane to catch shadows and anchor the scene. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.7, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>

      {/* Full-height corner columns — the building frame. */}
      {([
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ] as Array<[number, number]>).map(([x, z], i) => (
        <mesh key={i} position={[x, top / 2 - 0.2, z]}>
          <boxGeometry args={[0.35, top + FLOOR_GAP, 0.35]} />
          <meshStandardMaterial color={COLORS.beam} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {floors.map((f) => {
        const focused = !focusFloor || f.floor === viewFloor;
        const y = floorHeight(f.floor);
        const deckOpacity = focusFloor ? (f.floor === viewFloor ? 0.7 : 0.05) : 0.4;
        return (
          <group key={f.floor}>
            {/* Deck: a clear platform with a bright outlined edge. */}
            <mesh position={[0, y - 0.2, 0]} receiveShadow>
              <boxGeometry args={[W, 0.18, D]} />
              <meshStandardMaterial
                color={COLORS.slab}
                transparent
                opacity={deckOpacity}
                roughness={0.85}
              />
              <Edges color={COLORS.slabEdge} />
            </mesh>

            {/* Floor number, running up the side. */}
            <Html
              position={[labelX, y + 0.1, labelZ]}
              center
              distanceFactor={world.numFloors * FLOOR_GAP * 0.9}
              zIndexRange={[10, 0]}
            >
              <div
                style={{
                  color: focused ? '#cfe0ff' : '#56688c',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                F{f.floor}
              </div>
            </Html>

            <group visible={focused}>
              <InstanceGroup positions={f.structures} args={[0.5, 1.3, 0.5]} color={COLORS.column} />
              <InstanceGroup positions={f.pickups} args={[0.78, 0.12, 0.78]} color={COLORS.pickup} emissive />
              <InstanceGroup positions={f.dropoffs} args={[0.78, 0.12, 0.78]} color={COLORS.dropoff} emissive />
              <InstanceGroup positions={f.chargers} args={[0.78, 0.14, 0.78]} color={COLORS.charger} emissive />
              <InstanceGroup positions={f.boardPads} args={[0.82, 0.14, 0.82]} color={COLORS.boardPad} emissive />
              <InstanceGroup positions={f.exitPads} args={[0.82, 0.14, 0.82]} color={COLORS.exitPad} emissive />
            </group>
          </group>
        );
      })}
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
        roughness={0.6}
        metalness={0.15}
        emissive={emissive ? color : '#000000'}
        emissiveIntensity={emissive ? 0.4 : 0}
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
        f.structures.push(toScene(x, y, floorHeight(g.floor) + 0.55, width, height));
      }
    }
  }

  for (const s of world.stations) {
    const f = byFloor.get(s.floor)!;
    const pos = toScene(s.x, s.y, floorHeight(s.floor) + 0.04, width, height);
    if (s.role === 'pickup') f.pickups.push(pos);
    else if (s.role === 'dropoff') f.dropoffs.push(pos);
    else f.chargers.push(pos);
  }

  for (const e of world.elevators) {
    for (const g of world.floors) {
      const f = byFloor.get(g.floor)!;
      f.boardPads.push(toScene(e.inCell.x, e.inCell.y, floorHeight(g.floor) + 0.05, width, height));
      f.exitPads.push(toScene(e.outCell.x, e.outCell.y, floorHeight(g.floor) + 0.05, width, height));
    }
  }

  return [...byFloor.values()];
}
