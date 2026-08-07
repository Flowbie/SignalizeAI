/**
 * Text normalisation used by the differ.
 *
 * The whole value of change detection depends on not crying wolf, so every
 * rule in this file exists to remove a specific class of observed noise:
 * whitespace, casing, smart punctuation, rotating counters, copyright years,
 * and tracking parameters on links.
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00AD]/g;

const SMART_PUNCTUATION: Array<[RegExp, string]> = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐-―−]/g, '-'],
  [/…/g, '...'],
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
];

/** Query params that change per visit or per campaign and never mean anything. */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'referrer',
  'source',
  '_hsenc',
  '_hsmi',
  'hsa_cam',
  'igshid',
  'vero_id',
  'yclid',
  'ttclid',
  'twclid',
  'li_fat_id',
];

/**
 * Canonical form of a piece of page text.
 * Two strings with the same canonical form are treated as identical.
 */
export function canonicalize(input: string | null | undefined): string {
  if (!input) return '';

  let text = String(input);

  if (typeof text.normalize === 'function') {
    text = text.normalize('NFKC');
  }

  text = text.replace(ZERO_WIDTH, '');

  for (const [pattern, replacement] of SMART_PUNCTUATION) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[\s\-–—|·•:,.]+/, '')
    .replace(/[\s\-–—|·•:,.]+$/, '');
}

/**
 * Canonical form with every run of digits collapsed to `#`.
 *
 * This kills the single most common false positive on marketing homepages:
 * live counters ("Trusted by 1,247 teams"), copyright years, and version
 * numbers in titles. A messaging change is only reported when the text differs
 * with numbers already masked out.
 */
export function canonicalizeIgnoringNumbers(input: string | null | undefined): string {
  return canonicalize(input)
    .replace(/\b(19|20)\d{2}\b/g, '#')
    .replace(/\d[\d,._]*/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words used for similarity scoring. */
export function tokenize(input: string): string[] {
  return canonicalize(input)
    .replace(/[^a-z0-9#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Jaccard similarity over word sets, 0..1.
 * Used to suppress cosmetic rewrites (a typo fix, an added article).
 */
export function similarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });

  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Normalise a link so that tracking parameters, fragments, trailing slashes,
 * casing and protocol differences do not register as a new page.
 */
export function canonicalizeUrl(rawUrl: string, base?: string): string {
  if (!rawUrl) return '';

  let parsed: URL;
  try {
    parsed = base ? new URL(rawUrl, base) : new URL(rawUrl);
  } catch {
    return canonicalize(rawUrl.split('#')[0].split('?')[0]);
  }

  parsed.hash = '';
  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  pathname = pathname.toLowerCase();

  const search = parsed.searchParams.toString();
  return `${host}${pathname}${search ? `?${search}` : ''}`;
}

/** Currency amounts, used for the pricing diff. Returns e.g. ["usd 15", "usd 40"]. */
export function extractCurrencyAmounts(text: string | null | undefined): string[] {
  if (!text) return [];

  const normalized = canonicalize(text);
  const amounts = new Set<string>();

  const symbolPattern = /([$€£¥₹]|usd|eur|gbp|inr)\s?(\d[\d,]*(?:\.\d{1,2})?)/g;
  let match: RegExpExecArray | null;

  while ((match = symbolPattern.exec(normalized)) !== null) {
    const currency = match[1];
    const value = match[2].replace(/,/g, '');
    // Drop trailing ".00" so "$15" and "$15.00" are the same price.
    const cleaned = value.replace(/\.0+$/, '');
    amounts.add(`${currency}${cleaned}`);
  }

  return Array.from(amounts).sort();
}

/** Stable ordering-insensitive comparison of two string lists. */
export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}

export function addedItems(before: string[], after: string[]): string[] {
  const seen = new Set(before);
  return after.filter((item) => !seen.has(item));
}

export function removedItems(before: string[], after: string[]): string[] {
  const seen = new Set(after);
  return before.filter((item) => !seen.has(item));
}
