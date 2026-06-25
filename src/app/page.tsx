'use client';

import dynamic from 'next/dynamic';
import { useSimLoop } from '@/state/useSimLoop';
import { Header } from '@/components/Header';
import { ControlPanel } from '@/components/ControlPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { OptimizerCard } from '@/components/OptimizerCard';
import { Legend } from '@/components/Legend';

// The 3D scene touches WebGL/window, so it must only render on the client.
const Scene = dynamic(() => import('@/three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      Loading 3D scene…
    </div>
  ),
});

export default function Page() {
  useSimLoop();

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Scene />

      {/* Control overlay. The container ignores pointer events; each panel
          re-enables them so the canvas stays draggable in the gaps. */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-4">
        <div
          className="flex w-72 max-w-[44vw] flex-col gap-3 overflow-y-auto pr-1"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          <Header />
          <ControlPanel />
          <Legend />
        </div>

        <div
          className="flex w-72 max-w-[44vw] flex-col gap-3 overflow-y-auto pl-1"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          <StatsPanel />
          <OptimizerCard />
        </div>
      </div>
    </main>
  );
}
