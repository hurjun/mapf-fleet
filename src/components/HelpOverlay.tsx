'use client';

/**
 * A dismissible help / onboarding overlay plus the floating "?" button that
 * opens it. Auto-opens once on a visitor's first visit (tracked in
 * localStorage), then only on demand.
 */

import { useEffect } from 'react';
import { useSim } from '@/state/store';
import { STATE_LEGEND } from '@/three/constants';

const SEEN_KEY = 'mapf-help-seen';

export function HelpOverlay() {
  const open = useSim((s) => s.helpOpen);
  const setHelpOpen = useSim((s) => s.setHelpOpen);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setHelpOpen(true);
        localStorage.setItem(SEEN_KEY, '1');
      }
    } catch {
      // localStorage unavailable (e.g. privacy mode) — just skip auto-open.
    }
  }, [setHelpOpen]);

  return (
    <>
      <button
        onClick={() => setHelpOpen(true)}
        className="pointer-events-auto absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-panel text-white/70 shadow-xl backdrop-blur-md transition-colors hover:text-accent md:bottom-4 md:right-4 md:top-auto"
        aria-label="Open help"
        title="Help"
      >
        ?
      </button>

      {open && (
        <div
          className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto break-words rounded-xl border border-white/10 bg-panel p-4 shadow-2xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">MAPF Fleet — quick guide</h2>
                <p className="mt-1 text-xs leading-snug text-white/50">
                  A multi-agent path-finding fleet working a multi-floor construction site. Robots
                  avoid collisions, yield, and queue for elevators.
                </p>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                className="rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
                aria-label="Close help"
              >
                ✕
              </button>
            </div>

            <Bullets title="Interact">
              <li>Drag to orbit · scroll to zoom.</li>
              <li>Click a robot to inspect it and see its planned path.</li>
              <li>Click empty space to deselect.</li>
            </Bullets>

            <Bullets title="Try">
              <li>Switch scenario (apartment / factory / warehouse).</li>
              <li>Change floors, elevators, and fleet size live.</li>
              <li>Hit “Apply” to deploy the optimizer’s recommended fleet.</li>
              <li>Toggle CBS, single-floor focus, paths, heatmap, and trails.</li>
            </Bullets>

            <Block title="Robot colors">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {STATE_LEGEND.map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-white/60">{s.label}</span>
                  </div>
                ))}
              </div>
            </Block>

            <Bullets title="Shortcuts">
              <li>Space play/pause · S step · P paths · F focus · ? help</li>
              <li>1/2/3 camera · ↑/↓ floor · [ / ] speed · U panels · Esc close</li>
            </Bullets>
          </div>
        </div>
      )}
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullets({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Block title={title}>
      <ul className="grid list-disc gap-1 pl-4 text-xs leading-snug text-white/70 marker:text-white/30">
        {children}
      </ul>
    </Block>
  );
}
