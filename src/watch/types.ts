/**
 * Shared types for account change detection.
 *
 * Everything in `src/watch/` that is not suffixed `-chrome` is intentionally
 * free of browser and Chrome APIs so it can be unit tested under Node.
 */

export type FetchStatus = 'ok' | 'blocked' | 'timeout' | 'not_found' | 'error';

export type ChangeType = 'pricing' | 'hiring' | 'messaging' | 'new_page';

export type Severity = 'major' | 'minor';

/**
 * A single captured read of a watched domain.
 *
 * Only title, meta description and headings are used for the messaging diff.
 * Paragraphs are captured for display but never diffed: the paragraph
 * extractor returns wildly different content for client-rendered pages during
 * a background fetch, so diffing it produces constant false positives.
 */
export interface Snapshot {
  domain: string;
  url: string;
  capturedAt: string;
  contentHash: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  navLinks: string[];
  pricingPresent: boolean;
  pricingText: string | null;
  pricingAmounts: string[];
  careersPresent: boolean;
  careersRoles: string[];
  fetchStatus: FetchStatus;
}

export interface DetectedChange {
  changeType: ChangeType;
  severity: Severity;
  beforeText: string;
  afterText: string;
  /** Deterministic, model-free description. Replaced by the model when available. */
  summary: string;
  /** Extra categories that also changed in the same cycle, for the summary line. */
  alsoChanged: ChangeType[];
}

export interface PlanWatchLimits {
  maxWatched: number;
  checkIntervalHours: number;
}
