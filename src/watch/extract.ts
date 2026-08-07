/**
 * Snapshot extraction from raw HTML.
 *
 * Deliberately regex-based rather than DOMParser-based:
 *
 * 1. The MV3 background service worker has no DOM, and the watch sweep runs
 *    there. `src/sidepanel/analysis/fetcher.ts` can use DOMParser because it
 *    runs in the side panel document; this cannot.
 * 2. For the fields we actually diff (title, meta description, headings) a
 *    regex read of the served HTML is *more* stable than a DOM read, because
 *    it never depends on how a client-rendered page happens to hydrate.
 *
 * Everything here is a pure function of an HTML string, which is what makes
 * the differ testable against real captured pages under Node.
 */

import type { Snapshot } from './types.js';
import { canonicalize, canonicalizeUrl, extractCurrencyAmounts } from './normalize.js';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  trade: '',
  reg: '',
  copy: '',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => {
      const value = NAMED_ENTITIES[String(name).toLowerCase()];
      return value === undefined ? match : value;
    });
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Remove script/style/template blocks and comments before reading text. */
export function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

export function extractMetaDescription(html: string): string {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripTags(match[1]);
  }

  return '';
}

export function extractHeadings(html: string, limit = 12): string[] {
  const body = stripNonContent(html);
  const results: string[] = [];
  const seen = new Set<string>();
  const pattern = /<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null && results.length < limit) {
    const text = stripTags(match[2]);
    if (!text || text.length > 300) continue;
    const key = canonicalize(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(text);
  }

  return results;
}

/** Job-title-ish strings from a careers page: h1/h2/h3 plus link text. */
export function extractRoleTitles(html: string, limit = 40): string[] {
  const body = stripNonContent(html);
  const results: string[] = [];
  const seen = new Set<string>();

  const candidates: string[] = [];

  const headingPattern = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(body)) !== null) {
    candidates.push(stripTags(match[2]));
  }

  const linkPattern = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi;
  while ((match = linkPattern.exec(body)) !== null) {
    candidates.push(stripTags(match[1]));
  }

  for (const candidate of candidates) {
    if (results.length >= limit) break;
    if (!looksLikeRoleTitle(candidate)) continue;
    const key = canonicalize(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }

  return results;
}

const ROLE_HINTS =
  /\b(engineer|developer|designer|manager|director|lead|head of|architect|analyst|scientist|specialist|executive|representative|sdr|bdr|ae|intern|associate|recruiter|marketer|counsel|officer|vp|president|consultant|strategist|coordinator|administrator|technician|writer|producer|partner)\b/i;

const ROLE_NOISE =
  /\b(apply|view all|open roles|see all|learn more|our team|life at|benefits|culture|values|about|careers|jobs|home|contact|blog|privacy|terms|cookie|login|sign in|sign up)\b/i;

export function looksLikeRoleTitle(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 90) return false;
  if (ROLE_NOISE.test(trimmed)) return false;
  return ROLE_HINTS.test(trimmed);
}

export const SALES_ROLE_PATTERN =
  /\b(sales|revenue|revops|sdr|bdr|account executive|account manager|growth|partnership|partnerships|business development|go-to-market|gtm|demand gen|customer success)\b/i;

/**
 * Drop a leading locale segment (`/in/pricing`, `/en-gb/pricing`).
 *
 * Large sites geo-redirect, so the same nav can come back under a different
 * locale prefix between two checks. Without this every relocation would look
 * like the company replaced its entire site.
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  const first = segments[0].toLowerCase();
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(first)) {
    return `/${segments.slice(1).join('/')}`;
  }

  return `/${segments.join('/')}`;
}

/** Same-origin nav-ish links, canonicalised. Used for the new-page signal. */
export function extractInternalLinks(html: string, pageUrl: string, limit = 60): string[] {
  const body = stripNonContent(html);
  const results: string[] = [];
  const seen = new Set<string>();

  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const pattern = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null && results.length < limit) {
    const href = decodeEntities(match[1]).trim();
    if (!href || href.startsWith('#')) continue;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;

    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      continue;
    }

    if (absolute.origin !== origin) continue;

    absolute.pathname = stripLocalePrefix(absolute.pathname);

    // Only top-level sections: /pricing counts, /blog/some-post-title does not.
    const depth = absolute.pathname.split('/').filter(Boolean).length;
    if (depth === 0 || depth > 1) continue;

    const canonical = canonicalizeUrl(absolute.href);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    results.push(canonical);
  }

  return results.sort();
}

