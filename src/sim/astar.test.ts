import { describe, it, expect } from 'vitest';
import { Cell, FloorGrid } from './types';
import { distanceField } from './grid';
import { findPath, spaceTimeAStar } from './astar';
import { ReservationTable } from './reservation';

/** Build a floor grid from ASCII rows: '#' = wall, anything else = free. */
function grid(rows: string[]): FloorGrid {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = rows[y][x] === '#' ? Cell.Wall : Cell.Free;
    }
  }
  return { floor: 0, width, height, cells };
}

describe('findPath (single-agent A*)', () => {
  it('finds the Manhattan-length path in open space', () => {
    const g = grid(['.....', '.....', '.....']);
    const path = findPath(g, 0, 0, 4, 2);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 2 });
    // 4 steps in x + 2 in y → 7 cells including start.
    expect(path!.length).toBe(7);
  });

  it('routes around a wall', () => {
    const g = grid(['..#..', '..#..', '.....']);
    const path = findPath(g, 0, 0, 4, 0);
    expect(path).not.toBeNull();
    // The straight 4-step route is blocked, so the path must be longer.
    expect(path!.length).toBeGreaterThan(5);
    for (const c of path!) expect(g.cells[c.y * g.width + c.x]).not.toBe(Cell.Wall);
  });

  it('returns null when the goal is unreachable', () => {
    const g = grid(['..#..', '..#..', '..#..']);
    expect(findPath(g, 0, 0, 4, 0)).toBeNull();
  });
});

describe('spaceTimeAStar (cooperative, windowed)', () => {
  it('returns the shortest path when nothing is reserved', () => {
    const g = grid(['.....']);
    const res = spaceTimeAStar({
      grid: g,
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      heuristic: distanceField(g, 4, 0),
      reservation: new ReservationTable(),
      window: 20,
    });
    expect(res.reachedGoal).toBe(true);
    expect(res.path.length).toBe(5);
    expect(res.next).toEqual({ x: 1, y: 0 });
  });

  it('waits for a temporarily reserved cell, then proceeds', () => {
    const g = grid(['.....']);
    const reservation = new ReservationTable();
    // Block cell (2,0) exactly at t=2, when the robot would first arrive there.
    reservation.reserveVertex(0, 2, 0, 2);
    const res = spaceTimeAStar({
      grid: g,
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      heuristic: distanceField(g, 4, 0),
      reservation,
      window: 20,
    });
    expect(res.reachedGoal).toBe(true);
    // One wait is inserted, so the path is one cell longer than the 5-cell ideal.
    expect(res.path.length).toBe(6);
    // It must never occupy (2,0) at t=2.
    expect(res.path[2]).not.toEqual({ x: 2, y: 0 });
  });

  it('detours around a permanently reserved cell', () => {
    const g = grid(['...', '...', '...']);
    const reservation = new ReservationTable();
    for (let t = 0; t <= 20; t++) reservation.reserveVertex(0, 1, 0, t);
    const res = spaceTimeAStar({
      grid: g,
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      heuristic: distanceField(g, 2, 0),
      reservation,
      window: 20,
    });
    expect(res.reachedGoal).toBe(true);
    for (const c of res.path) expect(c).not.toEqual({ x: 1, y: 0 });
  });

  it('refuses a reserved edge (head-on swap prevention)', () => {
    const g = grid(['..']);
    const reservation = new ReservationTable();
    // Another robot reserved the move (1,0) -> (0,0) departing at t=0.
    reservation.reserveEdge(0, 1, 0, 0, 0, 0);
    // Our robot at (0,0) wants (1,0): the canonical edge is the same, so the
    // direct swap is blocked and it cannot reach the goal in a 2-cell corridor.
    const res = spaceTimeAStar({
      grid: g,
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 0 },
      heuristic: distanceField(g, 1, 0),
      reservation,
      window: 5,
    });
    expect(res.next).toEqual({ x: 0, y: 0 });
  });
});
