# WinPilot Companion (mobile) — placeholder

A lightweight, installable mobile web app that mirrors WinPilot's pages
and design language. Right now it is **static UI only** — every page
shows placeholder content, exactly like the desktop app's pages before
their features are implemented. Nothing here talks to a real PC yet.

This is intentionally plain HTML/CSS/JS (no React/build step) since it's
a small, mostly-static shell — no need for the desktop app's build
tooling here.

## Preview it locally

Any static file server works, e.g.:

```bash
cd mobile
npx serve .
```

Then open the printed URL on your phone (same Wi-Fi network) or in a
desktop browser's device toolbar. Chrome/Edge on Android will offer an
"Install app" button (top bar) once served over `http://localhost` or
HTTPS — that's the real `beforeinstallprompt` flow, not a mock. iOS
Safari doesn't support that event; there, "install" means the user's own
Share → Add to Home Screen.

## What's real vs. placeholder

**Real:** tab navigation, the PWA manifest/icons (installable as an app),
a minimal offline-capable service worker.

**Placeholder:** every page's content (Dashboard stats, Winget actions,
AI Assistant, Windows Controls, and the Gaming Mode/Combos/Plugins/
Settings grouped under "More") — all static, no live data.

## What's needed before this is real

See "Roadmap: mobile companion" in the root `README.md` — in short, the
desktop WinPilot app needs to expose a small local API, and this app
needs a pairing/connect flow to reach it over the local network. Until
that exists, this stays a visual shell.
