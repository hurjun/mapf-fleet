'use client';

/**
 * Visualizes construction progress: every completed delivery lays one 강마루
 * (engineered-wood) flooring tile at its dropoff cell, so install points visibly
 * build up into a small parquet pad over the run — the floor gets laid as the
 * fleet works. One instanced mesh holds all tiles; matrices are only rebuilt
 * when a delivery actually lands (or the focused floor changes), not every frame.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { CELL, floorHeight, toScene } from './constants';

const CAP = 6; // max stacked tiles shown per install point

/** Engineered-wood (강마루) plank tones, varied per tile for a laid-floor look. */
const WOOD = ['#caa06a', '#b5824a', '#9c6b3f', '#d8b277'].map((c) => new THREE.Color(c));

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
        dummy.position.set(sx, floorHeight(floor) + 0.12 + k * 0.07, sz);
        // Alternate each course 90° for a parquet/laid-plank look.
        dummy.rotation.set(0, k % 2 === 0 ? 0 : Math.PI / 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        const h =
          (Math.imul(floor + 1, 374761393) ^
            Math.imul(x + 1, 668265263) ^
            Math.imul(y + 1, 2246822519) ^
            Math.imul(k + 1, 3266489917)) >>>
          0;
        mesh.setColorAt(i, WOOD[h % WOOD.length]);
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    // Collapse the unused instances.
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (; i < max; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, max]}
      castShadow
      frustumCulled={false}
    >
      <boxGeometry args={[0.82 * CELL, 0.06, 0.82 * CELL]} />
      <meshStandardMaterial color="#ffffff" metalness={0.05} roughness={0.62} />
    </instancedMesh>
  );
}
