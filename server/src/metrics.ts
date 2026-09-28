// Lightweight counters, logged as one JSON line every few seconds when METRICS=1.
export const stats = { bytesOut: 0, messagesOut: 0, ticks: 0, tickMs: 0 };

export function startMetrics(intervalMs: number, players: () => { rooms: number; players: number }) {
  let lastCpu = process.cpuUsage();
  let last = performance.now();
  return setInterval(() => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const wall = now - last;
    const p = players();
    console.log(
      JSON.stringify({
        type: 'metrics',
        ...p,
        cpuPct: Number((((cpu.user + cpu.system) / 1000 / wall) * 100).toFixed(1)),
        tickMsAvg: Number((stats.tickMs / Math.max(1, stats.ticks)).toFixed(2)),
        outKBps: Number((stats.bytesOut / 1024 / (wall / 1000)).toFixed(1)),
        msgsPerSec: Math.round(stats.messagesOut / (wall / 1000)),
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
      }),
    );
    lastCpu = process.cpuUsage();
    last = now;
    stats.bytesOut = stats.messagesOut = stats.ticks = stats.tickMs = 0;
  }, intervalMs);
}
