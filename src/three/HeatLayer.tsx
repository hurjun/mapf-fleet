'use client';

/**
 * Congestion heatmap for the viewed floor. One additively-blended quad per cell;
 * its color is driven each frame by the engine's decaying congestion field, so
 * hotspots (elevator queues, pinch points) glow. Black cells contribute nothing
 * under additive blending, so empty space stays clear.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { CELL, floorHeight, toScene } from './constants';

const REF = 14; // congestion value mapped to full intensity

export function HeatLayer() {
  const show = useSim((s) => s.showHeat);
  const world = useSim((s) => s.world);
  const viewFloor = useSim((s) => s.viewFloor);
  const W = world.width;
  const H = world.height;
  const count = W * H;

  const ref = useRef<THREE.InstancedMesh>(null);
  const color = useMemo(() => new THREE.Color(), []);

  // Lay out one quad per cell whenever the floor or footprint changes.
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [sx, , sz] = toScene(x, y, 0, W, H);
        o.position.set(sx, floorHeight(viewFloor) + 0.28, sz);
        o.rotation.set(-Math.PI / 2, 0, 0);
        o.updateMatrix();
        mesh.setMatrixAt(y * W + x, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [W, H, viewFloor, count]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = show;
    if (!show) return;

    const heat = useSim.getState().heatAt(viewFloor);
    for (let i = 0; i < count; i++) {
      const v = Math.min(1, (heat[i] || 0) / REF);
      // Ramp from green → red, scaled by intensity (0 ⇒ black ⇒ invisible).
      color.setRGB(v * v, (1 - v) * v * 0.7, 0);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      // geometry/material come from the children; only the count matters here.
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, count]}
      frustumCulled={false}
    >
      <planeGeometry args={[CELL * 0.96, CELL * 0.96]} />
      <meshBasicMaterial
        transparent
        opacity={0.85}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
