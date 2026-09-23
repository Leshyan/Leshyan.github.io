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

## v0.4.2 patch — near-camera nebula clarity

Flying toward an article star drove every galaxy sprite into its point-size cap (42px), so the background nebula degenerated into large soft additive bokeh discs.

- Point-size cap lowered to 26px and the uncapped size is now passed to the fragment shader (`vSizePx`).
- Sprites above ~12px get deterministic hash-grain ("micro-star" sparkle) modulated into their alpha, so capped sprites resolve into clumps of fine stars instead of smooth discs; brightness is compensated to keep the galaxy's overall luminance.

## v0.4.3 patch — tighter Big Bang → index handoff

Galaxy formation completed at 78% of the Big Bang window, but the cosmos switch (and therefore the article index fade-in) waited for 100% — about 0.6s of dead time plus a 0.6s CSS fade (~1.2s of perceived wait after the nebulae had already settled).

- Explosion-spark fade now completes by 82% and the camera push-in by 82%, so the cosmos switch happens at 82% of the window with no visual pop.
- Index fade-in tightened (0.6s -> 0.45s opacity, 0.9s -> 0.7s transform).
