# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

FootStats is a mobile-first PWA for tracking football (soccer) match stats for a 13-year-old center back. The goal is to demonstrate "midfield influence" — the rating system is deliberately weighted toward forward-looking stats (forward passes 25%, ball carries 25%, pushes into midfield 20%) rather than defensive ones, to support the argument that she should play as a midfielder.

## Running locally

Open `index.html` directly in a browser for basic testing. For full PWA functionality (service worker, offline, "Add to Home Screen"), serve over HTTPS:

```bash
# Quick local HTTPS with Python (requires mkcert or similar for trusted cert)
npx serve .        # HTTP only — good enough for testing
python3 -m http.server 8080
```

No build step. No dependencies. No package.json.

## Deployment (to install on iPhone without App Store)

1. Push to GitHub, enable **GitHub Pages** on the `main` branch root
2. Open the Pages URL in **Safari on iPhone**
3. Tap Share → **Add to Home Screen**
4. The app then works fully **offline** (service worker caches all assets)

When assets change, bump the cache name in `sw.js` (`footstats-v1` → `footstats-v2`) so users get the updated version.

## File structure

```
index.html      — all views as hidden <div>s, shown/hidden by JS
css/styles.css  — single stylesheet, dark green theme, iPhone safe-area aware
js/app.js       — all app logic (no framework, no build)
sw.js           — service worker for offline caching
manifest.json   — PWA manifest (portrait lock, standalone display)
icon.svg        — home screen icon
```

## Architecture

The app is a single-page app with **view switching** (show/hide `div.view` elements). There is no router library — `showView(name)` is the only navigation primitive.

**State** lives in a single `state` object in memory. Matches are persisted to `localStorage` under the key `footstats_v1`.

**Views and their entry functions:**

| View ID            | Entry function       | Notes |
|--------------------|----------------------|-------|
| `view-home`        | `renderHome()`       | Shows last 3 completed matches |
| `view-setup`       | `initSetup()`        | Segment controls write to `state.setup` |
| `view-recording`   | `startPeriod()`      | Tap to increment; 600ms hold to decrement |
| `view-period-end`  | `showPeriodEnd()`    | "Next period" or "See results" |
| `view-match-end`   | `showMatchEnd()`     | Calculates and saves rating |
| `view-history`     | `showHistory()`      | Full list of completed matches |
| `view-match-detail`| `openDetail(match)`  | Per-match stats + delete |

## Key data model

```js
Match {
  id, date, opponent, matchType ('7v7'|'9v9'),
  numPeriods, position, periods[], completed, rating
}
Period { number, stats: { touches, forwardPasses, carries, tackles, midfield } }
Rating { stars (1-5), label, sub, details }
```

## Rating system

`calcRating()` in `app.js`. Per-period averages are compared against `BENCHMARKS` (defined per match type). Each stat gets a 0–1 score (`actual/perPeriod ÷ benchmark.good`, capped at 1). Weighted sum × 5 = stars.

**To adjust benchmarks or weights**, edit `BENCHMARKS` and `WEIGHTS` constants at the top of `js/app.js`.

## Touch handling

Stat buttons use `touchstart`/`touchend` with `e.preventDefault()` to avoid scroll interference and double-firing. A 600ms `setTimeout` in `touchstart` triggers decrement if held; `touchend` triggers increment if the timer hasn't fired. `touchmove` and `touchcancel` cancel the timer to prevent accidental increments during scroll.
