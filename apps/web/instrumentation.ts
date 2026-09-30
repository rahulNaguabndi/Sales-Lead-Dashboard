// Fail fast on invalid configuration (FR-004): a JWT_SECRET shorter than 32 characters or a
// missing DATABASE_URL stops the server at startup with a readable message.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./server/env');
    validateEnv();
    const { getRedis, redisStatus } = await import('./server/redis/client');
    getRedis();
    // Give the first connection attempt a moment so the status line is meaningful.
    setTimeout(() => console.info(`Redis: ${redisStatus()}`), 1500).unref?.();
    const { startJobs } = await import('./server/jobs');
    startJobs();
  }
}
