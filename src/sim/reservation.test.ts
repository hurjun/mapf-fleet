import { describe, it, expect } from 'vitest';
import { ReservationTable } from './reservation';

describe('ReservationTable', () => {
  it('reserves and releases vertices', () => {
    const r = new ReservationTable();
    expect(r.isVertexReserved(0, 2, 3, 5)).toBe(false);
    r.reserveVertex(0, 2, 3, 5);
    expect(r.isVertexReserved(0, 2, 3, 5)).toBe(true);
    expect(r.isVertexReserved(0, 2, 3, 6)).toBe(false); // different time
    expect(r.isVertexReserved(1, 2, 3, 5)).toBe(false); // different floor
    r.freeVertex(0, 2, 3, 5);
    expect(r.isVertexReserved(0, 2, 3, 5)).toBe(false);
  });

  it('reserveStatic covers an inclusive time range', () => {
    const r = new ReservationTable();
    r.reserveStatic(0, 1, 1, 2, 4);
    expect(r.isVertexReserved(0, 1, 1, 1)).toBe(false);
    expect(r.isVertexReserved(0, 1, 1, 2)).toBe(true);
    expect(r.isVertexReserved(0, 1, 1, 4)).toBe(true);
    expect(r.isVertexReserved(0, 1, 1, 5)).toBe(false);
  });

  it('edge reservations are order-independent (block head-on swaps)', () => {
    const r = new ReservationTable();
    r.reserveEdge(0, 1, 1, 2, 1, 3); // robot moving (1,1) -> (2,1) at t=3
    // The reverse traversal at the same departure time must also be blocked.
    expect(r.isEdgeReserved(0, 2, 1, 1, 1, 3)).toBe(true);
    expect(r.isEdgeReserved(0, 1, 1, 2, 1, 3)).toBe(true);
    expect(r.isEdgeReserved(0, 1, 1, 2, 1, 4)).toBe(false); // different time
    expect(r.isEdgeReserved(1, 2, 1, 1, 1, 3)).toBe(false); // different floor
  });

  it('clear empties all reservations', () => {
    const r = new ReservationTable();
    r.reserveVertex(0, 0, 0, 0);
    r.reserveEdge(0, 0, 0, 1, 0, 0);
    r.clear();
    expect(r.isVertexReserved(0, 0, 0, 0)).toBe(false);
    expect(r.isEdgeReserved(0, 0, 0, 1, 0, 0)).toBe(false);
  });
});
