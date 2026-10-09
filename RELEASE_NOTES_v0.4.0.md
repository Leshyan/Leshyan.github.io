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

## v0.4.4 patch — coherent galaxy fly-in

The entry burst was a world-space spherical firework and the camera approached along the index view axis, so the explosion and the galaxy read as two disconnected events.

- The camera now approaches along the owning galaxy's arm: the endpoint sits just outside the star, slightly above the disk plane, looking back across the disk — the star is framed by its galaxy center and arms.
- The burst is flattened into the galaxy's disk plane (world velocities pass through the galaxy quaternion), so it sweeps along the arm instead of exploding spherically.
- Direct-URL fallback poses use the same arm-aligned geometry.

## v0.4.5 patch — chronological glass index

The four-group grid would not scale as articles accumulate, so the index is now a single chronological column (newest first) of frosted-glass cards: translucent panels with backdrop blur and saturation over the living nebula, each accented by its theme's star glyph and hue. Theme grouping remains in the data (card accents), but navigation order is by date.

## v0.4.6 patch — smooth index re-entry on return

Returning from an article snapped the index in at full opacity: the two-phase return commit flips the state attribute in a single frame and the CSS *transition* had no reliable previous-frame computed style to interpolate from, so the 0.45s fade was skipped entirely (measured: opacity 0 -> 1 between adjacent samples).

- Index entry is now a CSS **animation** (0.55s rise + fade) instead of a transition; animations replay from the selector match itself and are immune to the commit's one-frame state flip.
- Big Bang -> index uses the same animation; exit still uses the transition path. Reduced-motion shortens it to 0.01ms.

## v0.4.7 patch — gentler focus-mode star handling + density scaling

Entering an article snapped all sibling stars to a hard 0.055 dim exactly as the selected star was at its brightest, reading as "stars suddenly vanish" when the galaxy rotated into view.

- The selected star now shrinks into the blast origin as it dissolves (scale follows integrity), so its disappearance reads as being drawn into the explosion.
- Siblings in focus mode keep a soft distance-aware glimmer (0.025..0.185 by proximity) instead of a flat hard dim.
- Ambient brightness of article stars now scales with `min(1, 6/count)`: a galaxy holding 60 articles glows like one holding 6, so a growing article count cannot wash out the index view.

## v0.5.0 — the log index

The glass-card column read as generic (uniform panels, dot+title+desc template, backdrop blur hiding the nebula). The index is redesigned as an observational log:

- no boxes, no blur: entries are typographic log rows over the raw nebula, readability kept by a deepened vignette and text shadows;
- a constellation spine on the left carries one theme-colored star node per entry; hover brightens the node and slides the row;
- header "Field Notes" plus a four-theme color legend restores the theme grouping lost with the flat list;
- entries numbered 01.. newest-first; the newest entry is headline-sized, descriptions clamp to two lines;
- mobile: same spine, dates collapsed, legend wrapped.

## v0.5.1 patch — CJK/Latin optical size balance

At equal font-size, CJK glyphs nearly fill the em box while Georgia's Latin x-height sits near 0.48em, so Chinese titles read visibly larger and heavier than English ones.

- Titles containing CJK are detected at build time (`hasCJK`) and scaled to 0.92 of the Latin size on the index (regular + headline entries).
- Article-page h1 gets the same treatment (0.92 scale, line-height 1.14, no negative letter-spacing for CJK).

## v0.5.2 patch — uniform entry titles

Removed the headline sizing rule (newest entry larger): all log entries now share one title size, differing only by the CJK 0.92 optical scale.

## v0.6.0 — adaptive layout & the nine-theme ceiling

- `MAX_THEMES = 9` exported from `themes.ts` and enforced by both the audit and core tests (one theme = one galaxy; ~7±2 is the readable limit — tags, not galaxies, should absorb finer classification).
- Galaxy `position` is now optional: `core/galaxyLayout.ts` deterministically auto-places unpositioned galaxies on fixed layout rings with enforced pairwise separation (core tests check the real config and nine synthetic themes).
- `universe.offset` is optional in article frontmatter: omitted stars are auto-placed by a deterministic hash sampler inside the galaxy disk, collision-aware against siblings (tested for determinism and 40-star density).
- Existing four galaxies and all explicit offsets are unchanged — the deployed look is identical.
- Index legend scrolls horizontally as a single row on mobile instead of wrapping.

## v0.6.1 patch — article code styling

Code blocks shipped completely unstyled (measured live: 0 padding, square corners, opaque highlighter background, 17px generic monospace inheriting the body's 1.9 line-height) while inline code was a bare font swap.

- `pre` becomes a quiet translucent panel (rgba wash + hairline border + 12px radius, `!important` over the highlighter's inline background), 0.82em mono at 1.75 line-height, thin scrollbar.
- Inline `code` becomes a soft tinted chip; `pre code` explicitly resets the chip look.