/** Candidate pricing/careers URLs, derived from the homepage links. */
export function findSectionUrl(html: string, pageUrl: string, pattern: RegExp): string | null {
  const body = stripNonContent(html);
  const linkPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;

  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return null;
  }

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(body)) !== null) {
    const href = decodeEntities(match[1]).trim();
    const text = stripTags(match[2]);
    if (!href || href.startsWith('#')) continue;

    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      continue;
    }

    if (absolute.origin !== origin) continue;
    if (pattern.test(absolute.pathname) || pattern.test(text)) {
      absolute.hash = '';
      return absolute.href;
    }
  }

  return null;
}

export const PRICING_LINK_PATTERN = /pricing|plans/i;
export const CAREERS_LINK_PATTERN = /careers|jobs|hiring|join-us|work-with-us/i;

/** Visible text of a page, capped, used as the pricing page body. */
export function extractVisibleText(html: string, limit = 8000): string {
  const body = stripNonContent(html);
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return stripTags(bodyMatch ? bodyMatch[1] : body).slice(0, limit);
}

/** Paragraph-ish blocks, captured for display only. Never diffed. */
export function extractParagraphs(html: string, limit = 20): string[] {
  const body = stripNonContent(html);
  const results: string[] = [];
  const seen = new Set<string>();
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null && results.length < limit) {
    const text = stripTags(match[1]);
    if (text.length < 12 || text.length > 600) continue;
    const key = canonicalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(text);
  }

  return results;
}

export interface BuildSnapshotInput {
  domain: string;
  url: string;
  homepageHtml: string;
  pricingHtml?: string | null;
  careersHtml?: string | null;
  fetchStatus?: Snapshot['fetchStatus'];
  capturedAt?: string;
  contentHash?: string;
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const html = input.homepageHtml || '';
  // Pricing pages bury the actual prices under a full nav menu, so read far
  // enough into the page to reach them.
  const pricingText = input.pricingHtml ? extractVisibleText(input.pricingHtml, 40000) : null;

  return {
    domain: input.domain,
    url: input.url,
    capturedAt: input.capturedAt || new Date().toISOString(),
    contentHash: input.contentHash || '',
    title: extractTitle(html),
    metaDescription: extractMetaDescription(html),
    headings: extractHeadings(html),
    paragraphs: extractParagraphs(html),
    navLinks: extractInternalLinks(html, input.url),
    pricingPresent: Boolean(input.pricingHtml),
    pricingText,
    pricingAmounts: extractCurrencyAmounts(pricingText),
    careersPresent: Boolean(input.careersHtml),
    careersRoles: input.careersHtml ? extractRoleTitles(input.careersHtml) : [],
    fetchStatus: input.fetchStatus || 'ok',
  };
}

/**
 * Bot-block / consent-wall detection. A blocked fetch must never be diffed,
 * because the "change" is our own access, not the company's site.
 */
const BLOCK_MARKERS = [
  'verify you are human',
  'checking your browser',
  'access denied',
  'attention required',
  'enable javascript and cookies to continue',
  'please enable javascript',
  'captcha',
  'cf-browser-verification',
  'ddos protection by',
  'request blocked',
  'are you a robot',
];

export function looksBlocked(html: string, status?: number): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  if (!html) return true;

  const head = html.slice(0, 20000).toLowerCase();
  if (BLOCK_MARKERS.some((marker) => head.includes(marker))) return true;

  // A page with no title and no headings at all is not something we can diff.
  const text = stripTags(stripNonContent(html));
  return text.length < 200 && !extractTitle(html);
}
