'use client';

import dynamic from 'next/dynamic';
import { useSim } from '@/state/store';
import { useSimLoop } from '@/state/useSimLoop';
import { useKeyboard } from '@/state/useKeyboard';
import { useUrlSync } from '@/state/useUrlSync';
import { Header } from '@/components/Header';
import { ControlPanel } from '@/components/ControlPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { OptimizerCard } from '@/components/OptimizerCard';
import { Legend } from '@/components/Legend';
import { RobotInspector } from '@/components/RobotInspector';
import { TimeSeriesPanel } from '@/components/TimeSeriesPanel';
import { Minimap } from '@/components/Minimap';
import { HelpOverlay } from '@/components/HelpOverlay';
import { BenchmarkCard } from '@/components/BenchmarkCard';

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
  useKeyboard();
  useUrlSync();

  const uiHidden = useSim((s) => s.uiHidden);
  const setUiHidden = useSim((s) => s.setUiHidden);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Scene />

      {/* Hide/show panels — useful for clean, unobstructed 3D captures. */}
      <button
        onClick={() => setUiHidden(!uiHidden)}
        className="pointer-events-auto absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-panel px-3 py-1 text-[11px] text-white/60 shadow-xl backdrop-blur-md transition-colors hover:text-accent"
        title="Toggle panels (U)"
      >
        {uiHidden ? 'Show panels' : 'Hide panels'}
      </button>

      {/* Control overlay. The container ignores pointer events; each panel
          re-enables them so the canvas stays draggable in the gaps. */}
      {!uiHidden && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-4">
          <div
            className="flex w-72 max-w-[44vw] flex-col gap-3 overflow-y-auto pr-1"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <Header />
            <ControlPanel />
            <Minimap />
            <Legend />
          </div>

          <div
            className="flex w-72 max-w-[44vw] flex-col gap-3 overflow-y-auto pl-1"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <RobotInspector />
            <StatsPanel />
            <OptimizerCard />
            <TimeSeriesPanel />
            <BenchmarkCard />
          </div>
        </div>
      )}

      <HelpOverlay />
    </main>
  );
}
