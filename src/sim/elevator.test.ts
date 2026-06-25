import { describe, it, expect } from 'vitest';
import { ElevatorController, ElevatorContext } from './elevator';
import { Elevator } from './types';

function makeElevator(): Elevator {
  return {
    id: 0,
    x: 5,
    y: 5,
    inCell: { x: 4, y: 5 },
    outCell: { x: 6, y: 5 },
    floors: [0, 1, 2, 3],
    capacity: 2,
    travelTicksPerFloor: 2,
    doorTicks: 2,
  };
}

/** Drive the car for up to `maxTicks`, rebuilding context from `waiting`. */
function run(
  car: ElevatorController,
  waiting: Map<number, { robotId: number; targetFloor: number }>,
  onUnload: (robotId: number, floor: number) => void,
  maxTicks = 200,
): number {
  let ticks = 0;
  while (ticks < maxTicks && (waiting.size > 0 || car.riderCount > 0)) {
    const ctx: ElevatorContext = {
      callFloors: new Set(waiting.keys()),
      boarder: (f) => waiting.get(f),
      onBoard: (id) => {
        for (const [f, r] of [...waiting]) if (r.robotId === id) waiting.delete(f);
      },
      onUnload: (id, floor) => {
        onUnload(id, floor);
        return true;
      },
    };
    car.step(ctx);
    ticks++;
  }
  return ticks;
}

describe('ElevatorController', () => {
  it('carries a waiting robot to its target floor', () => {
    const car = new ElevatorController(makeElevator(), 0);
    const waiting = new Map([[0, { robotId: 1, targetFloor: 3 }]]);
    let unloadedAt: number | null = null;

    // Keep stepping a bit past pickup so the rider reaches and exits floor 3.
    let ticks = 0;
    while (ticks < 200 && unloadedAt === null) {
      const ctx: ElevatorContext = {
        callFloors: new Set(waiting.keys()),
        boarder: (f) => waiting.get(f),
        onBoard: (id) => {
          for (const [f, r] of [...waiting]) if (r.robotId === id) waiting.delete(f);
        },
        onUnload: (_id, floor) => {
          unloadedAt = floor;
          return true;
        },
      };
      car.step(ctx);
      ticks++;
    }

    expect(unloadedAt).toBe(3);
    expect(car.riderCount).toBe(0);
    expect(car.currentFloor).toBe(3);
  });

  it('serves robots on multiple floors and ends idle', () => {
    const car = new ElevatorController(makeElevator(), 0);
    const waiting = new Map([
      [0, { robotId: 1, targetFloor: 2 }],
      [3, { robotId: 2, targetFloor: 1 }],
    ]);
    const unloads: Array<[number, number]> = [];
    run(car, waiting, (id, floor) => unloads.push([id, floor]));

    // Both riders eventually picked up and dropped at their targets.
    expect(unloads).toContainEqual([1, 2]);
    expect(unloads).toContainEqual([2, 1]);
    expect(car.riderCount).toBe(0);
  });

  it('stays idle when there is nothing to do', () => {
    const car = new ElevatorController(makeElevator(), 0);
    const ctx: ElevatorContext = {
      callFloors: new Set(),
      boarder: () => undefined,
      onBoard: () => {},
      onUnload: () => true,
    };
    for (let i = 0; i < 10; i++) car.step(ctx);
    expect(car.state).toBe('idle');
    expect(car.floorPos).toBe(0);
  });
});
