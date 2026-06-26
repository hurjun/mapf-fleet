'use client';

/**
 * The robot fleet.
 *
 * One <RobotMesh> is mounted per robot, keyed by id, so React only mounts/
 * unmounts meshes when the fleet size actually changes. Every frame each mesh
 * reads its own latest state from the store (non-reactively) and:
 *   - eases toward its target cell (smooth motion between discrete sim ticks),
 *   - turns to face its direction of travel,
 *   - drives a state-colored status beacon/panel (green = to pickup, blue =
 *     carrying, amber = yielding, orange = waiting for a lift, …) so what each
 *     robot is doing is obvious at a glance,
 *   - and shows a crate while it is carrying material.
 *
 * The four kinds get distinct, detailed silhouettes — a counter-balance
 * forklift, a flat AMR cart, a scissor lifter, and a small sensor scout — built
 * from neutral industrial materials with a shared, state-colored accent
 * material for the beacon and trim.
 */

import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { RobotKind, RobotSnapshot } from '@/sim/types';
import { ROBOT_Y, floorHeight, robotColor, toScene } from './constants';

const BODY = '#3a4453'; // neutral industrial chassis
const DARK = '#1c222c'; // tires, frames, sensors
const METAL = '#9aa6b6'; // forks, hubs
const HEADLIGHT = '#fff6d8';
const CRATE = '#c08a52';

/** Look up a robot's current snapshot by id (cheap at this fleet size). */
function findRobot(id: number): RobotSnapshot | undefined {
  const robots = useSim.getState().snapshot.robots;
  for (const r of robots) if (r.id === id) return r;
  return undefined;
}

export function Fleet() {
  const roster = useSim((s) => s.roster);
  return (
    <group>
      {roster.map((r) => (
        <RobotMesh key={r.id} id={r.id} kind={r.kind} />
      ))}
    </group>
  );
}

const RobotMesh = memo(function RobotMesh({ id, kind }: { id: number; kind: RobotKind }) {
  const group = useRef<THREE.Group>(null);
  const crate = useRef<THREE.Mesh>(null);

  // One shared, state-colored material drives every accent on this robot.
  const accent = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#4ade80'),
        emissive: new THREE.Color('#4ade80'),
        emissiveIntensity: 0.85,
        metalness: 0.3,
        roughness: 0.4,
      }),
    [],
  );
  useEffect(() => () => accent.dispose(), [accent]);

  const target = useRef(new THREE.Vector3());
  const tmpColor = useRef(new THREE.Color('#4ade80'));
  const placed = useRef(false);
  const heading = useRef(0);

  useFrame((_, dt) => {
    const r = findRobot(id);
    const g = group.current;
    if (!r || !g) return;

    const { width, height } = useSim.getState().world;
    const [x, , z] = toScene(r.x, r.y, 0, width, height);
    const base = r.phase === 'riding' ? floorHeight(r.ride) : floorHeight(r.floor);
    target.current.set(x, base + ROBOT_Y, z);

    if (!placed.current) {
      g.position.copy(target.current);
      placed.current = true;
    } else {
      // Frame-rate independent easing toward the next cell.
      g.position.lerp(target.current, 1 - Math.pow(0.001, dt));
    }

    // Face the direction of travel.
    const dx = target.current.x - g.position.x;
    const dz = target.current.z - g.position.z;
    if (dx * dx + dz * dz > 1e-5) heading.current = Math.atan2(dx, dz);
    g.rotation.y += (heading.current - g.rotation.y) * Math.min(1, dt * 10);

    // State color drives the shared accent material (beacon + trim).
    const c = tmpColor.current.set(robotColor(r));
    accent.color.lerp(c, 0.25);
    accent.emissive.lerp(c, 0.25);

    if (crate.current) crate.current.visible = r.carrying;
  });

  return (
    <group ref={group}>
      <group scale={1.35}>
        <RobotBody kind={kind} accent={accent} />
        <mesh ref={crate} position={[0, 0.66, 0]} visible={false} castShadow>
          <boxGeometry args={[0.32, 0.28, 0.32]} />
          <meshStandardMaterial color={CRATE} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
});

/** A tire with a metal hub. */
function Wheel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.09, 16]} />
        <meshStandardMaterial color={DARK} roughness={0.85} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 12]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Headlight({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.07, 0.05, 0.03]} />
      <meshStandardMaterial color={HEADLIGHT} emissive={HEADLIGHT} emissiveIntensity={1.1} />
    </mesh>
  );
}

