import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalize,
  canonicalizeIgnoringNumbers,
  canonicalizeUrl,
  extractCurrencyAmounts,
  sameSet,
  similarity,
} from '../src/watch/normalize.js';

test('canonicalize collapses whitespace and casing', () => {
  assert.equal(canonicalize('  Sales   Intelligence\n For Teams '), 'sales intelligence for teams');
  assert.equal(canonicalize('SALES INTELLIGENCE'), canonicalize('sales intelligence'));
});

test('canonicalize normalises smart punctuation and zero-width characters', () => {
  assert.equal(canonicalize('Don’t guess — know'), canonicalize("Don't guess - know"));
  assert.equal(canonicalize('Sig​nalize'), 'signalize');
});

test('canonicalize strips leading and trailing separators', () => {
  assert.equal(canonicalize('| Pricing |'), 'pricing');
  assert.equal(canonicalize('Pricing.'), 'pricing');
});

test('canonicalizeIgnoringNumbers masks counters and years', () => {
  assert.equal(
    canonicalizeIgnoringNumbers('Trusted by 1,247 teams'),
    canonicalizeIgnoringNumbers('Trusted by 1,391 teams')
  );
  assert.equal(
    canonicalizeIgnoringNumbers('Acme Inc. © 2025'),
    canonicalizeIgnoringNumbers('Acme Inc. © 2026')
  );
});

test('similarity is high for copy edits and low for rewrites', () => {
  assert.ok(similarity('Sales intelligence for teams', 'Sales intelligence for teams.') > 0.9);
  assert.ok(similarity('Sales intelligence for teams', 'The fastest way to close deals') < 0.3);
});

test('canonicalizeUrl drops tracking params, fragments and trailing slashes', () => {
  assert.equal(
    canonicalizeUrl('https://WWW.Example.com/Pricing/?utm_source=x&gclid=y#tiers'),
    canonicalizeUrl('https://example.com/pricing')
  );
  assert.equal(
    canonicalizeUrl('https://example.com/pricing?plan=pro'),
    'example.com/pricing?plan=pro'
  );
});

test('extractCurrencyAmounts normalises formatting', () => {
  assert.deepEqual(extractCurrencyAmounts('Pro is $15.00 per month'), ['$15']);
  assert.deepEqual(
    extractCurrencyAmounts('Starter $0, Pro $15, Team $40'),
    ['$0', '$15', '$40'].sort()
  );
  assert.deepEqual(extractCurrencyAmounts('$1,200 per year'), ['$1200']);
});

test('sameSet ignores ordering', () => {
  assert.ok(sameSet(['a', 'b', 'c'], ['c', 'a', 'b']));
  assert.ok(!sameSet(['a', 'b'], ['a', 'b', 'c']));
});
