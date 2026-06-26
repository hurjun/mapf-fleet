import { describe, it, expect } from 'vitest';
import { Engine } from './engine';
import { buildWorld, DEFAULT_PARAMS } from './scenarios';
import { Cell } from './types';

/** Run a scenario and assert the core MAPF safety invariants hold every tick. */
function runAndCheck(scenario: 'apartment' | 'factory' | 'warehouse', robots: number, ticks: number) {
  const world = buildWorld(DEFAULT_PARAMS[scenario]);
  const engine = new Engine(world, { robotCount: robots, seed: 7 });

  let maxDeliveries = 0;
  for (let t = 0; t < ticks; t++) {
    engine.step();
    const snap = engine.snapshot();

    const occupied = new Map<string, number>();
    for (const r of snap.robots) {
      // Riders share the elevator car position, so they're exempt from the
      // one-robot-per-cell rule on the floor grid.
      if (r.phase === 'riding') continue;

      // Must stay in bounds and never stand on a wall.
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThan(world.width);
      expect(r.y).toBeLessThan(world.height);
      const cell = world.floors[r.floor].cells[r.y * world.width + r.x];
      expect(cell).not.toBe(Cell.Wall);

      // No two robots may occupy the same floor cell.
      const key = `${r.floor}|${r.x}|${r.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.set(key, r.id);
    }
    maxDeliveries = snap.metrics.deliveries;
  }
  return maxDeliveries;
}

describe('Engine (full simulation)', () => {
  it('keeps the apartment fleet collision-free and completes deliveries', () => {
    const deliveries = runAndCheck('apartment', 8, 1400);
    // Every apartment job crosses floors, so deliveries prove the elevator
    // pipeline (queue → board → ride → exit → navigate) works end to end.
    expect(deliveries).toBeGreaterThan(0);
  });

  it('keeps the factory fleet collision-free and completes deliveries', () => {
    const deliveries = runAndCheck('factory', 12, 1400);
    expect(deliveries).toBeGreaterThan(0);
  });

  it('keeps the warehouse fleet collision-free and completes deliveries', () => {
    const deliveries = runAndCheck('warehouse', 14, 1400);
    expect(deliveries).toBeGreaterThan(0);
  });

  it('respects the robot-count control and never exceeds spawn capacity', () => {
    const world = buildWorld(DEFAULT_PARAMS.apartment);
    const engine = new Engine(world, { robotCount: 5, seed: 1 });
    expect(engine.robotCount).toBe(5);
    engine.setRobotCount(15);
    expect(engine.robotCount).toBe(15);
    engine.setRobotCount(2);
    expect(engine.robotCount).toBe(2);
    for (let t = 0; t < 200; t++) engine.step();
    expect(engine.snapshot().robots).toHaveLength(2);
  });

  it('keeps the fleet charged via charging stations', () => {
    const world = buildWorld(DEFAULT_PARAMS.apartment);
    const engine = new Engine(world, { robotCount: 10, seed: 11 });
    for (let t = 0; t < 1600; t++) engine.step();
    const m = engine.snapshot().metrics;
    // Without working chargers the fleet would drain toward empty in ~800 ticks.
    expect(m.avgBattery).toBeGreaterThan(0.3);
    expect(m.deliveries).toBeGreaterThan(0);
  });
});