/** A neutral box helper. */
function Part({
  args,
  position,
  rotation,
  color = BODY,
  metalness = 0.45,
  roughness = 0.5,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/** A state-colored accent box sharing the per-robot accent material. */
function Accent({
  args,
  position,
  accent,
}: {
  args: [number, number, number];
  position: [number, number, number];
  accent: THREE.Material;
}) {
  return (
    <mesh position={position} material={accent} castShadow>
      <boxGeometry args={args} />
    </mesh>
  );
}

/** Per-kind geometry. The accent material conveys live state. */
function RobotBody({ kind, accent }: { kind: RobotKind; accent: THREE.MeshStandardMaterial }) {
  switch (kind) {
    case 'forklift':
      return (
        <group>
          <Part args={[0.5, 0.26, 0.5]} position={[0, 0.24, -0.04]} />
          <Part args={[0.5, 0.34, 0.18]} position={[0, 0.26, -0.28]} color={DARK} />
          {/* Cab frame + state-colored roof. */}
          <Part args={[0.05, 0.34, 0.05]} position={[0.2, 0.5, -0.18]} color={DARK} />
          <Part args={[0.05, 0.34, 0.05]} position={[-0.2, 0.5, -0.18]} color={DARK} />
          <Accent args={[0.46, 0.05, 0.3]} position={[0, 0.66, -0.18]} accent={accent} />
          {/* Mast + forks. */}
          <Part args={[0.06, 0.62, 0.06]} position={[0.13, 0.42, 0.26]} color={DARK} />
          <Part args={[0.06, 0.62, 0.06]} position={[-0.13, 0.42, 0.26]} color={DARK} />
          <Part args={[0.07, 0.04, 0.32]} position={[0.1, 0.07, 0.42]} color={METAL} metalness={0.7} />
          <Part args={[0.07, 0.04, 0.32]} position={[-0.1, 0.07, 0.42]} color={METAL} metalness={0.7} />
          <Headlight position={[0.16, 0.22, 0.26]} />
          <Headlight position={[-0.16, 0.22, 0.26]} />
          <Wheel position={[0.26, 0.1, 0.18]} />
          <Wheel position={[-0.26, 0.1, 0.18]} />
          <Wheel position={[0.24, 0.1, -0.22]} />
          <Wheel position={[-0.24, 0.1, -0.22]} />
        </group>
      );
    case 'cart':
      return (
        <group>
          <Part args={[0.64, 0.13, 0.82]} position={[0, 0.17, 0]} />
          <Part args={[0.56, 0.05, 0.74]} position={[0, 0.25, 0]} color={DARK} roughness={0.7} />
          {/* Side status strips. */}
          <Accent args={[0.66, 0.05, 0.08]} position={[0, 0.17, 0.42]} accent={accent} />
          <Accent args={[0.66, 0.05, 0.08]} position={[0, 0.17, -0.42]} accent={accent} />
          {/* Lidar puck + beacon. */}
          <mesh position={[0, 0.31, 0.3]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 14]} />
            <meshStandardMaterial color={DARK} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.34, -0.28]} material={accent}>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 14]} />
          </mesh>
          <Wheel position={[0.34, 0.1, 0.3]} />
          <Wheel position={[-0.34, 0.1, 0.3]} />
          <Wheel position={[0.34, 0.1, -0.3]} />
          <Wheel position={[-0.34, 0.1, -0.3]} />
        </group>
      );
    case 'lifter':
      return (
        <group>
          <Part args={[0.5, 0.2, 0.5]} position={[0, 0.14, 0]} />
          {/* Scissor X-frame. */}
          <Part args={[0.05, 0.5, 0.05]} position={[0, 0.42, 0.1]} rotation={[0, 0, 0.5]} color={DARK} />
          <Part args={[0.05, 0.5, 0.05]} position={[0, 0.42, 0.1]} rotation={[0, 0, -0.5]} color={DARK} />
          <Part args={[0.05, 0.5, 0.05]} position={[0, 0.42, -0.1]} rotation={[0, 0, 0.5]} color={DARK} />
          <Part args={[0.05, 0.5, 0.05]} position={[0, 0.42, -0.1]} rotation={[0, 0, -0.5]} color={DARK} />
          {/* State-colored lift platform + beacon. */}
          <Accent args={[0.5, 0.1, 0.5]} position={[0, 0.72, 0]} accent={accent} />
          <mesh position={[0.18, 0.26, 0.22]} material={accent}>
            <cylinderGeometry args={[0.04, 0.04, 0.08, 12]} />
          </mesh>
          <Wheel position={[0.26, 0.1, 0.22]} />
          <Wheel position={[-0.26, 0.1, 0.22]} />
          <Wheel position={[0.26, 0.1, -0.22]} />
          <Wheel position={[-0.26, 0.1, -0.22]} />
        </group>
      );
    case 'scout':
    default:
      return (
        <group>
          <Part args={[0.4, 0.2, 0.5]} position={[0, 0.2, 0]} />
          {/* Glowing status band around the body. */}
          <Accent args={[0.43, 0.05, 0.52]} position={[0, 0.22, 0]} accent={accent} />
          {/* Sensor dome + camera bump. */}
          <mesh position={[0, 0.36, 0]} castShadow>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color={DARK} metalness={0.35} roughness={0.4} />
          </mesh>
          <Headlight position={[0, 0.22, 0.26]} />
          <Wheel position={[0.22, 0.1, 0.12]} />
          <Wheel position={[-0.22, 0.1, 0.12]} />
          <Wheel position={[0.22, 0.1, -0.16]} />
          <Wheel position={[-0.22, 0.1, -0.16]} />
        </group>
      );
  }
}
