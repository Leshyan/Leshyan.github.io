# Nebula Blog

A spatial, persistent 3D blog built with Astro, TypeScript and direct Three.js.

The home page begins as a circular off-screen star reservoir viewed through the rectangular browser viewport. Stars respond to the pointer with a softened inverse-square attraction. Clicking collapses the field into the selected point and triggers a Big Bang that forms the topic galaxies. Once the universe settles, the article index appears as an observational log: a single chronological column of entries hung on a constellation spine, each entry accented by its galaxy's hue, with the newest entry as the headline. Opening an article flies the camera to its star through a reversible star-burst transition; returning replays the same path backwards.

## Interaction

- Cover: move the pointer to attract the star field; click to collapse and trigger the Big Bang. On touch devices, tapping the field does the same.
- Index: after the Big Bang, the log is directly readable and every entry is a real link — no flight controls, no pointer lock, identical behavior on desktop and mobile.
- Article entry: click a card; the camera flies toward the star while its burst plays.
- Return / browser Back: play the same article burst and camera path in reverse before restoring the previous universe pose.

## Run

Requirements: Node.js 22.12+.

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run verify
```

`verify` runs the dependency-free audit and behavior tests, then `astro check` and a production `astro build`.

When package installation is unavailable, the offline portion is still repeatable:

```bash
npm run verify:offline
```

## Content workflow

Article metadata has one source of truth: the Markdown file itself. Post files are intentionally flat (`src/content/posts/*.md`) because the current route contract is a single `[slug]` segment.

```yaml
---
title: Building a Stateful Sky
description: A rendering architecture for persistent interactive worlds.
theme: engineering
published: 2026-09-08
universe:
  offset: [1.8, 0.5, -0.18]
---
```

`universe.offset` is optional: omit it and the article star is auto-placed deterministically inside its galaxy (slug-hashed, collision-aware). When written explicitly, X/Y live in the galaxy disk and Z is its thickness.

Topics are capped at `MAX_THEMES = 9` (one theme = one galaxy; readers track roughly 7±2). The offline audit and core tests reject a tenth theme — use tags for finer classification instead. Galaxy `position` is likewise optional: themes without one are auto-placed on deterministic layout rings with enforced separation.

`UniverseShell.astro` derives runtime article-star definitions from the Astro content collection. Topic IDs come from `src/data/themes.ts`; topic spatial definitions come from `src/data/universe.ts`.

## Structure

```text
src/
├─ components/UniverseShell.astro      persistent canvas, article index, route guard, WebGL fallback
├─ content/posts/*.md                  article source of truth
├─ data/
│  ├─ themes.ts                        single source for topic IDs and accent colors
│  └─ universe.ts                      topic-galaxy spatial configuration
├─ layouts/BaseLayout.astro            document shell + Astro ClientRouter
├─ lib/universe/
│  ├─ UniverseEngine.ts                high-level orchestration only
│  ├─ core/                            state, config, math, sampling, movement basis
│  ├─ generation/GalaxyDistribution.ts deterministic galaxy geometry model
│  ├─ render/                          shaders and material factories
│  ├─ systems/                         independent simulation/render systems
│  └─ ui/UniverseHud.ts                DOM adapter for cursor glow and document state
└─ pages/                              home + flat article routes
```

## Current visual model

- **Cover field:** deterministic circular disk larger than the viewport, so off-screen stars participate in attraction and collapse. Resize uses one uniform scale to preserve the circle.
- **Galaxies:** local X/Y spiral disks with Z thickness, central bulge, sparse stellar halo and a separate diffuse cloud layer. Each topic receives an explicit 3D orientation; the disk is not accidentally viewed edge-on because of an X/Z construction plane.
- **Formation:** both galaxy layers start at the actual clicked Big Bang world point. Each Points object converts that world origin through its own inverse transform before the shader migrates particles toward final local coordinates.
- **Article transition:** article star, burst particles and camera share deterministic forward/reverse progress. The selected star truly disappears during entry and reforms during return.
- **Article index:** the cosmos state is a server-rendered chronological log over the raw nebula — constellation spine, per-theme star nodes, headline-sized newest entry, theme legend. The camera holds a deterministic idle sway behind it.

## Robustness

- The persistent WebGL canvas is retained across Astro navigation.
- Browser Back/Forward uses the same home/post transition guard as programmatic navigation.
- Return animation holds its final `article-return` frame until Astro has actually swapped the home document, preventing cover/article flashes.
- If page preparation fails, the engine restores the route that remained mounted instead of leaving a half-completed transition.
- If WebGL initialization fails, the site falls back to a static cover plus normal article links rather than a blank screen.
- WebGL context loss pauses rendering and restarts after restoration.
- Hidden particle systems are removed from draw submission with object visibility, not only zero opacity.
- Dynamic particle position buffers use `DynamicDrawUsage` where CPU updates occur every frame.
- Forming galaxies disable CPU frustum culling; once fully formed, final-shape bounding spheres safely restore it.

See `ARCHITECTURE.md` for ownership rules, `TECHNICAL_DECISIONS.md` for design rationale, and `VERIFICATION.md` for the current validation record.
