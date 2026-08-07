# Build instructions

For add-on reviewers reproducing the submitted package from source, and for
anyone building the extension locally.

The shipped bundles are minified by esbuild, which is why source accompanies
the AMO submission. These steps reproduce the exact contents of the submitted
`extension/` directory.

## Environment used for the submitted build

|      |              |
| ---- | ------------ |
| OS   | Linux x86_64 |
| Node | v22.22.2     |
| npm  | 10.9.7       |

Any Node 22.x should reproduce the same output. The build pins its own
toolchain through `package-lock.json`, so use `npm ci` rather than
`npm install`.

## One required environment value

`build.ts` generates `src/config.ts` at build time and needs
`VITE_SUPABASE_ANON_KEY`. That file is deliberately not committed, so it is not
in the source archive.

The value is a Supabase **anon (publishable) key**. It is designed to be
embedded in client code, is protected server-side by row level security, and is
already present in plain text inside the submitted package. Take it from there
so your build matches byte for byte:

```bash
grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' extension/background.js | head -1
```

`VITE_SUPABASE_URL` is optional. It defaults to the same project URL used for
the submitted build.

## Steps

```bash
# 1. Install exactly the locked dependency tree
npm ci

# 2. Supply the publishable key extracted above
echo 'VITE_SUPABASE_ANON_KEY=<value from the submitted package>' > .env.local

# 3. Build the Firefox release target
npm run build:firefox
```

That script copies `manifest.firefox.release.json` over `manifest.json`, sets
`BUILD_TARGET=release`, and runs `build.ts`. Output lands in `extension/`.

Use `npm run build:chrome` for the Chrome target. The two differ only in the
manifest: Chrome uses a service worker and `side_panel`, Firefox uses a
background script and `sidebar_action`.

## Verifying the result

```bash
npm test          # unit tests for the change differ
npm run lint
npm run format:check
```

The build refuses to produce a release artifact pointing at development
endpoints: `build.ts` re-reads the generated `src/config.ts` and aborts if it
contains `dev-api.signalizeai.org` or `localhost`. It also clears
`extension/*.js` before every build, so content-hashed chunks from an earlier
build cannot survive into a package.

## What is in the package, and what is not

The submitted package is an allowlist, not the whole repository:
`manifest.json`, `icons/`, `fonts/`, `extension/`, `sidepanel.html`,
`sidepanel.css`, `sidepanel-styles/` and `sidepanel-partials/`.

`sidepanel-partials/` ships because `sidepanel.html` pulls those fragments in
at runtime through `data-include`.

## Third-party code

`exceljs` is bundled for the spreadsheet export. It is the published npm
package, unmodified, pinned in `package-lock.json`. `web-ext lint` reports
`DANGEROUS_EVAL` inside it; that is the library's own minified code, not remote
code, and nothing is fetched at runtime. The extension's content security
policy is `script-src 'self'`.
