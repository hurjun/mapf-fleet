# Algorithms

This document explains the multi-agent path-finding (MAPF) core that drives the
fleet simulator: the space-time state space, the shared reservation table, the
two planners (prioritized cooperative WHCA\* and Conflict-Based Search), how
conflicts are detected and resolved, and the complexity of each piece. All of
it lives in `src/sim/` as pure, framework-free TypeScript and is exercised by
the Vitest suite, so every claim here is reproducible with `npm run test:run`.

Notation: a single floor is a 4-connected grid of `V` walkable cells; `N` is the
number of robots planned together; `W` is the planning window (horizon) in
ticks.

---

## 1. Problem

Each tick, every navigating robot must choose a next cell so that the fleet as a
whole stays **collision-free**. Two failure modes must be excluded:

- **Vertex conflict** — two robots occupy the same cell at the same tick.
- **Edge (swap) conflict** — two adjacent robots exchange cells in one tick,
  passing through each other.

This is the discrete MAPF formulation of Stern et al. (2019). The simulator
plans on a **rolling window**: only the first step of each plan is executed, then
everything is replanned next tick. This keeps the system reactive (robots appear,
finish tasks, divert to charge, board elevators) while bounding the search depth.

---

## 2. State space: `(x, y, t)`

Searches run over space-time states `(x, y, t)`: a cell plus a discrete tick.
The five actions from a state are *wait in place* and *step to one of the four
neighbours*. Time only ever advances, so the search graph is a DAG of depth `W`.

The heuristic is a **reverse-BFS distance field** computed once per goal over the
static walls (`grid.ts: distanceField`). Because it is the exact shortest-path
distance on the obstacle grid ignoring other robots, it is **admissible and
consistent**, so A\* with it expands no state whose true cost-to-go it
overestimates. Fields depend only on the static layout and are cached per goal
(`DistanceFieldCache`).

- Distance field: **O(V)** time and space per goal (one BFS sweep), cached.

---

## 3. Space-time reservation table (`reservation.ts`)

The reservation table is the shared blackboard that makes cooperation possible.
Higher-priority robots write the cells and transitions they intend to occupy;
lower-priority searches read them as time-indexed obstacles.

- **Vertex reservation** `(floor, x, y, t)` — "this cell is taken at tick `t`."
- **Edge reservation** `(floor, a, b, t)` — "the transition between `a` and `b`
  departing at tick `t` is taken." The key is **canonicalised so `a→b` and
  `b→a` map to the same entry** (`eKey` sorts the endpoints). That single design
  choice is what forbids head-on swaps: reserving your own move automatically
  blocks the opposing robot's mirror move.

Reservations are keyed by floor, so robots on different floors never interfere.
Lookups and inserts are hash-set operations.

- Vertex/edge query or insert: **O(1)** expected.

---

## 4. Single-agent windowed cooperative A\* — WHCA\* (`astar.ts`)

`spaceTimeAStar` is A\* over `(x, y, t)` that skips any successor whose vertex is
reserved at `t+1` or whose edge is reserved at `t`. This is the low-level engine
for **both** planners.

The window makes the goal potentially unreachable within `W` steps. Rather than
return failure (which would stall the robot), the search tracks the **best
reachable state** — smallest heuristic, then earliest tick — and returns the path
to it when the goal is not reached. The robot therefore always makes progress
toward its goal even under heavy congestion. This windowed, progress-guaranteeing
behaviour is exactly David Silver's Windowed Hierarchical Cooperative A\* (WHCA\*).

A `maxExpansions` cap (default 6000) bounds worst-case work.

- Per call: **O(V · W · log(V · W))** worst case with the binary heap, bounded by
  `maxExpansions`. State space size is **O(V · W)**.

> Implementation note: states are encoded as `"x,y,t"` strings in a `Map`/`Set`.
> This is more than fast enough at the simulator's scale; an integer encoding
> (`(t·H + y)·Wd + x`) would cut constant factors for larger grids.

---

