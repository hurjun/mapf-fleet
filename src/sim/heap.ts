/** A tiny binary min-heap used by the A* searches. */
export class MinHeap<T> {
  private items: T[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T, priority: number): void {
    this.items.push(item);
    this.prios.push(priority);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prios.pop()!;
    if (n > 1) {
      this.items[0] = lastItem;
      this.prios[0] = lastPrio;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prios[i] >= this.prios[parent]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.prios[left] < this.prios[smallest]) smallest = left;
      if (right < n && this.prios[right] < this.prios[smallest]) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}
