import test from 'node:test';
import assert from 'node:assert/strict';

import { diffSnapshots, isMeaningfulTextChange } from '../src/watch/diff.js';
import type { Snapshot } from '../src/watch/types.js';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    domain: 'acme.com',
    url: 'https://acme.com',
    capturedAt: '2026-08-01T00:00:00.000Z',
    contentHash: '',
    title: 'Acme - Sales intelligence for teams',
    metaDescription: 'Acme helps revenue teams find the right angle.',
    headings: ['Sales intelligence for teams', 'How it works', 'Customers'],
    paragraphs: ['Some body copy that changes constantly.'],
    navLinks: ['acme.com/pricing', 'acme.com/product', 'acme.com/docs'],
    pricingPresent: true,
    pricingText: 'Starter $0, Pro $15, Team $40',
    pricingAmounts: ['$0', '$15', '$40'],
    careersPresent: true,
    careersRoles: ['Backend Engineer', 'Product Designer'],
    fetchStatus: 'ok',
    ...overrides,
  };
}

// -- what counts as a text change -------------------------------------------

test('identical text is not a change', () => {
  assert.equal(isMeaningfulTextChange('Sales intelligence', 'Sales intelligence'), false);
});

test('whitespace, casing and punctuation are not a change', () => {
  assert.equal(
    isMeaningfulTextChange('Sales  intelligence for teams', 'SALES INTELLIGENCE FOR TEAMS'),
    false
  );
  assert.equal(isMeaningfulTextChange('Don’t guess', "Don't guess"), false);
});

test('a changed counter or year is not a change', () => {
  assert.equal(isMeaningfulTextChange('Trusted by 1,247 teams', 'Trusted by 1,392 teams'), false);
  assert.equal(isMeaningfulTextChange('Acme 2025', 'Acme 2026'), false);
});

test('a near-identical copy edit is not a change', () => {
  assert.equal(
    isMeaningfulTextChange(
      'Sales intelligence for revenue teams everywhere',
      'Sales intelligence for revenue teams everywhere.'
    ),
    false
  );
});

test('a rewritten value proposition is a change', () => {
  assert.equal(
    isMeaningfulTextChange(
      'Sales intelligence for teams',
      'The AI agent platform for go-to-market'
    ),
    true
  );
});

// -- snapshot diffing --------------------------------------------------------

test('no previous snapshot produces no alert', () => {
  const result = diffSnapshots(null, snapshot());
  assert.equal(result.alert, null);
  assert.match(result.skippedReason || '', /no comparable previous snapshot/);
});

test('a blocked fetch is never diffed', () => {
  const blocked = snapshot({ fetchStatus: 'blocked', title: '', headings: [] });
  assert.equal(diffSnapshots(snapshot(), blocked).alert, null);
  assert.equal(diffSnapshots(blocked, snapshot()).alert, null);
});

test('identical snapshots produce no alert', () => {
  assert.equal(diffSnapshots(snapshot(), snapshot()).alert, null);
});

test('matching content hashes short-circuit', () => {
  const before = snapshot({ contentHash: 'abc' });
  const after = snapshot({ contentHash: 'abc', title: 'Something completely different' });
  assert.equal(diffSnapshots(before, after).alert, null);
});

test('reordered headings are not a change', () => {
  const after = snapshot({
    headings: ['Customers', 'Sales intelligence for teams', 'How it works'],
  });
  assert.equal(diffSnapshots(snapshot(), after).alert, null);
});

test('headings beyond the first three are ignored', () => {
  const before = snapshot({ headings: ['A headline here', 'How it works', 'Customers', 'Footer'] });
  const after = snapshot({
    headings: ['A headline here', 'How it works', 'Customers', 'Totally different footer'],
  });
  assert.equal(diffSnapshots(before, after).alert, null);
});