## 5. Prioritized planner — cooperative WHCA\* (`planner.ts`)

`planMoves` plans robots **one at a time in priority order** against a single
shared reservation table:

1. **Priority order** — loaded (carrying) robots first so a full robot is never
   forced to detour; then whoever has waited longest, which breaks symmetric
   stand-offs over time; then by id for determinism.
2. **Reserve before the next plans** — each robot reserves its full planned path
   (vertices and edges) over the window, and pads the tail by holding its final
   cell for the rest of the window.
3. **The collision-free guarantee** — before planning robot *i*, the planner
   temporarily reserves the *current* cell, at `t = 1`, of every not-yet-planned
   robot on the same floor. Since only the `t = 1` step is ever executed, this
   guarantees no two robots can land on the same cell next tick, even if a
   lower-priority robot ends up holding position. The temporary reservations are
   released after the search so they don't pollute later ticks.

**Yielding emerges** from this: a robot whose only legal action is to wait simply
holds position, which looks like it is letting others pass — no scripted
behaviour.

**Completeness caveat (this is why CBS exists).** Prioritized planning is fast
but **incomplete**: a fixed priority order can deadlock on tightly-coupled
instances. The bare planner cannot, for example, resolve a head-on swap in a
1-wide corridor with a single passing pocket — the two robots stall forever
(verified in `cbs.test.ts`). The *engine* papers over this with a deadlock
detector that replans the stuck cluster under a **pseudo-random priority shuffle**
(`shuffleSalt`), which usually shakes it loose. CBS removes the failure mode
outright.

- Per tick: **O(N · V · W · log(V · W))** — one low-level search per robot.

---

## 6. Conflict-Based Search — optimal MAPF (`cbs.ts`)

CBS (Sharon et al., 2015) is a **two-level** search that returns a
**minimum-sum-of-costs**, collision-free joint plan rather than a greedy one. It
is offered as a live-switchable alternative to the prioritized planner and is
planned **per floor** (robots on different floors cannot conflict).

**Low level.** A single-agent `spaceTimeAStar` that obeys a set of *constraints*
— forbidden `(agent, cell, t)` vertices and `(agent, edge, t)` transitions —
encoded as reservations for just that agent.

**High level.** A best-first search over a binary **constraint tree (CT)**,
ordered by total plan cost (`MinHeap`):

1. The **root** holds each agent's unconstrained shortest path (no inter-agent
   constraints). Its cost is the sum of path lengths.
2. **Validate** the node: scan all agent pairs over the window for the *first*
   vertex or edge conflict (`findConflict`).
3. If there is **no conflict**, this node is a collision-free solution — and
   because the CT is expanded best-first by cost, it is the **minimum-cost** one.
   Apply each agent's next step and return.
4. Otherwise **branch** on the conflict into two children. A vertex conflict
   `(t, x, y)` between agents *i*, *j* yields one child forbidding *i* from
   `(x, y, t)` and one forbidding *j*. A swap conflict yields one child per agent
   forbidding that agent's half of the swapped edge. Each child **replans only
   its constrained agent** with the low level, recomputes the cost, and is pushed
   onto the open list.

Because each branch keeps every agent's path optimal *subject to* its
constraints, and the open list is ordered by cost, the first conflict-free node
popped is globally optimal for sum-of-costs — the optimality argument from the
original paper.

**Real-time budget.** The CT can grow exponentially in the number of conflicts,
which is too slow for an interactive loop, so the high level is capped at
`HIGH_LEVEL_BUDGET = 160` node expansions per floor per tick. If a floor is too
tangled to resolve within budget, CBS **falls back to the (always-safe)
prioritized planner** for that floor, so the simulation stays real-time and never
stalls. CBS is therefore *optimal when it succeeds within budget* and *never
worse than safe* otherwise.

- Conflict detection per node: **O(N² · W)**.
- High level: worst-case **exponential** in the number of conflicts; here bounded
  to ≤ 160 node expansions per floor per tick, each doing one **O(V · W · log)**
  low-level replan.

