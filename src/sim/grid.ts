/** Grid helpers shared by the path-finding and planning code. */

import { Cell, FloorGrid } from './types';

/** Row-major index of a cell within a floor of the given width. */
export function idx(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function cellAt(grid: FloorGrid, x: number, y: number): Cell {
  return grid.cells[idx(x, y, grid.width)] as Cell;
}

/** A cell a robot can stand on or travel through. */
export function isWalkable(grid: FloorGrid, x: number, y: number): boolean {
  if (!inBounds(x, y, grid.width, grid.height)) return false;
  return cellAt(grid, x, y) !== Cell.Wall;
}

/** 4-connected neighbour offsets (no diagonals → simpler, cleaner motion). */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Reverse BFS distance field from a goal cell over a single floor, ignoring
 * time and other robots. Used as an admissible, accurate heuristic for the
 * space-time A* search. Unreachable cells are -1.
 */
export function distanceField(grid: FloorGrid, goalX: number, goalY: number): Int32Array {
  const { width, height } = grid;
  const dist = new Int32Array(width * height).fill(-1);
  if (!isWalkable(grid, goalX, goalY)) return dist;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const start = idx(goalX, goalY, width);
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const nd = dist[cur] + 1;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, width, height)) continue;
      const ni = idx(nx, ny, width);
      if (dist[ni] !== -1) continue;
      if (grid.cells[ni] === Cell.Wall) continue;
      dist[ni] = nd;
      queue[tail++] = ni;
    }
  }
  return dist;
}

/** Manhattan distance — fallback heuristic when no distance field is available. */
export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
