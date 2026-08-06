/**
 * Watch tier limits.
 *
 * The Worker is the source of truth (`plan_limits.max_watched` and
 * `plan_limits.check_interval_hours`, surfaced by `/quota`). These values are
 * only the fallback used when the Worker is unreachable, so that the sweep and
 * the UI degrade to Free behaviour instead of `undefined`.
 *
 * Check frequency is the paid lever: Free weekly, Pro every 48h, Team daily.
 */

import type { PlanWatchLimits } from './types.js';

export const DEFAULT_WATCH_LIMITS: Record<string, PlanWatchLimits> = {
  free: { maxWatched: 3, checkIntervalHours: 168 },
  pro: { maxWatched: 100, checkIntervalHours: 48 },
  team: { maxWatched: 1000, checkIntervalHours: 24 },
};

export const FALLBACK_WATCH_LIMITS: PlanWatchLimits = DEFAULT_WATCH_LIMITS.free;

/** Saved-prospect caps. Free moved from 3 to 25: saving is a bookmark, watching is the cost. */
export const DEFAULT_MAX_SAVED: Record<string, number> = {
  free: 25,
  pro: 200,
  team: 5000,
};

export const FALLBACK_MAX_SAVED = DEFAULT_MAX_SAVED.free;
export const FALLBACK_DAILY_ANALYSES = 5;

export function watchLimitsForPlan(plan: string | null | undefined): PlanWatchLimits {
  const key = String(plan || 'free').toLowerCase();
  return DEFAULT_WATCH_LIMITS[key] || FALLBACK_WATCH_LIMITS;
}

export function maxSavedForPlan(plan: string | null | undefined): number {
  const key = String(plan || 'free').toLowerCase();
  return DEFAULT_MAX_SAVED[key] ?? FALLBACK_MAX_SAVED;
}

/**
 * Stable 0..(slots-1) bucket for a domain, so a user's watched accounts are
 * spread across the interval instead of all firing in the same minute.
 */
export function staggerSlot(domain: string, slots: number): number {
  if (slots <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  return hash % slots;
}

/**
 * Whether a watched domain is due for a re-check.
 *
 * The stagger offset is a fraction of the interval derived from the domain, so
 * checks for one user spread out rather than stampeding on the hour they
 * happened to save everything.
 */
export function isDueForCheck(options: {
  lastCheckedAt: string | null | undefined;
  intervalHours: number;
  domain: string;
  now?: number;
}): boolean {
  const now = options.now ?? Date.now();
  if (!options.lastCheckedAt) return true;

  const last = Date.parse(options.lastCheckedAt);
  if (!Number.isFinite(last)) return true;

  const intervalMs = Math.max(1, options.intervalHours) * 60 * 60 * 1000;
  // Spread across up to 12 buckets covering at most a quarter of the interval.
  const offsetMs = (staggerSlot(options.domain, 12) / 12) * (intervalMs / 4);

  return now - last >= intervalMs + offsetMs;
}

/** After this many consecutive failures we stop retrying and tell the user. */
export const MAX_CHECK_FAILURES = 3;

/** Snapshots retained per watched prospect. Keeps Supabase growth bounded. */
export const SNAPSHOT_RETENTION = 12;

/** Watched domains processed per alarm fire, sequentially. */
export const SWEEP_BATCH_SIZE = 5;

/** Alarm period. The per-domain interval above does the real gating. */
export const SWEEP_PERIOD_MINUTES = 60;