---

## 7. Worked example (reproducible)

The corridor-swap instance below distinguishes the two planners. The map is a
1-wide corridor with a single passing pocket; the two robots must exchange ends:

```
# . # # #      pocket at (1,0)
. A . . B  →   A:(0,1)→(4,1)   B:(4,1)→(0,1)
# # # # #
```

- **Prioritized (alone):** stays collision-free but **deadlocks** — neither robot
  ever reaches its goal, for either priority order.
- **CBS:** coordinates one robot into the pocket and **completes the swap in 7
  ticks**, collision-free and swap-free.

Both outcomes are asserted in `src/sim/cbs.test.ts`
(`CBS module (planMovesCBS) › resolves a head-on corridor swap …`). Run them with:

```bash
npm run test:run
```

The in-app **Planner benchmark** card (`src/sim/benchmark.ts`) runs the same
building under each planner and reports the classic MAPF trade-off: CBS yields
smoother coordination (less waiting) at a much higher compute cost than
prioritized planning.

For a headless, multi-seed sweep — per-tick planning latency, throughput, and a
per-tick collision check across fleet sizes and scenarios — run `npm run bench`
(`scripts/benchmark.ts` over the pure helpers in `src/sim/scaling.ts`). The
measured tables, scaling chart, and prioritized-vs-CBS comparison are written up
in the [Performance & scaling](README.md#performance--scaling) section of the
README.

---

## 8. Adjacent components

- **Elevators (`elevator.ts`)** — each car runs a **LOOK scan** scheduler: keep
  moving in the current direction while a stop (a rider's destination or a floor
  with a waiting robot) lies ahead, otherwise reverse, otherwise idle; a full car
  ignores hall calls. The shaft sits *between* the boarding and exit pads so a
  boarding queue can never block an exit — a deliberate deadlock-avoidance detail.
- **Fleet-size optimizer (`optimize.ts`)** — an analytical throughput model
  (traffic fundamental diagram for floor congestion × an elevator-capacity
  ceiling), measured on the real generated layout via reverse-BFS distance
  fields, and validated live against the simulator's measured throughput.

---

## Complexity summary

| Component | Per-invocation cost |
| --- | --- |
| Reverse-BFS distance field (`distanceField`) | O(V), cached per goal |
| Space-time A\* (`spaceTimeAStar`) | O(V · W · log(V · W)), capped at `maxExpansions` |
| Prioritized planner (`planMoves`) | O(N · V · W · log(V · W)) per tick |
| CBS conflict detection (`findConflict`) | O(N² · W) per CT node |
| CBS high level (`planMovesCBS`) | exp. worst case; ≤ 160 nodes/floor/tick, each O(V · W · log) |

---

## References

1. P. E. Hart, N. J. Nilsson, B. Raphael. *A Formal Basis for the Heuristic
   Determination of Minimum Cost Paths.* IEEE Trans. Systems Science and
   Cybernetics 4(2), 1968. (A\*)
2. D. Silver. *Cooperative Pathfinding.* AIIDE, 2005. (Cooperative A\* and
   Windowed Hierarchical Cooperative A\*, WHCA\*)
3. T. Standley. *Finding Optimal Solutions to Cooperative Pathfinding Problems.*
   AAAI, 2010. (independence detection; sum-of-costs MAPF)
4. G. Sharon, R. Stern, A. Felner, N. R. Sturtevant. *Conflict-Based Search for
   Optimal Multi-Agent Pathfinding.* Artificial Intelligence 219, 2015, 40–66.
   (CBS)
5. M. Barer, G. Sharon, R. Stern, A. Felner. *Suboptimal Variants of the
   Conflict-Based Search Algorithm.* SoCS, 2014. (ECBS — a possible extension)
6. R. Stern, N. Sturtevant, A. Felner, et al. *Multi-Agent Pathfinding:
   Definitions, Variants, and Benchmarks.* SoCS, 2019. (vertex/edge/swap
   conflicts; sum-of-costs vs. makespan)