test('a rewritten homepage headline is a major messaging change', () => {
  const after = snapshot({
    title: 'Acme - The AI agent platform for go-to-market',
    headings: ['The AI agent platform for go-to-market', 'How it works', 'Customers'],
  });

  const { alert } = diffSnapshots(snapshot(), after);
  assert.ok(alert);
  assert.equal(alert!.changeType, 'messaging');
  assert.equal(alert!.severity, 'major');
});

test('a meta-description-only edit is minor', () => {
  const after = snapshot({
    metaDescription: 'Acme is the fastest way to research and monitor target accounts.',
  });

  const { alert } = diffSnapshots(snapshot(), after);
  assert.ok(alert);
  assert.equal(alert!.changeType, 'messaging');
  assert.equal(alert!.severity, 'minor');
});

test('a price change beats a messaging change and is reported once', () => {
  const after = snapshot({
    title: 'Acme - A completely new positioning statement',
    headings: ['A completely new positioning statement', 'How it works', 'Customers'],
    pricingAmounts: ['$0', '$19', '$49'],
  });

  const result = diffSnapshots(snapshot(), after);
  assert.ok(result.alert);
  assert.equal(result.alert!.changeType, 'pricing');
  assert.deepEqual(result.alert!.alsoChanged, ['messaging']);
  assert.match(result.alert!.summary, /Also changed: messaging/);
});

test('a pricing page appearing is a major change', () => {
  const before = snapshot({ pricingPresent: false, pricingAmounts: [], pricingText: null });
  const { alert } = diffSnapshots(before, snapshot());
  assert.ok(alert);
  assert.equal(alert!.changeType, 'pricing');
  assert.equal(alert!.severity, 'major');
});

test('a pricing page that suddenly reports no prices is treated as a bad read', () => {
  const after = snapshot({ pricingAmounts: [] });
  assert.equal(diffSnapshots(snapshot(), after).alert, null);
});

test('a new sales role is a major hiring change', () => {
  const after = snapshot({
    careersRoles: ['Backend Engineer', 'Product Designer', 'Account Executive'],
  });

  const { alert } = diffSnapshots(snapshot(), after);
  assert.ok(alert);
  assert.equal(alert!.changeType, 'hiring');
  assert.equal(alert!.severity, 'major');
  assert.match(alert!.afterText, /Account Executive/);
});

test('a new non-sales role is a minor hiring change', () => {
  const after = snapshot({
    careersRoles: ['Backend Engineer', 'Product Designer', 'Technical Writer'],
  });

  const { alert } = diffSnapshots(snapshot(), after);
  assert.ok(alert);
  assert.equal(alert!.changeType, 'hiring');
  assert.equal(alert!.severity, 'minor');
});

test('removed roles are not reported', () => {
  const after = snapshot({ careersRoles: ['Backend Engineer'] });
  assert.equal(diffSnapshots(snapshot(), after).alert, null);
});

test('the first careers read is not treated as a wave of new roles', () => {
  const before = snapshot({ careersPresent: false, careersRoles: [] });
  const { alert } = diffSnapshots(before, snapshot());
  assert.equal(alert, null);
});

test('a single new top-level page is reported', () => {
  const after = snapshot({
    navLinks: ['acme.com/pricing', 'acme.com/product', 'acme.com/docs', 'acme.com/agents'],
  });

  const { alert } = diffSnapshots(snapshot(), after);
  assert.ok(alert);
  assert.equal(alert!.changeType, 'new_page');
  assert.equal(alert!.severity, 'minor');
});

test('a wholesale nav rewrite is treated as a template change, not a launch', () => {
  const after = snapshot({
    navLinks: ['acme.com/a', 'acme.com/b', 'acme.com/c', 'acme.com/d', 'acme.com/e'],
  });

  assert.equal(diffSnapshots(snapshot(), after).alert, null);
});

test('snapshots for different domains are never compared', () => {
  const result = diffSnapshots(snapshot(), snapshot({ domain: 'other.com' }));
  assert.equal(result.alert, null);
  assert.match(result.skippedReason || '', /different domains/);
});
