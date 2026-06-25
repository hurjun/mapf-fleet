'use client';

/**
 * The R3F canvas: lighting, shadows, camera, orbit controls, and the three
 * content layers (building, elevators, fleet). Kept free of any window/WebGL
 * access at module scope so it can be dynamically imported with SSR disabled.
 */

import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSim } from '@/state/store';
import { World } from '@/sim/types';
import { Building } from './Building';
import { Elevators } from './Elevators';
import { Fleet } from './Fleet';
import { FLOOR_GAP } from './constants';

export default function Scene() {
  const world = useSim((s) => s.world);
  const span = Math.max(world.width, world.height);
  const top = (world.numFloors - 1) * FLOOR_GAP;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [span * 0.72, top + span * 0.42, span * 0.72], fov: 42 }}
    >
      <color attach="background" args={['#0a0c12']} />
      <fog attach="fog" args={['#0a0c12', span * 2.2, span * 6]} />

      <hemisphereLight intensity={0.55} color="#cde3ff" groundColor="#1a2030" />
      <ambientLight intensity={0.25} />
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

      <Building world={world} />
      <Elevators />
      <Fleet />

      <CameraRig world={world} />
    </Canvas>
  );
}

/** Reframes the camera/target whenever the building's footprint changes. */
function CameraRig({ world }: { world: World }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);

  useEffect(() => {
    const span = Math.max(world.width, world.height);
    const top = (world.numFloors - 1) * FLOOR_GAP;
    camera.position.set(span * 0.72, top + span * 0.42, span * 0.72);
    camera.near = 0.1;
    camera.far = span * 10;
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.set(0, top * 0.4, 0);
      controls.current.update();
    }
  }, [world, camera]);

  const span = Math.max(world.width, world.height);
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={6}
      maxDistance={span * 5}
    />
  );
}
