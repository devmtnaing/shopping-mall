// Entry point: `pnpm dev:server` or `node server/src/main.ts`. Configure with environment variables.
import { startServer } from './server.ts';

const port = Number(process.env.PORT ?? 8787);
const server = await startServer({ port, capacity: Number(process.env.ROOM_CAPACITY ?? 100) });
console.log(`plaza server listening on :${server.port} (ws path /ws, health /health)`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
