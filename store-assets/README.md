# Store assets

Chrome Web Store and AMO screenshots, 1280x800 PNG.

Regenerate after any UI change:

```bash
python3 -m http.server 8901 &
node store-assets/capture.mjs
```

The generator renders the **real** `sidepanel.css` against real component
markup, so these cannot drift from the shipped product the way a redrawn
mockup does. It follows `gtm/store-assets/screenshots.md`: light theme
throughout, panel at true scale on the right, caption and brand wash on the
left, and only the invented domain family so nothing implies a real customer.

Content taller than the frame is faded rather than cut, so a panel that
genuinely scrolls reads as scrollable instead of chopped.

| File                 | Caption                             |
| -------------------- | ----------------------------------- |
| `1-change-alert.png` | Know when your accounts change.     |
| `2-watch-list.png`   | Your accounts, checked for you.     |
| `3-the-brief.png`    | Every account, read and summarised. |
| `4-the-email.png`    | Outreach written from the change.   |
| `5-batch.png`        | Do it for a whole list.             |

Order matters: most store visitors see only the first two, and screenshot 1 is
the only one showing something a chat assistant cannot produce.
