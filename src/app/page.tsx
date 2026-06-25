'use client';

import dynamic from 'next/dynamic';
import { useSimLoop } from '@/state/useSimLoop';

// The 3D scene touches WebGL/window, so it must only render on the client.
const Scene = dynamic(() => import('@/three/Scene'), { ssr: false });

export default function Page() {
  useSimLoop();

  return (
    <main className="relative h-full w-full">
      <Scene />
    </main>
  );
}
