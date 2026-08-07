/**
 * Store screenshot generator for the Chrome Web Store and AMO.
 *
 * Renders the real side panel stylesheet against real markup, so these cannot
 * drift from the product the way a hand-drawn mockup does. Follows
 * gtm/store-assets/screenshots.md: light theme throughout, 1280x800, panel at
 * true scale on the right, caption and brand wash on the left, and only the
 * invented domain family so nothing implies a real customer.
 *
 * Usage, from the repo root:
 *   python3 -m http.server 8901 &
 *   node store-publishing/capture.mjs
 */
import { chromium } from '/home/royalpinto007/Open-Source/Hookprint/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '..');
const OUT = path.join(DIR, 'store-publishing');
const BASE = 'http://127.0.0.1:8901';

const ic = (p, w = 18) =>
  `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const CHEVRON = '<polyline points="6 9 12 15 18 9"></polyline>';
const REFRESH =
  '<path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline>';
const MAIL =
  '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path>';

/** One change card in the feed. */
const changeCard = ({ type, label, domain, when, sev, unseen, summary, before, after, opener }) => `
<div class="change-card change-card--${sev}${unseen ? ' change-card--unseen' : ''}">
  <div class="change-card-header">
    <div class="change-card-heading">
      <span class="change-badge change-badge--${type}">${label}</span>
      <span class="change-domain">${domain}</span>
    </div>
    <span class="change-date">${when}</span>
  </div>
  <p class="change-summary">${summary}</p>
  <div class="change-diff">
    ${before ? `<div class="change-diff-row change-diff-row--before"><span class="change-diff-label">Before</span><span class="change-diff-text">${before}</span></div>` : ''}
    <div class="change-diff-row change-diff-row--after"><span class="change-diff-label">${before ? 'After' : 'Added'}</span><span class="change-diff-text">${after}</span></div>
  </div>
  ${opener ? `<p class="change-opener">${opener}</p>` : ''}
  <div class="change-card-actions">
    <button class="secondary-btn secondary-btn--primary">Copy opener</button>
    <button class="secondary-btn">History</button>
    <button class="secondary-btn">Dismiss</button>
  </div>
</div>`;

/** One saved prospect row. */
const savedRow = ({ title, domain, status, label, watched, meta }) => `
<div class="saved-item">
  <div class="saved-item-header">
    <div class="header-info">
      <div class="saved-item-title">${title}</div>
      <div class="saved-item-site-row">
        <a href="#" class="saved-item-site-link">${domain}</a>
        <div class="saved-item-badge-row"><div class="saved-status-inline">
          <span class="saved-status-pill saved-status-pill--${status}">${label}</span>
        </div></div>
      </div>
      <div class="saved-item-meta"><div class="saved-watch-row">
        <label class="saved-watch-toggle"><input type="checkbox" class="saved-watch-checkbox" ${watched ? 'checked' : ''} /><span>Watch</span></label>
        ${meta ? `<span class="saved-watch-state">${meta}</span>` : ''}
      </div></div>
    </div>
  </div>
