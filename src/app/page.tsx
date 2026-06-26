'use client';

import { useEffect, useState } from 'react';
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
import { Segmented } from '@/components/ui';

// The 3D scene touches WebGL/window, so it must only render on the client.
const Scene = dynamic(() => import('@/three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      Loading 3D scene…
    </div>
  ),
});

type MobileTab = 'controls' | 'stats';

const MOBILE_TABS: Array<{ value: MobileTab; label: string }> = [
  { value: 'controls', label: 'Controls' },
  { value: 'stats', label: 'Stats' },
];

export default function Page() {
  useSimLoop();
  useKeyboard();
  useUrlSync();

  const uiHidden = useSim((s) => s.uiHidden);
  const setUiHidden = useSim((s) => s.setUiHidden);
  const [mobileTab, setMobileTab] = useState<MobileTab>('controls');

  // Respect the OS "reduce motion" preference by turning off the bloom glow.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      useSim.getState().setBloom(false);
    }
  }, []);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Scene />

      {/* Compact app title (mobile only). */}
      <div className="pointer-events-none absolute left-3 top-3 z-30 md:hidden">
        <span className="rounded-md bg-panel px-2 py-1 text-xs font-semibold text-white/85 backdrop-blur-md">
          MAPF Fleet
        </span>
      </div>

      {/* Hide/show panels — useful for clean, unobstructed 3D captures. */}
      <button
        onClick={() => setUiHidden(!uiHidden)}
        className="pointer-events-auto absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-panel px-3 py-1 text-[11px] text-white/60 shadow-xl backdrop-blur-md transition-colors hover:text-accent"
        title="Toggle panels (U)"
      >
        {uiHidden ? 'Show panels' : 'Hide panels'}
      </button>

      {!uiHidden && (
        <>
          {/* Desktop: two floating columns. The container ignores pointer
              events; each panel re-enables them so the canvas stays draggable. */}
          <div className="pointer-events-none absolute inset-0 hidden items-start justify-between gap-3 p-4 md:flex">
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

          {/* Mobile: a bottom sheet with Controls / Stats tabs. */}
          <div className="absolute inset-x-0 bottom-0 z-30 md:hidden">
            <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-panel shadow-2xl backdrop-blur-md">
              <div className="border-b border-white/10 p-2">
                <Segmented options={MOBILE_TABS} value={mobileTab} onChange={setMobileTab} />
              </div>
              <div className="max-h-[58vh] space-y-3 overflow-y-auto p-3">
                {mobileTab === 'controls' ? (
                  <>
                    <ControlPanel />
                    <Minimap />
                    <Legend />
                  </>
                ) : (
                  <>
                    <RobotInspector />
                    <StatsPanel />
                    <OptimizerCard />
                    <TimeSeriesPanel />
                    <BenchmarkCard />
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <HelpOverlay />
    </main>
  );
}
