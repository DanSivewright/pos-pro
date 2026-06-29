// Map over `items` running at most `limit` workers at once, returning results
// in the original input order regardless of completion order. A small worker
// pool drains a shared cursor: each of `limit` runners pulls the next index,
// awaits the worker, and writes the result back into its slot. Bounds peak
// memory + concurrent I/O so a large batch can't exhaust a serverless function.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runner = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };

  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, runner));
  return results;
}
