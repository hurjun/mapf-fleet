'use client';

/**
 * Drives the simulation forward in real time, decoupled from the render rate.
 *
 * A fixed-timestep accumulator advances the engine `speed` ticks per second no
 * matter how fast the browser paints, so the simulation runs at a consistent
 * pace and never spirals if a frame is slow (the per-frame step count is
 * capped). Reads `running`/`speed` straight from the store each frame to avoid
 * stale closures.
 */

import { useEffect } from 'react';
import { useSim } from './store';

export function useSimLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const { running, speed, tick } = useSim.getState();

      // Clamp dt so a backgrounded/throttled tab (which pauses rAF) doesn't
      // return one huge frame and fast-forward the simulation in a burst.
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (!running) {
        accumulator = 0;
        return;
      }

      accumulator += dt;
      const interval = 1 / Math.max(1, speed);
      let steps = 0;
      const maxSteps = Math.max(2, Math.ceil(speed / 4));
      while (accumulator >= interval && steps < maxSteps) {
        tick();
        accumulator -= interval;
        steps += 1;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
