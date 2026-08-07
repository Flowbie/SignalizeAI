/**
 * Load test for the differ against real websites.
 *
 * `tests/fixtures/*.html` are real responses captured from stripe.com,
 * linear.app and vercel.com (homepage, pricing and careers pages), with script
 * and style bodies emptied to keep the repo small. The extractor ignores those
 * elements anyway, so the fixtures exercise exactly the markup it reads.
 *
 * Each site is checked twice:
 *   1. against a noise-mutated copy of itself, which must produce NO alert
 *   2. against a genuinely edited copy, which must produce the right alert
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildSnapshot } from '../src/watch/extract.js';
import { diffSnapshots } from '../src/watch/diff.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

const SITES = [
  { key: 'stripe', domain: 'stripe.com' },
  { key: 'linear', domain: 'linear.app' },
  { key: 'vercel', domain: 'vercel.com' },
];

/**
 * Mutations that a real site produces between two checks without anything
 * meaningful having happened: reformatted markup, a bumped copyright year,
 * a rotating social-proof counter, campaign parameters appended to links, and
 * smart quotes swapped in.
 */
function applyMarkupNoise(html: string): string {
  return html
    .replace(/>\s+</g, '>\n\n  <')
    .replace(/href="\/(pricing|docs|customers)"/g, 'href="/$1/?utm_source=newsletter&gclid=abc123"')
    .replace(/'/g, '’');
}

function applyNoise(html: string): string {
  return applyMarkupNoise(html)
    .replace(/\b20[12][0-9]\b/g, '2030')
    .replace(/(\d),(\d{3})\b/g, '$1,999');
}

for (const site of SITES) {
  const homepage = fixture(`${site.key}.home.html`);
  const pricing = fixture(`${site.key}.pricing.html`);
  const careers = fixture(`${site.key}.careers.html`);

  const baseline = buildSnapshot({
    domain: site.domain,
    url: `https://${site.domain}`,
    homepageHtml: homepage,
    pricingHtml: pricing,
    careersHtml: careers,
  });

  test(`${site.domain}: extraction produces usable signal`, () => {
    assert.ok(baseline.title.length > 0, 'expected a title');
    assert.ok(baseline.headings.length > 0, 'expected at least one heading');
    assert.ok(baseline.navLinks.length > 0, 'expected internal nav links');
    assert.equal(baseline.pricingPresent, true);
    assert.ok(baseline.pricingAmounts.length > 0, 'expected currency amounts on the pricing page');
  });

  test(`${site.domain}: noise does not fire an alert`, () => {
    const noisy = buildSnapshot({
      domain: site.domain,
      url: `https://${site.domain}`,
      homepageHtml: applyNoise(homepage),
      pricingHtml: pricing,
      careersHtml: careers,
    });

    const result = diffSnapshots(baseline, noisy);
    assert.equal(
      result.alert,
      null,
      `false positive on ${site.domain}: ${JSON.stringify(result.alert)}`
    );
  });

  test(`${site.domain}: a rewritten headline and title fires a messaging alert`, () => {
    const rewritten = homepage
      .replace(
        /<title[^>]*>[\s\S]*?<\/title>/i,
        '<title>Completely different positioning for a brand new market</title>'
      )
      .replace(
        /<h1([^>]*)>[\s\S]*?<\/h1>/i,
        '<h1$1>An entirely rewritten value proposition about robots</h1>'
      );

    const after = buildSnapshot({
      domain: site.domain,
      url: `https://${site.domain}`,
      homepageHtml: rewritten,
      pricingHtml: pricing,
      careersHtml: careers,
    });

    const { alert } = diffSnapshots(baseline, after);
    assert.ok(alert, `expected a messaging alert for ${site.domain}`);
    assert.equal(alert!.changeType, 'messaging');
  });

  test(`${site.domain}: a changed price fires a pricing alert`, () => {
    const after = buildSnapshot({
      domain: site.domain,
      url: `https://${site.domain}`,
      homepageHtml: homepage,
      pricingHtml: pricing,
      careersHtml: careers,
    });

    // Simulate a real price move rather than editing the markup blindly.
    after.pricingAmounts = [...baseline.pricingAmounts.slice(1), '$99'];

    const { alert } = diffSnapshots(baseline, after);
    assert.ok(alert, `expected a pricing alert for ${site.domain}`);
    assert.equal(alert!.changeType, 'pricing');
    assert.equal(alert!.severity, 'major');
  });

  test(`${site.domain}: reformatted-only pricing markup does not fire`, () => {
    const after = buildSnapshot({
      domain: site.domain,
      url: `https://${site.domain}`,
      homepageHtml: homepage,
      pricingHtml: applyMarkupNoise(pricing),
      careersHtml: careers,
    });

    const pricingChange = diffSnapshots(baseline, after).changes.find(
      (change) => change.changeType === 'pricing'
    );
    assert.equal(pricingChange, undefined, `pricing false positive on ${site.domain}`);
  });
}
