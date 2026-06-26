'use client';

/**
 * Visualizes construction progress: every completed delivery stacks an
 * "installed" panel at its dropoff cell, so install points visibly build up
 * over the run — the building gets built as the fleet works. One instanced mesh
 * holds all panels; matrices are only rebuilt when a delivery actually lands (or
 * the focused floor changes), not every frame.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { CELL, floorHeight, toScene } from './constants';

const CAP = 6; // max stacked panels shown per install point

export function Installs() {
  const world = useSim((s) => s.world);
  const dropoffs = useMemo(
    () => world.stations.filter((s) => s.role === 'dropoff').length,
    [world],
  );
  const max = Math.max(1, dropoffs * CAP);

  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastSig = useRef(-1);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const sim = useSim.getState();
    const installs = sim.snapshot.installs;

    // Rebuild only when something changed (total deliveries, or focus state).
    let total = 0;
    for (const k in installs) total += installs[k];
    const sig = total * 1000 + (sim.focusFloor ? 100 + sim.viewFloor : 0);
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    const W = world.width;
    const H = world.height;
    let i = 0;
    for (const key in installs) {
      const parts = key.split('|');
      const floor = +parts[0];
      const x = +parts[1];
      const y = +parts[2];
      if (sim.focusFloor && floor !== sim.viewFloor) continue;
      const c = Math.min(CAP, installs[key]);
      const [sx, , sz] = toScene(x, y, 0, W, H);
      for (let k = 0; k < c && i < max; k++) {
        dummy.position.set(sx, floorHeight(floor) + 0.18 + k * 0.16, sz);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    // Collapse the unused instances.
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (; i < max; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, max]}
      castShadow
      frustumCulled={false}
    >
      <boxGeometry args={[0.68 * CELL, 0.14, 0.68 * CELL]} />
      <meshStandardMaterial color="#9fb3d4" metalness={0.1} roughness={0.7} />
    </instancedMesh>
  );
}
