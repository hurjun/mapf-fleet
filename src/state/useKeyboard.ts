'use client';

/**
 * Global keyboard shortcuts. Reads actions from the store on each keypress to
 * avoid stale closures, and ignores keys while a form control (e.g. a slider)
 * is focused so its own arrow/space handling still works.
 */

import { useEffect } from 'react';
import { useSim } from './store';

export function useKeyboard(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;

      const s = useSim.getState();
      switch (e.key) {
        case ' ':
          e.preventDefault();
          s.togglePlay();
          break;
        case 's':
        case 'S':
          s.stepOnce();
          break;
        case 'p':
        case 'P':
          s.setShowPaths(!s.showPaths);
          break;
        case 'f':
        case 'F':
          s.setFocusFloor(!s.focusFloor);
          break;
        case '1':
          s.setCameraPreset('iso');
          break;
        case '2':
          s.setCameraPreset('top');
          break;
        case '3':
          s.setCameraPreset('side');
          break;
        case 'ArrowUp':
          e.preventDefault();
          s.setViewFloor(s.viewFloor + 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          s.setViewFloor(s.viewFloor - 1);
          break;
        case '[':
          s.setSpeed(Math.max(1, s.speed - 1));
          break;
        case ']':
          s.setSpeed(Math.min(20, s.speed + 1));
          break;
        case 'Escape':
          s.setSelected(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
