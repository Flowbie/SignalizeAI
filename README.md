# SignalizeAI Extension

SignalizeAI is the browser extension for turning public company websites into usable prospect records.

Current version: `5.4.1`

## What it does

- Prospects the active website or any URL through Quick Website Check
- Shows a tabbed insights flow:
  - Strategy
  - Emails
  - Snapshot
- Generates:
  - what they do
  - company overview
  - value proposition
  - target customer
  - sales readiness
  - best persona recommendation
  - goal
  - outreach angle
- Generates email content:
  - 3 outreach approaches
  - 1 recommended email
  - follow-up emails
- Saves prospects to Supabase
- Shows saved prospects instead of re-prospecting the same saved website by default
- Opens saved or unsaved analyses on the website through `Open in website`
- Syncs with the website saved prospects workspace at `/prospects`
- Supports Batch Prospecting:
  - CSV upload
  - pasted URLs
  - multi-select save
  - bulk outreach + follow-up generation
  - CSV / Excel export
  - compact batch analysis mode for faster large runs
  - resilient fallback email generation when AI responses fail

## Account change detection

Saving a prospect also puts it under watch. A `chrome.alarms` sweep in the
background service worker re-reads watched domains, compares each read against
the previous stored snapshot, and surfaces only what changed.

- What is compared: homepage title, meta description and the first three
  headings; the currency amounts on the pricing page; job titles added to the
  careers page; and top-level navigation links.
- What is deliberately not compared: body paragraphs. The paragraph extractor
  returns different content for client-rendered pages during a background fetch,
  so diffing it produces constant false positives.
- Diffing is deterministic string comparison, never a model. The model only
  writes a one-line summary and a suggested opener about a change the differ has
  already confirmed, via `POST /change-summary`. If that call fails, the raw
  before/after diff is shown instead.
- Noise control: whitespace, casing, smart punctuation, digits (rotating
  counters, copyright years), heading order, tracking parameters and locale
  prefixes are all normalised away before comparison, and near-identical
  rewrites are suppressed by a similarity threshold.
- At most one alert is emitted per domain per cycle. After three consecutive
  failed checks the domain is taken off watch and shown as "cannot check this
  site".
- Check frequency is the paid lever: Free weekly, Pro every 48h, Team daily.
  Watched-account caps come from `plan_limits` via `/quota`.
- Changes appear in the "What changed" view, with an unseen count on the
  extension action badge and on the menu entry.

Checks only run while the browser is open. That is the accepted cost of doing
all fetching client-side: no server ever fetches a third-party website, which is
what keeps the privacy story unchanged in substance.

## Saved Prospect Features

- search and filter
- prospect status tracking
- copy / open in website / delete actions
- inline status editing
- shared data with the website prospect page
- live reflection on the website saved prospects workspace

## Website Sync

The extension syncs with `signalizeai.org` for:

- auth state
- sign-out state
- theme changes
- prospect status updates
- prospect content refreshes
- install detection

## Tech stack

- Manifest V3
- TypeScript
- esbuild
- Supabase auth + storage
- Cloudflare Workers backend

## Local development

1. Install dependencies

```bash
npm install
```

2. Create `.env.local`

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_ENV=dev
```

`API_ENV=dev` points the extension to:

- `https://dev-api.signalizeai.org`
- `http://localhost:3000`

3. Choose a manifest before building

Chrome local:

```bash
cp manifest.chrome.dev.json manifest.json
npm run build
```

Firefox local:

```bash
cp manifest.firefox.dev.json manifest.json
npm run build
```

4. Load the extension

- Chrome: load `SignalizeAI/` as an unpacked extension
- Firefox: load `SignalizeAI/` as a temporary add-on

## Build commands

- `npm run build`
  - builds using the current `manifest.json`
- `npm run build:chrome`
  - production Chrome build
- `npm run build:firefox`
  - production Firefox build
- `npm run build:chrome:dev`
  - dev Chrome manifest + build
- `npm run build:firefox:dev`
  - dev Firefox manifest + build
- `npm run dev`
  - Chromium watch flow
- `npm run dev:firefox`
  - Firefox watch flow

## Checks

- `npm run lint`
- `npm run test`
  - unit tests for the change differ, plus a load test that runs it against real
    captured HTML from three production websites to confirm it fires on genuine
    changes and stays quiet on noise
- `npm run format`
- `npm run format:check`

## Important notes

- Production manifests only inject the website bridge on `signalizeai.org`
- Dev manifests also allow localhost syncing with the website
- `npm run build:chrome` and `npm run build:firefox` overwrite `manifest.json`
- If you switch between prod and local testing, re-copy the correct manifest before rebuilding
- `src/config.ts` is generated by `build.ts` and is not committed. Release builds
  set `BUILD_TARGET=release`, which pins the API to production regardless of
  `API_ENV` in `.env.local`, and the build aborts if the generated config still
  points anywhere else. Use `build:chrome:dev` / `build:firefox:dev` for the dev API.
- Every build clears `extension/*.js` first, so content-hashed chunks from earlier
  (possibly dev-targeted) builds cannot end up in a release package

## Support

- Website: https://signalizeai.org
- Privacy: https://signalizeai.org/privacy
- Email: support@signalizeai.org