</div>`;

const label = (k, v) => `<p><strong>${k}</strong> ${v}</p>`;

const SHOTS = [
  {
    file: '1-change-alert.png',
    caption: 'Know when your accounts change.',
    sub: 'Pricing, hiring, and positioning moves, with the before and after.',
    panel: `
      <div id="changes-view">
        <div class="content-header"><h3 class="content-title">What changed</h3>
          <div class="header-actions-right"><button class="secondary-btn">${ic(REFRESH)}</button></div></div>
        <p class="changes-meta">2 new &middot; 9 of 100 accounts watched &middot; checked every 48 hours</p>
        <div class="changes-list">
          <div class="changes-day"><span class="changes-day-label">Today</span><span class="changes-day-count">2</span></div>
          ${changeCard({
            type: 'pricing',
            label: 'Pricing',
            domain: 'northwind-logistics.com',
            when: 'Today',
            sev: 'major',
            unseen: true,
            summary: 'northwind-logistics.com changed the prices on its pricing page.',
            before: 'Starter $49, Growth $149',
            after: 'Starter $79, Growth $149, Enterprise contact us',
            opener:
              'Saw you moved Starter to $79 and added an enterprise tier. Usually that means you are selling upmarket. Worth a conversation?',
          })}
          ${changeCard({
            type: 'hiring',
            label: 'Hiring',
            domain: 'harborline-freight.com',
            when: 'Today',
            sev: 'minor',
            unseen: true,
            summary: 'harborline-freight.com posted 2 new engineering roles.',
            before: '',
            after: 'Staff Platform Engineer, Senior Backend Engineer',
          })}
        </div>
      </div>`,
  },
  {
    file: '2-watch-list.png',
    caption: 'Your accounts, checked for you.',
    sub: 'Save an account and it gets re-read on a schedule.',
    panel: `
      <div id="saved-analyses" class="website-content-card">
        <div class="content-header"><h3 class="content-title">Saved Prospects</h3>
          <div class="header-actions-right">
            <button class="secondary-btn">${ic('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m9 12 2 2 4-4"></path>')}</button>
            <button class="secondary-btn">${ic('<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>')}</button>
            <button class="secondary-btn">${ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline>')}</button>
          </div></div>
        <div class="search-bar-container"><div class="search-input-wrapper"><div class="input-relative">
          ${ic('<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>', 14).replace('<svg', '<svg class="search-icon-inner"')}
          <input type="text" id="saved-search-input" placeholder="Search saved prospects..." />
        </div></div></div>
        <div class="saved-list">
          ${savedRow({ title: 'Northwind Logistics', domain: 'northwind-logistics.com', status: 'contacted', label: 'Contacted', watched: true, meta: '' })}
          ${savedRow({ title: 'Harborline Freight', domain: 'harborline-freight.com', status: 'not_contacted', label: 'Not contacted', watched: true, meta: '' })}
          ${savedRow({ title: 'Castleford Labs', domain: 'castleford-labs.com', status: 'follow_up', label: 'Follow-up due', watched: true, meta: '' })}
          ${savedRow({ title: 'Merrow Supply', domain: 'merrow-supply.com', status: 'not_contacted', label: 'Not contacted', watched: true, meta: '' })}
          ${savedRow({ title: 'Talbot Analytics', domain: 'talbot-analytics.com', status: 'contacted', label: 'Contacted', watched: true, meta: '' })}
        </div>
      </div>`,
  },
  {
    file: '3-the-brief.png',
    caption: 'Every account, read and summarised.',
    sub: 'What they do, who they sell to, and how ready they are.',
    panel: `
      <div class="website-content-card" style="padding:20px">
        <div class="content-header"><h3 class="content-title">Insights</h3>
          <div class="header-actions-right"><button class="secondary-btn">${ic(REFRESH)}</button></div></div>
        <div class="saved-item-body" style="border:0;padding:0;background:transparent">
          ${label('What they do', 'Freight visibility software for mid-market brokers.')}
          ${label('Company overview', 'Northwind Logistics gives brokers a single view of shipments across carriers, with exception alerts and customer-facing tracking.')}
          ${label('Value proposition', 'Fewer blind shipments and fewer status calls.')}
          ${label('Target customer', 'Mid-market freight brokers running 500 to 5,000 loads a month.')}
          ${label('Sales readiness', '82')}
          ${label('Best persona recommendation', 'VP of Operations')}
        </div>
      </div>`,
  },
  {
    file: '4-the-email.png',
    caption: 'Outreach written from the change.',
    sub: 'Grounded in what actually moved, not a template.',
    panel: `
      <div class="website-content-card" style="padding:20px">
        <div class="content-header"><h3 class="content-title">Insights</h3>
          <div class="header-actions-right"><button class="secondary-btn">${ic(REFRESH)}</button></div></div>
        <div class="saved-item-body" style="border:0;padding:0;background:transparent">
          ${label('Goal', 'Open a conversation about the new enterprise tier.')}
          <hr class="saved-item-divider" />
          ${label('Subject', 'Your new enterprise tier')}
          ${label('Body', 'Hi, I noticed Northwind moved Starter to $79 and added an enterprise tier this week. That usually means larger brokers are asking for something the self-serve plan cannot do. If that is where the pull is coming from, I would be glad to compare notes on what those buyers ask for.')}
          <div style="display:flex;gap:8px;margin-top:12px">
            <button style="padding:7px 14px;font-size:12px;font-weight:600;border:0;border-radius:8px;background:var(--accent-color);color:var(--accent-on);font-family:inherit;cursor:pointer">Copy email</button>
            <button style="padding:7px 14px;font-size:12px;font-weight:500;border:1px solid var(--border-medium);border-radius:8px;background:var(--bg-secondary);color:var(--text-secondary);font-family:inherit;cursor:pointer">Follow-ups</button>
          </div>
        </div>
      </div>`,
  },
  {
    file: '5-batch.png',
    caption: 'Do it for a whole list.',
    sub: 'Paste URLs or upload a CSV and prospect them together.',
    panel: `
      <div class="website-content-card" style="padding:20px">
        <div class="content-header"><h3 class="content-title">Batch Prospecting</h3></div>
        <div class="saved-item-body" style="border:0;padding:0;background:transparent">
          ${label('Queue', '10 URLs')}
        </div>
        <div class="saved-list" style="margin-top:12px">
          ${savedRow({ title: 'Northwind Logistics', domain: 'northwind-logistics.com', status: 'contacted', label: 'Done', watched: false, meta: '' })}
          ${savedRow({ title: 'Harborline Freight', domain: 'harborline-freight.com', status: 'contacted', label: 'Done', watched: false, meta: '' })}
          ${savedRow({ title: 'Castleford Labs', domain: 'castleford-labs.com', status: 'contacted', label: 'Done', watched: false, meta: '' })}
          ${savedRow({ title: 'Merrow Supply', domain: 'merrow-supply.com', status: 'not_contacted', label: 'In queue', watched: false, meta: '' })}
          ${savedRow({ title: 'Talbot Analytics', domain: 'talbot-analytics.com', status: 'not_contacted', label: 'In queue', watched: false, meta: '' })}
        </div>
      </div>`,
  },
];

const logo =
  'data:image/png;base64,' + fs.readFileSync(path.join(DIR, 'icons/128.png')).toString('base64');

const page = (shot) => `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${BASE}/sidepanel.css">
<style>
  html,body{margin:0;padding:0;width:1280px;height:800px;overflow:hidden;background:#ffffff}
  .canvas{display:flex;width:1280px;height:800px;font-family:var(--font-ui)}
  .left{flex:1;padding:72px 56px;display:flex;flex-direction:column;justify-content:center;
    background:radial-gradient(120% 90% at 8% 12%, rgba(34,211,238,.14), transparent 60%),
               radial-gradient(90% 80% at 0% 100%, rgba(59,91,253,.10), transparent 62%), #ffffff}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:44px}
  .brand img{width:52px;height:52px;border-radius:13px}
  .brand span{font-size:30px;font-weight:700;letter-spacing:-.03em;color:#0a0a0b}
  .brand span i{font-style:normal;color:#0e7490}
  h1{font-size:46px;line-height:1.1;letter-spacing:-.035em;margin:0 0 20px;color:#0a0a0b;max-width:15ch;text-wrap:balance}
  p.sub{font-size:19px;line-height:1.5;color:#56565e;margin:0;max-width:30ch}
  .right{width:520px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#f4f4f5,#e9e9ec)}
  .device{position:relative;width:400px;max-height:704px;overflow:hidden;border-radius:22px;background:var(--bg-primary);
    box-shadow:0 26px 60px rgba(10,10,11,.20), 0 0 0 1px rgba(10,10,11,.07);padding:16px;
    /* Store thumbnails render at about a third size, so the panel is scaled up
       rather than captured at its true 14px base, per screenshots.md. */
    font-size:15px}
  /* Content taller than the frame is faded out at the bottom, so a panel that
     genuinely scrolls reads as scrollable rather than as a screenshot that got
     chopped through a button. */
  .device::after{content:'';position:absolute;left:0;right:0;bottom:0;height:72px;pointer-events:none;
    background:linear-gradient(to bottom, rgba(250,250,250,0), var(--bg-primary))}
</style></head>
<body><div class="canvas">
  <div class="left">
    <div class="brand"><img src="${logo}" alt=""><span>Signalize<i>AI</i></span></div>
    <h1>${shot.caption}</h1>
    <p class="sub">${shot.sub}</p>
  </div>
  <div class="right"><div class="device">${shot.panel}</div></div>
</div></body></html>`;

fs.mkdirSync(path.join(DIR, 'qa-preview'), { recursive: true });
const browser = await chromium.launch();
for (const shot of SHOTS) {
  const tmp = `qa-preview/shot-${shot.file.replace('.png', '')}.html`;
  fs.writeFileSync(path.join(DIR, tmp), page(shot));
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('requestfailed', (r) => errs.push(r.url()));
  await p.goto(`${BASE}/${tmp}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, shot.file) });
  console.log(shot.file, errs.length ? `FAILED REQUESTS: ${errs.slice(0, 2)}` : 'ok');
  await p.close();
}
await browser.close();
