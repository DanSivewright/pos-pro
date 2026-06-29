import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency";

// Resolves on the next microtask, so interleaving between workers is observable.
function tick(): Promise<void> {
  return Promise.resolve();
}

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    // Later items finish first (descending delay) yet land in their slots.
    const items = [0, 1, 2, 3, 4];
    const results = await mapWithConcurrency(items, 2, async (n) => {
      for (let i = 0; i < items.length - n; i++) {
        await tick();
      }
      return n * 10;
    });
    expect(results).toEqual([0, 10, 20, 30, 40]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      await tick();
      active -= 1;
    });

    expect(peak).toBe(3);
  });

  it("caps the pool at the item count when the limit is larger", async () => {
    let active = 0;
    let peak = 0;
    const items = [0, 1];

    await mapWithConcurrency(items, 10, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
    });

    expect(peak).toBe(2);
  });

  it("handles an empty batch", async () => {
    const results = await mapWithConcurrency([], 5, () =>
      Promise.resolve("never")
    );
    expect(results).toEqual([]);
  });
});
