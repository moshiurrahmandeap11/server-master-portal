import { env } from '../config/env';
import { adminExtendedService } from '../module/admin/admin.extended.service';
import { scraperEngine } from './scraper';

const ONE_HOUR_MS = 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let deadlineTimer: NodeJS.Timeout | null = null;
let spiderTimer: NodeJS.Timeout | null = null;
let isDeadlineSweepRunning = false;
let isSpiderSyncRunning = false;

async function runSafeDeadlineSweep() {
  if (isDeadlineSweepRunning) return;
  isDeadlineSweepRunning = true;
  try {
    const res = await adminExtendedService.runMonitoringSweep();
    if (res.expiredClosed > 0) {
      console.log(`[Scheduler] Closed ${res.expiredClosed} expired job circulars.`);
    }
  } catch (err: any) {
    console.warn('[Scheduler] Deadline sweep failed:', err?.message);
  } finally {
    isDeadlineSweepRunning = false;
  }
}

async function runSafeSpiderSync() {
  if (isSpiderSyncRunning) return;
  isSpiderSyncRunning = true;
  try {
    const res = await scraperEngine.scrapeAllActiveSources();
    console.log(
      `[Scheduler] Auto-sync completed: checked=${res.sourcesChecked || 0}, added=${res.newJobsAdded}, updated=${res.updatedJobs}`,
    );
  } catch (err: any) {
    console.warn('[Scheduler] Auto-sync failed:', err?.message);
  } finally {
    isSpiderSyncRunning = false;
  }
}

export function startBackgroundSchedulers(): void {
  if (!env.ENABLE_AUTO_CRON) {
    console.log('[Scheduler] Auto-cron disabled via ENABLE_AUTO_CRON=false.');
    return;
  }

  // Initial lightweight deadline sweep 15s after boot
  setTimeout(() => {
    void runSafeDeadlineSweep();
  }, 15_000);

  deadlineTimer = setInterval(() => {
    void runSafeDeadlineSweep();
  }, ONE_HOUR_MS);

  spiderTimer = setInterval(() => {
    void runSafeSpiderSync();
  }, SIX_HOURS_MS);

  console.log('⏰ Background Schedulers Started (Deadline Sweep: 1h, Portal Sync: 6h)');
}

export function stopBackgroundSchedulers(): void {
  if (deadlineTimer) {
    clearInterval(deadlineTimer);
    deadlineTimer = null;
  }
  if (spiderTimer) {
    clearInterval(spiderTimer);
    spiderTimer = null;
  }
}
