/**
 * Deterministic snapshot differ.
 *
 * No model is involved in deciding whether something changed. The model only
 * ever writes a sentence *about* a change this file already detected. That is
 * on purpose: an LLM asked "what changed between these two pages" will invent
 * changes, and a monitoring product that cries wolf is worse than no product.
 *
 * What is compared:
 *   - messaging: title, meta description, first N headings
 *   - pricing:   presence of a pricing page, and the currency amounts on it
 *   - hiring:    role titles ADDED to the careers page
 *   - new_page:  top-level internal nav links added
 *
 * What is deliberately NOT compared: body paragraphs. See types.ts.
 */

import type { ChangeType, DetectedChange, Severity, Snapshot } from './types.js';
import { SALES_ROLE_PATTERN } from './extract.js';
import {
  addedItems,
  canonicalize,
  canonicalizeIgnoringNumbers,
  removedItems,
  sameSet,
  similarity,
} from './normalize.js';

/** Only the first few headings carry the positioning. The rest are section labels. */
export const HEADINGS_COMPARED = 3;

/**
 * Two strings this similar are a copy edit, not a repositioning.
 * 0.85 was chosen so "Sales intelligence for teams" -> "Sales intelligence for
 * revenue teams" stays quiet, while a genuine rewrite fires.
 */
export const MESSAGING_SIMILARITY_CEILING = 0.85;

/** Priority when several categories fire in the same cycle. Highest wins. */
const CHANGE_PRIORITY: Record<ChangeType, number> = {
  pricing: 4,
  hiring: 3,
  messaging: 2,
  new_page: 1,
};

export interface DiffResult {
  /** All categories that fired, highest priority first. */
  changes: DetectedChange[];
  /** The single change worth alerting on, or null. Capped at one per cycle. */
  alert: DetectedChange | null;
  /** Set when the pair could not be compared at all. */
  skippedReason?: string;
}

function isComparable(snapshot: Snapshot | null | undefined): snapshot is Snapshot {
  return Boolean(snapshot) && snapshot!.fetchStatus === 'ok';
}

/**
 * True when the two texts differ in a way a human would call a change.
 * Whitespace, casing, smart punctuation, digits and near-identical rewrites
 * all return false.
 */
export function isMeaningfulTextChange(before: string, after: string): boolean {
  const beforeCanonical = canonicalize(before);
  const afterCanonical = canonicalize(after);

  if (beforeCanonical === afterCanonical) return false;

  // Both empty-ish: nothing to say.
  if (!beforeCanonical || !afterCanonical) {
    return Boolean(beforeCanonical || afterCanonical);
  }

  // Numbers masked: kills rotating counters, years, version suffixes.
  if (canonicalizeIgnoringNumbers(before) === canonicalizeIgnoringNumbers(after)) {
    return false;
  }

  return similarity(before, after) < MESSAGING_SIMILARITY_CEILING;
}

function comparedHeadings(snapshot: Snapshot): string[] {
  return (snapshot.headings || []).slice(0, HEADINGS_COMPARED);
}

function diffMessaging(before: Snapshot, after: Snapshot): DetectedChange | null {
  const titleChanged = isMeaningfulTextChange(before.title, after.title);
  const metaChanged = isMeaningfulTextChange(before.metaDescription, after.metaDescription);

  const beforeHeadings = comparedHeadings(before).map(canonicalizeIgnoringNumbers).filter(Boolean);
  const afterHeadings = comparedHeadings(after).map(canonicalizeIgnoringNumbers).filter(Boolean);

  // Ordering is not signal. Only membership is.
  const headingsChanged =
    beforeHeadings.length > 0 &&
    afterHeadings.length > 0 &&
    !sameSet(beforeHeadings, afterHeadings);

  if (!titleChanged && !metaChanged && !headingsChanged) return null;

  const parts: string[] = [];
  if (titleChanged) parts.push('page title');
  if (metaChanged) parts.push('meta description');
  if (headingsChanged) parts.push('homepage headline');

  const beforeText = [before.title, before.metaDescription, ...comparedHeadings(before)]
    .filter(Boolean)
    .join(' | ');
  const afterText = [after.title, after.metaDescription, ...comparedHeadings(after)]
    .filter(Boolean)
    .join(' | ');

  return {
    changeType: 'messaging',
    // A rewritten title or headline is a repositioning. A meta-only edit is SEO housekeeping.
    severity: titleChanged || headingsChanged ? 'major' : 'minor',
    beforeText,
    afterText,
    summary: `${after.domain} changed its ${parts.join(' and ')}.`,
    alsoChanged: [],
  };
}

