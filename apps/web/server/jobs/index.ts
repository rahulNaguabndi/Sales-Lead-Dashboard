import { runColdDetector } from './cold-detector';
import { runFollowUpSweeper } from './followup-sweeper';
import { withJobLock } from './lock';
import { runScoreFreshness } from './score-freshness';

export type JobDef = { name: string; everyMs: number; run: () => Promise<unknown> };

export const JOBS: readonly JobDef[] = [
  { name: 'followup-sweeper', everyMs: 60_000, run: () => runFollowUpSweeper() },
  { name: 'cold-detector', everyMs: 60_000, run: () => runColdDetector() },
  { name: 'score-freshness', everyMs: 5 * 60_000, run: () => runScoreFreshness() },
];

/** Runs one job under its lock; errors are caught so the interval survives. */
export async function runJob(job: Pick<JobDef, 'name' | 'run'>): Promise<void> {
  const started = Date.now();
  try {
    const result = await withJobLock(job.name, job.run);
    if (result === null) return; // another instance holds the lock
    console.info(
      JSON.stringify({ level: 'info', job: job.name, result, durationMs: Date.now() - started }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', job: job.name, message: (err as Error).message }),
    );
  }
}

const g = globalThis as unknown as { __ldJobs?: { stop: () => void } };

/** Starts the interval jobs once per process. Disabled with JOBS_ENABLED=false. */
export function startJobs(jobs: readonly JobDef[] = JOBS): { stop: () => void } | null {
  const flag = (process.env.JOBS_ENABLED ?? 'true').toLowerCase();
  if (flag === 'false' || flag === '0') {
    console.info('[jobs] disabled (JOBS_ENABLED=false)');
    return null;
  }
  if (g.__ldJobs) return g.__ldJobs;
  const timers = jobs.map((j) => {
    const t = setInterval(() => void runJob(j), j.everyMs);
    t.unref?.();
    return t;
  });
  const handle = {
    stop: () => {
      timers.forEach(clearInterval);
      g.__ldJobs = undefined;
    },
  };
  g.__ldJobs = handle;
  console.info(`[jobs] started: ${jobs.map((j) => j.name).join(', ')}`);
  return handle;
}
