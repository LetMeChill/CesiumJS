// User Timing만 기록하며 좌표·인증키·개별 관측값은 기록하지 않는다.
export async function measureMapStage<T>(name: string, task: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await task();
  } finally {
    performance.measure(`urban-heat:${name}`, { start, end: performance.now() });
  }
}
