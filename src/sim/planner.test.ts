import { describe, it, expect } from 'vitest';
import { DistanceFieldCache, planMoves } from './planner';
import { Cell, FloorGrid, Robot, World } from './types';

/** An open single-floor world of the given size. */
function openWorld(width: number, height: number): World {
  const cells = new Uint8Array(width * height); // all Cell.Free (0)
  const floor: FloorGrid = { floor: 0, width, height, cells };
  return { scenario: 'factory', numFloors: 1, width, height, floors: [floor], elevators: [], stations: [] };
}

function robot(id: number, x: number, y: number, dx: number, dy: number): Robot {
  return {
    id,
    kind: 'cart',
    floor: 0,
    x,
    y,
    phase: 'to_pickup',
    carrying: false,
    task: null,
    dest: { floor: 0, x: dx, y: dy },
    nextX: x,
    nextY: y,
    yielding: false,
    elevatorId: null,
    targetFloor: null,
    dwell: 0,
    battery: 1,
    chargerId: null,
    plannedPath: [],
    deliveries: 0,
    waitTicks: 0,
    moveTicks: 0,
  };
}

describe('planMoves (prioritized planner)', () => {
  it('moves a lone robot toward its goal', () => {
    const world = openWorld(6, 1);
    const cache = new DistanceFieldCache(world);
    const r = robot(0, 0, 0, 5, 0);
    planMoves(world, [r], [], cache, 12);
    expect(r.nextX).toBe(1);
    expect(r.nextY).toBe(0);
  });

  it('never assigns two robots the same next cell (head-on)', () => {
    // Two robots on a narrow 2-row corridor swapping ends; plus crossing pairs.
    const world = openWorld(7, 3);
    const cache = new DistanceFieldCache(world);
    const robots = [
      robot(0, 0, 1, 6, 1),
      robot(1, 6, 1, 0, 1),
      robot(2, 3, 0, 3, 2),
      robot(3, 3, 2, 3, 0),
    ];
    for (let tick = 0; tick < 60; tick++) {
      planMoves(world, robots, [], cache, 14);
      const next = new Set<string>();
      for (const r of robots) {
        const key = `${r.nextX},${r.nextY}`;
        expect(next.has(key)).toBe(false); // no two robots into one cell
        next.add(key);
        r.x = r.nextX;
        r.y = r.nextY;
      }
    }
  });

  it('is deterministic, and the shuffle salt is reproducible', () => {
    const world = openWorld(8, 4);
    const cache = new DistanceFieldCache(world);
    const spec: Array<[number, number, number, number, number]> = [
      [0, 0, 0, 7, 3],
      [1, 7, 0, 0, 3],
      [2, 0, 3, 7, 0],
    ];
    const make = () => spec.map(([id, x, y, dx, dy]) => robot(id, x, y, dx, dy));

    const a = make();
    const b = make();
    planMoves(world, a, [], cache, 12, 1234);
    planMoves(world, b, [], cache, 12, 1234);
    for (let i = 0; i < a.length; i++) {
      expect([a[i].nextX, a[i].nextY]).toEqual([b[i].nextX, b[i].nextY]);
    }
  });

  it('routes around a static obstacle robot', () => {
    const world = openWorld(5, 3);
    const cache = new DistanceFieldCache(world);
    // Put a wall-like static occupant directly in the straight path.
    const mover = robot(0, 0, 1, 4, 1);
    const statics = [{ floor: 0, x: 2, y: 1 }];
    for (let tick = 0; tick < 30 && !(mover.x === 4 && mover.y === 1); tick++) {
      planMoves(world, [mover], statics, cache, 14);
      mover.x = mover.nextX;
      mover.y = mover.nextY;
      expect(world.floors[0].cells[mover.y * world.width + mover.x]).toBe(Cell.Free);
      expect(`${mover.x},${mover.y}`).not.toBe('2,1'); // never steps on the static
    }
    expect(mover.x).toBe(4);
    expect(mover.y).toBe(1);
  });
});
