/**
 * Prioritized multi-agent planner (the "cooperative" layer on top of A*).
 *
 * Every navigating robot is planned in priority order against a shared
 * reservation table. Higher-priority robots reserve their planned trajectory
 * over a short window; lower-priority robots then route around those
 * reservations — and when the only option is to stand still, they yield. This
 * is the classic Windowed Hierarchical Cooperative A* (WHCA*) scheme.
 */

import { spaceTimeAStar } from './astar';
import { distanceField } from './grid';
import { ReservationTable } from './reservation';
import { Robot, World } from './types';

/** Caches reverse-BFS distance fields; they depend only on the static walls. */
export class DistanceFieldCache {
  private cache = new Map<string, Int32Array>();
  constructor(private readonly world: World) {}

  get(floor: number, gx: number, gy: number): Int32Array {
    const key = `${floor}|${gx}|${gy}`;
    let field = this.cache.get(key);
    if (!field) {
      field = distanceField(this.world.floors[floor], gx, gy);
      this.cache.set(key, field);
    }
    return field;
  }
}

export interface StaticObstacle {
  floor: number;
  x: number;
  y: number;
}

/**
 * Decide each navigating robot's next step. Mutates `robot.nextX/nextY` and
 * `robot.yielding`. Stationary robots are passed in as `statics` so movers plan
 * around them.
 */
export function planMoves(
  world: World,
  navigating: Robot[],
  statics: StaticObstacle[],
  cache: DistanceFieldCache,
  window: number,
): void {
  const reservation = new ReservationTable();

  // Robots that aren't moving hold their cell for the whole window.
  for (const s of statics) {
    reservation.reserveStatic(s.floor, s.x, s.y, 1, window);
  }

  // Priority: loaded robots first (don't make a full robot detour), then the
  // robot that has waited longest (breaks symmetric stand-offs over time),
  // then by id for determinism.
  const order = [...navigating].sort((a, b) => {
    if (a.carrying !== b.carrying) return a.carrying ? -1 : 1;
    if (a.waitTicks !== b.waitTicks) return b.waitTicks - a.waitTicks;
    return a.id - b.id;
  });

  for (let i = 0; i < order.length; i++) {
    const robot = order[i];
    if (!robot.dest) {
      robot.nextX = robot.x;
      robot.nextY = robot.y;
      continue;
    }

    // A not-yet-planned (lower-priority) robot might not move, so block its
    // current cell at the next tick. Only the t=1 step is ever executed, so
    // this is exactly what guarantees no two robots land on the same cell.
    const temps: Array<[number, number, number]> = [];
    for (let j = i + 1; j < order.length; j++) {
      const o = order[j];
      if (o.floor !== robot.floor) continue;
      if (reservation.isVertexReserved(o.floor, o.x, o.y, 1)) continue;
      reservation.reserveVertex(o.floor, o.x, o.y, 1);
      temps.push([o.floor, o.x, o.y]);
    }

    const grid = world.floors[robot.floor];
    const heuristic = cache.get(robot.floor, robot.dest.x, robot.dest.y);
    const result = spaceTimeAStar({
      grid,
      start: { x: robot.x, y: robot.y },
      goal: { x: robot.dest.x, y: robot.dest.y },
      heuristic,
      reservation,
      window,
    });

    for (const [f, x, y] of temps) reservation.freeVertex(f, x, y, 1);

    robot.nextX = result.next.x;
    robot.nextY = result.next.y;
    const atDest = robot.x === robot.dest.x && robot.y === robot.dest.y;
    robot.yielding = !atDest && result.next.x === robot.x && result.next.y === robot.y;

    reservePath(reservation, robot.floor, result.path, window);
  }
}

function reservePath(
  reservation: ReservationTable,
  floor: number,
  path: { x: number; y: number }[],
  window: number,
): void {
  for (let i = 1; i < path.length; i++) {
    reservation.reserveVertex(floor, path[i].x, path[i].y, i);
    reservation.reserveEdge(floor, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y, i - 1);
  }
  // The robot lingers at the end of its planned path; hold that cell too.
  const last = path[path.length - 1];
  for (let t = path.length; t <= window; t++) {
    reservation.reserveVertex(floor, last.x, last.y, t);
  }
}
