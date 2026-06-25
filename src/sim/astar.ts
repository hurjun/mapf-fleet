/**
 * A* searches over a floor grid.
 *
 *  - `findPath`           : classic single-agent shortest path (used in tests
 *                           and by the offline distance estimates).
 *  - `spaceTimeAStar`     : cooperative, windowed A* over (x, y, t) that avoids
 *                           cells/edges another robot has already reserved. This
 *                           is the core of the prioritized MAPF planner.
 */

import { MinHeap } from './heap';
import { ReservationTable } from './reservation';
import { Coord, FloorGrid } from './types';
import { DIRS, distanceField, idx, isWalkable, manhattan } from './grid';

/** Classic A*. Returns the cell path from start to goal inclusive, or null. */
export function findPath(
  grid: FloorGrid,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): Coord[] | null {
  if (!isWalkable(grid, sx, sy) || !isWalkable(grid, gx, gy)) return null;

  const { width } = grid;
  const open = new MinHeap<number>();
  const gScore = new Map<number, number>();
  const parent = new Map<number, number>();

  const start = idx(sx, sy, width);
  const goal = idx(gx, gy, width);
  gScore.set(start, 0);
  open.push(start, manhattan(sx, sy, gx, gy));

  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goal) return reconstruct(parent, cur, width);
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const g = gScore.get(cur)!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      const ni = idx(nx, ny, width);
      const ng = g + 1;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        parent.set(ni, cur);
        open.push(ni, ng + manhattan(nx, ny, gx, gy));
      }
    }
  }
  return null;
}

function reconstruct(parent: Map<number, number>, end: number, width: number): Coord[] {
  const path: Coord[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    const x = cur % width;
    path.push({ x, y: (cur - x) / width });
    cur = parent.get(cur);
  }
  return path.reverse();
}

export interface SpaceTimeRequest {
  grid: FloorGrid;
  start: Coord;
  goal: Coord;
  /** Precomputed reverse-BFS distances from the goal (see `distanceField`). */
  heuristic: Int32Array;
  reservation: ReservationTable;
  /** Planning horizon in ticks. */
  window: number;
  /** Safety cap on node expansions. */
  maxExpansions?: number;
}

export interface SpaceTimeResult {
  /** The cell to move into next tick (equals start when the robot must wait). */
  next: Coord;
  /** Planned path within the window, path[0] = start at t=0. */
  path: Coord[];
  /** Whether the goal was reached inside the window. */
  reachedGoal: boolean;
}

/**
 * Windowed cooperative A* in the (x, y, t) state space.
 *
 * If the goal is reachable within the window it returns the optimal path to it.
 * Otherwise it returns the path to the reachable state closest to the goal so
 * the robot still makes progress instead of stalling — classic WHCA* behaviour.
 */
export function spaceTimeAStar(req: SpaceTimeRequest): SpaceTimeResult {
  const { grid, start, goal, heuristic, reservation, window } = req;
  const maxExpansions = req.maxExpansions ?? 6000;
  const floor = grid.floor;
  const W = grid.width;

  const h = (x: number, y: number): number => {
    const d = heuristic[idx(x, y, W)];
    return d < 0 ? 1e9 : d;
  };

  const open = new MinHeap<string>();
  const parent = new Map<string, string>();
  const seen = new Set<string>();

  const startKey = key(start.x, start.y, 0);
  open.push(startKey, h(start.x, start.y));
  seen.add(startKey);

  // Track the best (closest to goal, then earliest) state in case the goal is
  // unreachable inside the window.
  let bestKey = startKey;
  let bestH = h(start.x, start.y);
  let bestT = 0;

  let goalKey: string | null = null;
  let expansions = 0;

  while (open.size > 0 && expansions < maxExpansions) {
    const curKey = open.pop()!;
    const [cx, cy, ct] = parse(curKey);
    expansions++;

    if (cx === goal.x && cy === goal.y) {
      goalKey = curKey;
      break;
    }

    const curH = h(cx, cy);
    if (curH < bestH || (curH === bestH && ct < bestT)) {
      bestH = curH;
      bestT = ct;
      bestKey = curKey;
    }

    if (ct >= window) continue;
    const nt = ct + 1;

    // Candidate actions: wait in place, or step to a 4-neighbour.
    for (let d = -1; d < DIRS.length; d++) {
      const nx = d < 0 ? cx : cx + DIRS[d][0];
      const ny = d < 0 ? cy : cy + DIRS[d][1];
      if (!isWalkable(grid, nx, ny)) continue;
      if (reservation.isVertexReserved(floor, nx, ny, nt)) continue;
      const moving = !(nx === cx && ny === cy);
      if (moving && reservation.isEdgeReserved(floor, cx, cy, nx, ny, ct)) continue;

      const nk = key(nx, ny, nt);
      if (seen.has(nk)) continue;
      seen.add(nk);
      parent.set(nk, curKey);
      open.push(nk, nt + h(nx, ny));
    }
  }

  const endKey = goalKey ?? bestKey;
  const path = backtrack(parent, endKey);
  const next = path.length > 1 ? path[1] : path[0];
  return { next, path, reachedGoal: goalKey !== null };
}

function key(x: number, y: number, t: number): string {
  return `${x},${y},${t}`;
}

function parse(k: string): [number, number, number] {
  const c = k.split(',');
  return [+c[0], +c[1], +c[2]];
}

function backtrack(parent: Map<string, string>, endKey: string): Coord[] {
  const path: Coord[] = [];
  let k: string | undefined = endKey;
  while (k !== undefined) {
    const [x, y] = parse(k);
    path.push({ x, y });
    k = parent.get(k);
  }
  return path.reverse();
}

// Re-export so callers can build heuristics from one module.
export { distanceField };