function diffPricing(before: Snapshot, after: Snapshot): DetectedChange | null {
  if (!before.pricingPresent && after.pricingPresent) {
    return {
      changeType: 'pricing',
      severity: 'major',
      beforeText: 'No pricing page found',
      afterText: after.pricingAmounts.length
        ? `Pricing page published: ${after.pricingAmounts.join(', ')}`
        : 'Pricing page published',
      summary: `${after.domain} published a pricing page.`,
      alsoChanged: [],
    };
  }

  if (before.pricingPresent && !after.pricingPresent) {
    return {
      changeType: 'pricing',
      severity: 'major',
      beforeText: before.pricingAmounts.length
        ? `Pricing page: ${before.pricingAmounts.join(', ')}`
        : 'Pricing page present',
      afterText: 'Pricing page removed',
      summary: `${after.domain} removed its public pricing page.`,
      alsoChanged: [],
    };
  }

  if (!before.pricingPresent || !after.pricingPresent) return null;

  // Compare the set of prices, not the page copy. "A number changed" is a
  // reliable signal; parsing tiers out of arbitrary markup is not.
  if (sameSet(before.pricingAmounts, after.pricingAmounts)) return null;

  // A page that suddenly reports no prices at all is almost always a failed
  // render, not a pricing change.
  if (before.pricingAmounts.length > 0 && after.pricingAmounts.length === 0) return null;
  if (before.pricingAmounts.length === 0 && after.pricingAmounts.length === 0) return null;

  return {
    changeType: 'pricing',
    severity: 'major',
    beforeText: before.pricingAmounts.join(', ') || 'no prices listed',
    afterText: after.pricingAmounts.join(', ') || 'no prices listed',
    summary: `${after.domain} changed the prices on its pricing page.`,
    alsoChanged: [],
  };
}

function diffHiring(before: Snapshot, after: Snapshot): DetectedChange | null {
  if (!after.careersPresent) return null;
  // First time we see a careers page there is no baseline, so everything would
  // look "added". Only report once we have a previous careers read.
  if (!before.careersPresent) return null;

  const beforeRoles = (before.careersRoles || []).map(canonicalize).filter(Boolean);
  const afterRolesRaw = after.careersRoles || [];
  const beforeSet = new Set(beforeRoles);

  // Added titles only. A removed posting means the role was filled or pulled,
  // which is not an outreach trigger.
  const added = afterRolesRaw.filter((role) => !beforeSet.has(canonicalize(role)));
  if (added.length === 0) return null;

  const salesRoles = added.filter((role) => SALES_ROLE_PATTERN.test(role));

  return {
    changeType: 'hiring',
    severity: salesRoles.length > 0 ? 'major' : 'minor',
    beforeText: beforeRoles.length ? `${beforeRoles.length} roles listed` : 'No roles listed',
    afterText: added.join(', '),
    summary:
      salesRoles.length > 0
        ? `${after.domain} is hiring for revenue roles: ${salesRoles.join(', ')}.`
        : `${after.domain} posted ${added.length} new role${added.length === 1 ? '' : 's'}.`,
    alsoChanged: [],
  };
}

function diffNewPage(before: Snapshot, after: Snapshot): DetectedChange | null {
  const beforeLinks = before.navLinks || [];
  const afterLinks = after.navLinks || [];

  if (beforeLinks.length === 0 || afterLinks.length === 0) return null;

  const added = addedItems(beforeLinks, afterLinks);
  if (added.length === 0) return null;

  // A wholesale nav rewrite is a template change, not a launch. Ignore it.
  const removed = removedItems(beforeLinks, afterLinks);
  if (added.length > 3 || removed.length > 3) return null;

  return {
    changeType: 'new_page',
    severity: 'minor',
    beforeText: `${beforeLinks.length} top-level pages`,
    afterText: added.join(', '),
    summary: `${after.domain} added a new top-level page: ${added.join(', ')}.`,
    alsoChanged: [],
  };
}

/**
 * Compare two snapshots of the same domain.
 *
 * Returns at most one alert per call, per the noise rules in feature-spec.md
 * section 4. Other categories that fired are listed in `alert.alsoChanged` and
 * mentioned in the summary.
 */
export function diffSnapshots(
  before: Snapshot | null | undefined,
  after: Snapshot | null | undefined
): DiffResult {
  if (!isComparable(after)) {
    return { changes: [], alert: null, skippedReason: 'current fetch was not usable' };
  }

  if (!isComparable(before)) {
    // First successful snapshot, or the previous one was blocked. There is
    // nothing to compare against, and inventing a baseline creates a fake alert.
    return { changes: [], alert: null, skippedReason: 'no comparable previous snapshot' };
  }

  if (before.domain !== after.domain) {
    return { changes: [], alert: null, skippedReason: 'snapshots are for different domains' };
  }

  // Identical content hash means the page is byte-identical. Nothing to do.
  if (before.contentHash && after.contentHash && before.contentHash === after.contentHash) {
    return { changes: [], alert: null };
  }

  const detected = [
    diffPricing(before, after),
    diffHiring(before, after),
    diffMessaging(before, after),
    diffNewPage(before, after),
  ].filter(Boolean) as DetectedChange[];

  detected.sort((a, b) => CHANGE_PRIORITY[b.changeType] - CHANGE_PRIORITY[a.changeType]);

  if (detected.length === 0) {
    return { changes: [], alert: null };
  }

  const alert = detected[0];
  alert.alsoChanged = detected.slice(1).map((change) => change.changeType);

  if (alert.alsoChanged.length > 0) {
    alert.summary = `${alert.summary} Also changed: ${alert.alsoChanged.join(', ')}.`;
    // Several independent signals in one cycle is a stronger trigger.
    alert.severity = 'major' as Severity;
  }

  return { changes: detected, alert };
}
