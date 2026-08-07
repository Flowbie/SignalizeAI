# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/SignalizeAI/SignalizeAI/security/advisories/new),
or email **support@signalizeai.org**.

Include what you can: what you found, how to reproduce it, and what an attacker
could do with it. A proof of concept helps but is not required.

You can expect a first reply within 72 hours, and an assessment within a week.
If the report is valid you will be credited in the release notes unless you
would rather not be.

## Supported versions

Only the latest release is supported. The extension auto-updates through the
Chrome Web Store and Firefox Add-ons, so there is no backport branch.

## What this extension can access

Worth knowing when judging impact:

- `host_permissions` includes `<all_urls>`, because prospecting reads the page
  you are currently on and re-reads watched domains in the background.
- Page content is read in the browser. The backend is not given a crawler.
- Authentication is Google OAuth through Supabase. Tokens live in
  `chrome.storage`, never in `localStorage` on a web page.
- The API key for the model provider is held server side, in the Cloudflare
  Worker. It is never shipped in the extension bundle.

## Out of scope

- Anything requiring a user to install a modified build of the extension.
- Rate limits on the public marketing site.
- Reports produced by an automated scanner with no demonstrated impact.
