export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, Math.floor(concurrency));
  let next = 0;

  const runOne = async (): Promise<void> => {
    const index = next++;
    if (index >= items.length) return;
    await worker(items[index]!, index);
    await runOne();
  };

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(runners);
}
