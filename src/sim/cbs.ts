/**
 * Conflict-Based Search (CBS) — an optimal multi-agent path-finding planner,
 * offered as a selectable alternative to the fast prioritized planner.
 *
 * CBS is a two-level search (Sharon et al., 2015):
 *
 *   - Low level: a single-agent space-time A* that obeys a set of *constraints*
 *     (forbidden cells/edges at specific times) for that one agent.
 *   - High level: a best-first search over a binary "constraint tree". Each node
 *     holds a constraint set and the resulting paths. We find the first conflict
 *     between two agents and branch into two children, each forbidding one of
 *     the agents from that cell/edge at that time, then replan just that agent.
 *
 * Like the prioritized planner this runs over a short window and only the next
 * step is executed, so it slots into the same real-time loop. The high-level
 * search is capped by a node budget; if a floor is too tangled to resolve in
 * budget, it falls back to the (always-safe) prioritized planner so the
 * simulation never stalls.
 */

import { spaceTimeAStar } from './astar';
import { MinHeap } from './heap';
import { DistanceFieldCache, planMoves, StaticObstacle } from './planner';
import { ReservationTable } from './reservation';
import { Coord, Robot, World } from './types';

/** Cap on high-level constraint-tree nodes expanded per floor, per tick. */
const HIGH_LEVEL_BUDGET = 160;

interface Constraint {
  agent: number;
  t: number;
  x: number;
  y: number;
  /** For edge constraints, the other endpoint. */
  x2?: number;
  y2?: number;
  edge: boolean;
}

interface CTNode {
  constraints: Constraint[];
  paths: Coord[][];
  cost: number;
}

/** Drop-in replacement for `planMoves` using CBS, planned per floor. */
export function planMovesCBS(
  world: World,
  navigating: Robot[],
  statics: StaticObstacle[],
  cache: DistanceFieldCache,
  window: number,
): void {
  const agentsByFloor = new Map<number, Robot[]>();
  for (const r of navigating) {
    if (!r.dest) {
      r.nextX = r.x;
      r.nextY = r.y;
      continue;
    }
    const list = agentsByFloor.get(r.floor);
    if (list) list.push(r);
    else agentsByFloor.set(r.floor, [r]);
  }

  const staticsByFloor = new Map<number, StaticObstacle[]>();
  for (const s of statics) {
    const list = staticsByFloor.get(s.floor);
    if (list) list.push(s);
    else staticsByFloor.set(s.floor, [s]);
  }

  for (const [floor, agents] of agentsByFloor) {
    solveFloor(world, floor, agents, staticsByFloor.get(floor) ?? [], cache, window);
  }
}

function solveFloor(
  world: World,
  floor: number,
  agents: Robot[],
  statics: StaticObstacle[],
  cache: DistanceFieldCache,
  window: number,
): void {
  const grid = world.floors[floor];

  // A single agent on a floor can never conflict with another agent.
  if (agents.length === 1) {
    applyStep(agents[0], lowLevel(grid, agents[0], statics, [], 0, cache, window));
    return;
  }

  const rootPaths = agents.map((a, i) => lowLevel(grid, a, statics, [], i, cache, window));
  const open = new MinHeap<CTNode>();
  const root: CTNode = { constraints: [], paths: rootPaths, cost: sumCost(rootPaths) };
  open.push(root, root.cost);

  let expansions = 0;
  while (open.size > 0 && expansions < HIGH_LEVEL_BUDGET) {
    const node = open.pop()!;
    expansions++;

    const conflict = findConflict(node.paths, window);
    if (!conflict) {
      agents.forEach((a, i) => applyStep(a, node.paths[i]));
      return;
    }

    for (const c of branch(conflict, node.paths)) {
      const constraints = node.constraints.concat(c);
      const paths = node.paths.slice();
      paths[c.agent] = lowLevel(grid, agents[c.agent], statics, constraints, c.agent, cache, window);
      const cost = sumCost(paths);
      open.push({ constraints, paths, cost }, cost);
    }
  }

  // Out of budget — fall back to the always-safe prioritized planner.
  planMoves(world, agents, statics, cache, window);
}

/** Constrained single-agent space-time A* for one CBS agent. */
function lowLevel(
  grid: World['floors'][number],
  robot: Robot,
  statics: StaticObstacle[],
  constraints: Constraint[],
  agentIndex: number,
  cache: DistanceFieldCache,
  window: number,
): Coord[] {
  const reservation = new ReservationTable();
  for (const s of statics) reservation.reserveStatic(s.floor, s.x, s.y, 1, window);
  for (const c of constraints) {
    if (c.agent !== agentIndex) continue;
    if (c.edge) reservation.reserveEdge(grid.floor, c.x, c.y, c.x2!, c.y2!, c.t);
    else reservation.reserveVertex(grid.floor, c.x, c.y, c.t);
  }

  const heuristic = cache.get(grid.floor, robot.dest!.x, robot.dest!.y);
  const result = spaceTimeAStar({
    grid,
    start: { x: robot.x, y: robot.y },
    goal: { x: robot.dest!.x, y: robot.dest!.y },
    heuristic,
    reservation,
    window,
  });
  return result.path;
}

/** Position of an agent at time t, holding its last cell once the path ends. */
function at(path: Coord[], t: number): Coord {
  return path[Math.min(t, path.length - 1)];
}

type Conflict =
  | { kind: 'vertex'; i: number; j: number; t: number; x: number; y: number }
  | { kind: 'edge'; i: number; j: number; t: number; a: Coord; b: Coord };

/** First vertex or edge conflict between any pair of paths within the window. */
function findConflict(paths: Coord[][], window: number): Conflict | null {
  const n = paths.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let t = 1; t <= window; t++) {
        const ai = at(paths[i], t);
        const aj = at(paths[j], t);
        if (ai.x === aj.x && ai.y === aj.y) {
          return { kind: 'vertex', i, j, t, x: ai.x, y: ai.y };
        }
        const pi = at(paths[i], t - 1);
        const pj = at(paths[j], t - 1);
        if (pi.x === aj.x && pi.y === aj.y && pj.x === ai.x && pj.y === ai.y) {
          return { kind: 'edge', i, j, t, a: pi, b: ai };
        }
      }
    }
  }
  return null;
}

/** The two children of a conflict: each forbids one agent from it. */
function branch(conflict: Conflict, paths: Coord[][]): Constraint[] {
  if (conflict.kind === 'vertex') {
    const { i, j, t, x, y } = conflict;
    return [
      { agent: i, t, x, y, edge: false },
      { agent: j, t, x, y, edge: false },
    ];
  }
  // Edge swap: forbid each agent from traversing the swapped edge at t-1.
  const { i, j, t, a, b } = conflict;
  return [
    { agent: i, t: t - 1, x: a.x, y: a.y, x2: b.x, y2: b.y, edge: true },
    { agent: j, t: t - 1, x: b.x, y: b.y, x2: a.x, y2: a.y, edge: true },
  ];
}

function sumCost(paths: Coord[][]): number {
  let total = 0;
  for (const p of paths) total += p.length;
  return total;
}

function applyStep(robot: Robot, path: Coord[]): void {
  const next = path.length > 1 ? path[1] : path[0];
  robot.nextX = next.x;
  robot.nextY = next.y;
  robot.plannedPath = path;
  const atDest = !!robot.dest && robot.x === robot.dest.x && robot.y === robot.dest.y;
  robot.yielding = !atDest && next.x === robot.x && next.y === robot.y;
}
