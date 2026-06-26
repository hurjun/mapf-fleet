import { describe, it, expect } from 'vitest';
import { Cell, FloorGrid } from './types';
import { distanceField, idx, isWalkable, manhattan } from './grid';

function grid(rows: string[]): FloorGrid {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) cells[y * width + x] = rows[y][x] === '#' ? Cell.Wall : Cell.Free;
  }
  return { floor: 0, width, height, cells };
}

describe('grid helpers', () => {
  it('manhattan distance', () => {
    expect(manhattan(0, 0, 3, 4)).toBe(7);
    expect(manhattan(2, 2, 2, 2)).toBe(0);
  });

  it('isWalkable respects bounds and walls', () => {
    const g = grid(['.#', '..']);
    expect(isWalkable(g, 0, 0)).toBe(true);
    expect(isWalkable(g, 1, 0)).toBe(false); // wall
    expect(isWalkable(g, -1, 0)).toBe(false); // out of bounds
    expect(isWalkable(g, 2, 0)).toBe(false);
  });

  it('distanceField gives true shortest-path distances in open space', () => {
    const g = grid(['.....', '.....', '.....']);
    const d = distanceField(g, 0, 0);
    expect(d[idx(0, 0, 5)]).toBe(0);
    expect(d[idx(4, 0, 5)]).toBe(4);
    expect(d[idx(4, 2, 5)]).toBe(6); // 4 across + 2 down
  });

  it('distanceField routes around walls and marks unreachable cells as -1', () => {
    // A fully walled-off pocket on the right.
    const g = grid(['...#.', '...#.', '...#.']);
    const d = distanceField(g, 0, 0);
    expect(d[idx(0, 0, 5)]).toBe(0);
    expect(d[idx(2, 0, 5)]).toBe(2);
    expect(d[idx(4, 0, 5)]).toBe(-1); // unreachable behind the wall
  });
});
