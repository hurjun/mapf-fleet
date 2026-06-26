'use client';

/**
 * The R3F canvas: lighting, shadows, camera, orbit controls, and the three
 * content layers (building, elevators, fleet). Kept free of any window/WebGL
 * access at module scope so it can be dynamically imported with SSR disabled.
 */

import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSim } from '@/state/store';
import { World } from '@/sim/types';
import { Building } from './Building';
import { Decor } from './Decor';
import { Elevators } from './Elevators';
import { Fleet } from './Fleet';
import { Installs } from './Installs';
import { SelectedPath } from './SelectedPath';
import { AllPaths } from './AllPaths';
import { HeatLayer } from './HeatLayer';
import { Trails } from './Trails';
import { FLOOR_GAP, floorHeight, toScene } from './constants';

export default function Scene() {
  const world = useSim((s) => s.world);
  const bloom = useSim((s) => s.bloom);
  const span = Math.max(world.width, world.height);
  const top = (world.numFloors - 1) * FLOOR_GAP;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [span * 0.85, top * 0.55 + span * 0.5, span * 0.85], fov: 42 }}
      onPointerMissed={() => useSim.getState().setSelected(null)}
    >
      <color attach="background" args={['#0a0c12']} />
      <fog attach="fog" args={['#0a0c12', span * 2.2, span * 6]} />

      <hemisphereLight intensity={0.5} color="#cde3ff" groundColor="#171c28" />
      <ambientLight intensity={0.2} />
      {/* Key light (casts shadows). */}
      <directionalLight
        position={[span * 0.8, top + span, span * 0.5]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={span * 6}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
      />
      {/* Cool fill from the opposite side for depth, and a warm worksite glow. */}
      <directionalLight position={[-span * 0.7, top * 0.6 + span * 0.3, -span * 0.6]} intensity={0.45} color="#9fb8ff" />
      <pointLight position={[0, top * 0.35 + 2, 0]} intensity={0.35} color="#ffd9a0" distance={span * 2.5} decay={2} />

      <Building world={world} />
      <Decor />
      <Installs />
      <Elevators />
      <Fleet />
      <HeatLayer />
      <Trails />
      <AllPaths />
      <SelectedPath />

      <CameraRig world={world} />

      {bloom && (
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.7}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.2}
            radius={0.6}
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/**
 * Frames the camera. Reapplies whenever the building changes, a camera preset
 * is selected, or single-floor focus is toggled / its floor changes.
 */
function CameraRig({ world }: { world: World }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);

  const preset = useSim((s) => s.cameraPreset);
  const nonce = useSim((s) => s.cameraNonce);
  const focusFloor = useSim((s) => s.focusFloor);
  const viewFloor = useSim((s) => s.viewFloor);
  const autoRotate = useSim((s) => s.autoRotate);

  // Only the focused floor affects framing; in free-orbit mode, changing the
  // minimap floor must NOT reset the camera (focusKey stays -1 then).
  const focusKey = focusFloor ? viewFloor : -1;

  useEffect(() => {
    const span = Math.max(world.width, world.height);
    const top = (world.numFloors - 1) * FLOOR_GAP;

    let pos: [number, number, number];
    let target: [number, number, number];

    if (focusFloor) {
      const fy = focusKey * FLOOR_GAP; // focusKey === viewFloor when focusing
      pos = [span * 0.5, fy + span * 0.6, span * 0.5];
      target = [0, fy, 0];
    } else if (preset === 'top') {
      pos = [0.001, top + span * 1.5, 0.001];
      target = [0, top * 0.3, 0];
    } else if (preset === 'side') {
      pos = [0, top * 0.55, span * 1.35];
      target = [0, top * 0.4, 0];
    } else {
      // Side-on isometric so a tall floor stack separates clearly.
      pos = [span * 0.85, top * 0.55 + span * 0.5, span * 0.85];
      target = [0, top * 0.42, 0];
    }

    camera.position.set(...pos);
    camera.near = 0.1;
    camera.far = span * 12;
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.set(...target);
      controls.current.update();
    }
  }, [world, camera, preset, nonce, focusFloor, focusKey]);

  // Smoothly follow the selected robot: shift the orbit target (and camera by
  // the same delta, preserving the user's angle/zoom) toward the robot each frame.
  const follow = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const s = useSim.getState();
    if (!s.followSelected || s.selectedRobotId == null || !controls.current) return;
    const r = s.snapshot.robots.find((x) => x.id === s.selectedRobotId);
    if (!r) return;
    const [x, , z] = toScene(r.x, r.y, 0, world.width, world.height);
    const y = (r.phase === 'riding' ? floorHeight(r.ride) : floorHeight(r.floor)) + 0.3;
    follow.current.set(x, y, z);
    const target = controls.current.target as THREE.Vector3;
    const step = follow.current.sub(target).multiplyScalar(Math.min(1, dt * 3));
    target.add(step);
    camera.position.add(step);
    controls.current.update();
  });

  const span = Math.max(world.width, world.height);
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate}
      autoRotateSpeed={0.4}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={6}
      maxDistance={span * 5}
    />
  );
}
