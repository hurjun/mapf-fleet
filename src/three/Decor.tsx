'use client';

/**
 * Scenario-flavored decorative props (non-interactive) that reinforce the
 * setting. For the apartment high-rise, a tower crane looms over the site — an
 * instantly recognizable "construction" cue. Purely cosmetic; it carries no
 * simulation meaning.
 */

import { useSim } from '@/state/store';
import { CELL, COLORS, floorHeight } from './constants';

const STEEL = COLORS.beam;
const YELLOW = '#e0a82e';

export function Decor() {
  const world = useSim((s) => s.world);
  if (world.scenario !== 'apartment') return null;

  const W = world.width * CELL;
  const D = world.height * CELL;
  const top = floorHeight(world.numFloors - 1);
  const mastH = top + 6;
  const jibLen = W * 0.95;

  // Stand the crane just off the back-right corner; the jib reaches in over the
  // building (toward -x) so it looms above the site from the default view.
  return (
    <group position={[W / 2 + 3.5, 0, -D / 2 - 1]}>
      {/* Mast. */}
      <mesh position={[0, mastH / 2, 0]} castShadow>
        <boxGeometry args={[0.7, mastH, 0.7]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Operator cab. */}
      <mesh position={[0, mastH, 0]}>
        <boxGeometry args={[1.1, 0.9, 1.1]} />
        <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Working jib reaching in over the site. */}
      <mesh position={[-jibLen / 2, mastH + 0.7, 0]}>
        <boxGeometry args={[jibLen, 0.24, 0.32]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Counter-jib + counterweight. */}
      <mesh position={[2, mastH + 0.7, 0]}>
        <boxGeometry args={[4, 0.24, 0.32]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[3.6, mastH + 0.25, 0]}>
        <boxGeometry args={[1.1, 0.9, 0.8]} />
        <meshStandardMaterial color="#3b485f" />
      </mesh>
      {/* Hoist cable + hook block over the building. */}
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
