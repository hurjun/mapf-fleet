'use client';

/**
 * The robot fleet.
 *
 * One <RobotMesh> is mounted per robot, keyed by id, so React only mounts/
 * unmounts meshes when the fleet size actually changes. Every frame each mesh
 * reads its own latest state from the store (non-reactively) and:
 *   - eases toward its target cell (smooth motion between discrete sim ticks),
 *   - turns to face its direction of travel,
 *   - tints itself by state (green = to pickup, blue = carrying, amber =
 *     yielding, orange = waiting for a lift, …),
 *   - and shows a crate while it is carrying material.
 *
 * The four kinds get distinct silhouettes (forklift, cart, lifter, scout) so a
 * mixed fleet reads clearly.
 */

import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { RobotKind, RobotSnapshot } from '@/sim/types';
import { ROBOT_Y, floorHeight, robotColor, toScene } from './constants';

const DARK = '#1f2733';
const WHEEL = '#0d1119';
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
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const crate = useRef<THREE.Mesh>(null);

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

    // State color (also drives a soft emissive glow so robots stand out).
    if (bodyMat.current) {
      const c = tmpColor.current.set(robotColor(r));
      bodyMat.current.color.lerp(c, 0.25);
      bodyMat.current.emissive.lerp(c, 0.25);
    }

    // Carried crate.
    if (crate.current) crate.current.visible = r.carrying;
  });

  return (
    <group ref={group}>
      {/* Scaled up a touch so the fleet reads clearly against the structure. */}
      <group scale={1.35}>
        <RobotBody kind={kind} bodyMat={bodyMat} />
        <mesh ref={crate} position={[0, 0.55, 0]} visible={false} castShadow>
          <boxGeometry args={[0.34, 0.3, 0.34]} />
          <meshStandardMaterial color={CRATE} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
});

/** Per-kind geometry. The primary (state-colored) part carries `bodyMat`. */
function RobotBody({
  kind,
  bodyMat,
}: {
  kind: RobotKind;
  bodyMat: React.RefObject<THREE.MeshStandardMaterial>;
}) {
  const body = (args: [number, number, number], y: number) => (
    <mesh position={[0, y, 0]} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        ref={bodyMat}
        color="#4ade80"
        emissive="#4ade80"
        emissiveIntensity={0.55}
        roughness={0.55}
        metalness={0.25}
      />
    </mesh>
  );

  switch (kind) {
    case 'forklift':
      return (
        <group>
          {body([0.5, 0.3, 0.62], 0.2)}
          <mesh position={[0, 0.44, -0.12]} castShadow>
            <boxGeometry args={[0.34, 0.26, 0.28]} />
            <meshStandardMaterial color={DARK} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.3, 0.34]}>
            <boxGeometry args={[0.07, 0.5, 0.07]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh position={[0, 0.08, 0.42]}>
            <boxGeometry args={[0.3, 0.05, 0.22]} />
            <meshStandardMaterial color="#9aa6b6" metalness={0.4} roughness={0.5} />
          </mesh>
          <Wheels />
        </group>
      );
    case 'cart':
      return (
        <group>
          {body([0.6, 0.16, 0.78], 0.16)}
          <Wheels wide />
        </group>
      );
    case 'lifter':
      return (
        <group>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.5, 0.22, 0.5]} />
            <meshStandardMaterial color={DARK} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <boxGeometry args={[0.12, 0.3, 0.12]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          {body([0.46, 0.16, 0.46], 0.56)}
          <Wheels />
        </group>
      );
    case 'scout':
    default:
      return (
        <group>
          {body([0.4, 0.2, 0.46], 0.18)}
          <mesh position={[0, 0.36, 0]} castShadow>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color={DARK} metalness={0.3} roughness={0.4} />
          </mesh>
          <Wheels />
        </group>
      );
  }
}

/** Four simple wheels; `wide` spaces them for the flat cart. */
function Wheels({ wide = false }: { wide?: boolean }) {
  const dx = wide ? 0.32 : 0.26;
  const dz = wide ? 0.32 : 0.24;
  const positions: Array<[number, number, number]> = [
    [dx, 0.06, dz],
    [-dx, 0.06, dz],
    [dx, 0.06, -dz],
    [-dx, 0.06, -dz],
  ];
  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 12]} />
          <meshStandardMaterial color={WHEEL} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
