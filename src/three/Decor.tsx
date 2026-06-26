'use client';

/**
 * Scenario-flavored decorative props (non-interactive) that reinforce the
 * setting: a tower crane for the apartment high-rise, an overhead gantry crane
 * for the wide factory/warehouse. Both move subtly (the tower crane slews, the
 * gantry rolls, the hooks bob) to make the site feel alive. Purely cosmetic.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { CELL, COLORS, floorHeight } from './constants';

const STEEL = COLORS.beam;
const YELLOW = '#e0a82e';

export function Decor() {
  const world = useSim((s) => s.world);
  const W = world.width * CELL;
  const D = world.height * CELL;
  const top = floorHeight(world.numFloors - 1);

  return (
    <group>
      {world.scenario === 'apartment' ? (
        <TowerCrane W={W} D={D} top={top} />
      ) : (
        <GantryCrane W={W} D={D} top={top} />
      )}
      <MaterialYard W={W} D={D} />
    </group>
  );
}

const WOOD = '#9c6b3f';
const MAT = '#c08a52';

/** Staged material pallets along the front of the site (pure set dressing). */
function MaterialYard({ W, D }: { W: number; D: number }) {
  const z = D / 2 + 1.4;
  const xs = [-W * 0.32, -W * 0.12, W * 0.08, W * 0.28];
  const heights = [2, 3, 1, 2]; // crates per stack
  return (
    <group>
      {xs.map((x, i) => (
        <group key={i} position={[x, 0, z]}>
          {/* Pallet base. */}
          <mesh position={[0, 0.06, 0]} receiveShadow>
            <boxGeometry args={[1, 0.12, 0.9]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
          {/* Stacked material crates. */}
          {Array.from({ length: heights[i] }).map((_, k) => (
            <mesh key={k} position={[0, 0.32 + k * 0.42, 0]} castShadow>
              <boxGeometry args={[0.78, 0.4, 0.7]} />
              <meshStandardMaterial color={MAT} roughness={0.75} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function TowerCrane({ W, D, top }: { W: number; D: number; top: number }) {
  const mastH = top + 6;
  const jibLen = W * 0.95;
  const slew = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Mesh>(null);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (slew.current) slew.current.rotation.y = Math.sin(t * 0.12) * 0.35;
    if (hook.current) hook.current.position.y = mastH - 2.7 + Math.sin(t * 0.6) * 0.25;
  });

  return (
    <group position={[W / 2 + 3.5, 0, -D / 2 - 1]}>
      {/* Mast (static). */}
      <mesh position={[0, mastH / 2, 0]} castShadow>
        <boxGeometry args={[0.7, mastH, 0.7]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Slewing assembly (rotates about the mast). */}
      <group ref={slew}>
        <mesh position={[0, mastH, 0]}>
          <boxGeometry args={[1.1, 0.9, 1.1]} />
          <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[-jibLen / 2, mastH + 0.7, 0]}>
          <boxGeometry args={[jibLen, 0.24, 0.32]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[2, mastH + 0.7, 0]}>
          <boxGeometry args={[4, 0.24, 0.32]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[3.6, mastH + 0.25, 0]}>
          <boxGeometry args={[1.1, 0.9, 0.8]} />
          <meshStandardMaterial color="#3b485f" />
        </mesh>
        <mesh position={[-jibLen * 0.6, mastH - 1.2, 0]}>
          <boxGeometry args={[0.06, 2.6, 0.06]} />
          <meshStandardMaterial color="#11151c" />
        </mesh>
        <mesh ref={hook} position={[-jibLen * 0.6, mastH - 2.7, 0]}>
          <boxGeometry args={[0.34, 0.34, 0.34]} />
          <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function GantryCrane({ W, D, top }: { W: number; D: number; top: number }) {
  const h = top + 2; // runway height, just above the roof
  const legX = W / 2 + 0.8;
  const legZ = D / 2;
  const bridge = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Mesh>(null);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (bridge.current) bridge.current.position.x = Math.sin(t * 0.12) * (W * 0.28);
    if (hook.current) hook.current.position.y = h - 2.1 + Math.sin(t * 0.5) * 0.2;
  });

  const Leg = ({ x, z }: { x: number; z: number }) => (
    <mesh position={[x, h / 2, z]} castShadow>
      <boxGeometry args={[0.35, h, 0.35]} />
      <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
    </mesh>
  );

  return (
    <group>
      <Leg x={legX} z={legZ} />
      <Leg x={-legX} z={legZ} />
      <Leg x={legX} z={-legZ} />
      <Leg x={-legX} z={-legZ} />

      {/* Runway beams along x on each side (static). */}
      <mesh position={[0, h, legZ]}>
        <boxGeometry args={[W + 2, 0.3, 0.35]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, h, -legZ]}>
        <boxGeometry args={[W + 2, 0.3, 0.35]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Rolling bridge with a trolley + hook. */}
      <group ref={bridge}>
        <mesh position={[0, h + 0.25, 0]}>
          <boxGeometry args={[0.4, 0.3, D + 1]} />
          <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, h + 0.5, 0]}>
          <boxGeometry args={[0.7, 0.5, 0.9]} />
          <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, h - 1, 0]}>
          <boxGeometry args={[0.06, 2, 0.06]} />
          <meshStandardMaterial color="#11151c" />
        </mesh>
        <mesh ref={hook} position={[0, h - 2.1, 0]}>
          <boxGeometry args={[0.34, 0.34, 0.34]} />
          <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
