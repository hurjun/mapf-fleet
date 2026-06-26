import { describe, it, expect } from 'vitest';
import { Engine } from './engine';
import { buildWorld, DEFAULT_PARAMS } from './scenarios';
import { Cell } from './types';

/** Run a scenario under the CBS planner and assert the safety invariants. */
function runCBS(scenario: 'apartment' | 'factory', robots: number, ticks: number) {
  const world = buildWorld(DEFAULT_PARAMS[scenario]);
  const engine = new Engine(world, { robotCount: robots, seed: 5, planner: 'cbs' });

  for (let t = 0; t < ticks; t++) {
    engine.step();
    const snap = engine.snapshot();
    const occupied = new Set<string>();
    for (const r of snap.robots) {
      if (r.phase === 'riding') continue;
      const cell = world.floors[r.floor].cells[r.y * world.width + r.x];
      expect(cell).not.toBe(Cell.Wall);
      const key = `${r.floor}|${r.x}|${r.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  }
  return engine.snapshot().metrics.deliveries;
}

describe('CBS planner', () => {
  it('keeps the fleet collision-free and delivers (apartment)', () => {
    expect(runCBS('apartment', 6, 500)).toBeGreaterThan(0);
  });

  it('keeps the fleet collision-free and delivers (factory)', () => {
    expect(runCBS('factory', 8, 500)).toBeGreaterThan(0);
  });

  it('can switch planners live without breaking the run', () => {
    const world = buildWorld(DEFAULT_PARAMS.factory);
    const engine = new Engine(world, { robotCount: 8, seed: 3 });
    for (let t = 0; t < 200; t++) engine.step();
    engine.setPlanner('cbs');
    for (let t = 0; t < 200; t++) {
      engine.step();
      const snap = engine.snapshot();
      const occupied = new Set<string>();
      for (const r of snap.robots) {
        if (r.phase === 'riding') continue;
        const key = `${r.floor}|${r.x}|${r.y}`;
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
    expect(engine.snapshot().metrics.deliveries).toBeGreaterThan(0);
  });
});
