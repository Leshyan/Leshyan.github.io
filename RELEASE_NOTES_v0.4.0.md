# Nebula Blog v0.4.0 release notes — the index edition

This revision replaces free first-person flight with a directly visible article index, and is the root-cause fix for the incoherent mobile experience of v0.3.

## Why

The v0.3 flight model (pointer lock + WASD) was desktop-only by input, but the state machine happily ran on touch: a tap could burn the one-way cover → Big Bang sequence and strand the user in a cosmos they could neither navigate nor leave. The mobile "support" was an overlay link list competing with the desktop cover copy on the same screen.

## What changed

- **Article index (cosmos state):** after the Big Bang the universe settles into an ambient nebula field and a server-rendered, theme-grouped card catalog fades in. Every article is a real `href` link styled as a star card (galaxy-hue accent, title, description, date). Crawlable, no-JS safe, identical on desktop and touch.
- **Flight removed:** `FlightController`, pointer lock, WASD, crosshair, flight HUD, focus labels and the cosmos guide are gone. Cosmos-state canvas clicks are intentionally inert. `core/navigation.ts` remains as a tested pure module for a future touch-native flight layer.
- **Camera:** the cosmos pose holds a deterministic idle sway (no input-driven motion); article entry snapshots it and flies to the star; return replays the identical path in reverse — unchanged from v0.3.
- **Single color source:** `THEME_RGB` in `data/themes.ts` now drives both the DOM index accents and the WebGL theme colors.
- **HUD:** `UniverseHud` shrinks to cursor glow + document state attributes.
- **Docs:** README / ARCHITECTURE / TECHNICAL_DECISIONS / VERIFICATION rewritten to match the actual behavior.

## Mobile

The index is the only navigation surface, so the v0.3 dead-end states (tap into Big Bang, then stuck) no longer exist. Cover → Big Bang → readable article list → article → reverse return works identically with mouse and touch.

## Verification

`npm run verify` (offline audit + syntax scan + core tests + `astro check` + production build) passes; headless-Chromium smoke covers cover → Big Bang → index → article → reverse return → Back/Forward on desktop and mobile viewports.

## v0.4.1 patch — navigation latency

Measured on the deployed site: clicking an article card took ~1.8s before the article rendered — the document fetch started only after the 1s entry animation finished (serialized loader), then waited the full Pages RTT (~730ms).

- The navigation loader now starts the document fetch immediately and awaits it **in parallel with** the entry/return animation; the network wait hides inside the animation window.
- Astro `prefetch: { prefetchAll: true, defaultStrategy: 'viewport' }` warms the HTTP cache for all article pages (and the home back-link) while the reader is on the index, so the concurrent fetch usually resolves from cache.
- Result: article renders when the fly-in ends (~1.05–1.1s), independent of network latency.
