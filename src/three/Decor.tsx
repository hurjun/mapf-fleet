'use client';

/**
 * Scenario-flavored decorative props (non-interactive) that reinforce the
 * setting: a tower crane for the apartment high-rise, an overhead gantry crane
 * for the wide factory/warehouse. Purely cosmetic — they carry no simulation
 * meaning.
 */

import { useSim } from '@/state/store';
import { CELL, COLORS, floorHeight } from './constants';

const STEEL = COLORS.beam;
const YELLOW = '#e0a82e';

export function Decor() {
  const world = useSim((s) => s.world);
  const W = world.width * CELL;
  const D = world.height * CELL;
  const top = floorHeight(world.numFloors - 1);

  return world.scenario === 'apartment' ? (
    <TowerCrane W={W} D={D} top={top} />
  ) : (
    <GantryCrane W={W} D={D} top={top} />
  );
}

function TowerCrane({ W, D, top }: { W: number; D: number; top: number }) {
  const mastH = top + 6;
  const jibLen = W * 0.95;
  return (
    <group position={[W / 2 + 3.5, 0, -D / 2 - 1]}>
      <mesh position={[0, mastH / 2, 0]} castShadow>
        <boxGeometry args={[0.7, mastH, 0.7]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.6} />
      </mesh>
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
      <mesh position={[-jibLen * 0.6, mastH - 2.7, 0]}>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function GantryCrane({ W, D, top }: { W: number; D: number; top: number }) {
  const h = top + 2; // runway height, just above the roof
  const legX = W / 2 + 0.8;
  const legZ = D / 2;
  const trolleyX = -W * 0.18;

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

      {/* Runway beams along x on each side. */}
      <mesh position={[0, h, legZ]}>
        <boxGeometry args={[W + 2, 0.3, 0.35]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, h, -legZ]}>
        <boxGeometry args={[W + 2, 0.3, 0.35]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Bridge spanning across, with a trolley + hook. */}
      <mesh position={[trolleyX, h + 0.25, 0]}>
        <boxGeometry args={[0.4, 0.3, D + 1]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[trolleyX, h + 0.5, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.9]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[trolleyX, h - 1, 0]}>
        <boxGeometry args={[0.06, 2, 0.06]} />
        <meshStandardMaterial color="#11151c" />
      </mesh>
      <mesh position={[trolleyX, h - 2.1, 0]}>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}
