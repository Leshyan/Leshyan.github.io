# Nebula Blog architecture

The project is split into a document layer and a persistent world layer. Astro owns routes, content and document markup. Three.js owns one long-lived universe. Their boundary stays deliberately small so rendering, navigation and content can evolve independently.

## Runtime ownership

### `UniverseEngine`

`UniverseEngine` is the orchestrator. It owns renderer/camera lifetime, RAF, the high-level state machine, route synchronization and camera-transition coordination. It does **not** generate galaxy distributions, own input state, maintain DOM labels directly, or duplicate article metadata.

The file is kept under an offline-enforced orchestration-size budget so simulation logic cannot silently accumulate back into a new “god class.”

### Core

- `core/UniverseStateMachine.ts` — allowed state transitions and state-local elapsed time.
- `core/config.ts` — timing, camera, focus, movement and particle budgets.
- `core/math.ts` — deterministic PRNG and easing helpers.
- `core/sampling.ts` — pure isotropic disk/sphere/Gaussian sampling.
- `core/navigation.ts` — pure camera-relative movement basis.
- `core/nebulaTransform.ts` — canonical local-galaxy ↔ world transform logic.

### Generation

- `generation/GalaxyDistribution.ts` — deterministic final galaxy particle coordinates and attributes. It has no Three.js dependency and can be statistically regression-tested offline.

### Render

- `render/shaders.ts` — shader source only.
- `render/materials.ts` — material, glow-texture and exhaustive theme-color factories.

### Systems

- `IntroStarField.ts` — circular cover reservoir, pointer gravity, collapse and Big Bang particles.
- `BackgroundStarField.ts` — distant deterministic stellar background.
- `NebulaSystem.ts` — two-layer topic galaxies, formation-origin transforms, final-shape frustum culling.
- `ArticleStarSystem.ts` — article-star rendering and distance visibility in the ambient scene.
- `ArticleBurstSystem.ts` — deterministic article burst sampled identically forward/reverse.

### UI

- `ui/UniverseHud.ts` — DOM adapter for cursor glow and document-level state attributes.
- `components/UniverseShell.astro` — server-renders the article index: theme-grouped cards with real `href` links, accented by `THEME_RGB`. The index is static markup, so it is crawlable, works without JavaScript, and is the single navigation surface for desktop and touch.

## Content ownership

`src/data/themes.ts` is the single source for topic IDs. `src/data/universe.ts` defines the topic galaxies. Markdown frontmatter is the sole source for article-visible metadata and the article's local galaxy offset.

`UniverseShell.astro` reads the content collection and constructs `ArticleStarDefinition[]`; there is no separate hard-coded article-star registry.

Post files are flat (`content/posts/*.md`) because the route is currently `pages/posts/[slug].astro`. Supporting nested slugs requires an explicit routing change rather than silently accepting nested content the router cannot address correctly.

## Coordinate ownership

Each galaxy has one static object transform: world position plus explicit quaternion orientation. Procedural galaxy geometry is built in local X/Y with Z used as physical thickness.

Article offsets are expressed in that same local coordinate system and converted through the same transform helper. This prevents article stars from drifting away from or being oriented differently from their owning galaxy.

The group transform remains fixed at runtime. Subtle living motion is shader-local only, so article world positions and final galaxy spatial meaning stay stable.

## Cover geometry

The browser is treated as a crop through a larger circular stellar reservoir. Initial stars are sampled inside that off-screen disk, not directly inside viewport X/Y bounds. Pointer gravity therefore draws matter from beyond the four screen edges and does not encode a rectangular initial envelope into the collapse.

On resize, the reservoir is scaled uniformly using its new circumscribed radius. Pointer/collapse targets are remapped independently in screen-normalized coordinates.

## Route ownership

`UniverseShell.astro` owns home/post route-boundary navigation. Astro currently documents `astro:before-preparation` as occurring before the next document is requested/browser state is changed and exposes `loader()` as the replaceable async loading phase. The shell wraps that loader:

- home → post: await `engine.prepareEntry(slug)`, then load the article;
- post → home: await `engine.prepareReturn(slug)`, then load home.

Browser Back/Forward goes through the same ClientRouter lifecycle and therefore shares the same 3D transition.

### Two-phase return commit

Return is intentionally split into two phases:

1. The engine plays the full reverse burst/camera path and **remains** in the final `article-return` frame.
2. Astro swaps in the home document. `astro:after-swap` then synchronizes the route and atomically restores `cosmos`.

The engine never exposes `cosmos` while the old article DOM is still mounted. This removes the race that could briefly reveal cover text or re-show article CSS at the end of a return.

### Navigation failure recovery

The wrapped loader uses `try/catch`. If preparation/loading fails, `recoverNavigationFailure()` restores the route that is still mounted:

- failed home → post returns to the saved cosmos pose;
- failed post → home restores the selected article pose/content state.

No half-transition is allowed to become the stable UI state.

## Camera continuity

Before interactive article entry, the engine snapshots the actual cosmos camera position and quaternion (including its deterministic idle sway). The article endpoint is generated on the approach side of the star. Entry samples those endpoints with one progress curve; return samples the same curve backwards, and the restored pose becomes the base of the index-state idle sway again.

Direct article URLs have no prior camera snapshot, so the engine generates a safe nearby cosmos pose for their future return path.

## Input ownership

The 3D runtime owns no input state beyond cover pointer tracking: mouse/touch position drives cover gravity, and a single click/tap triggers the collapse. The cosmos state is intentionally click-inert — all navigation belongs to the server-rendered article index. There is no pointer lock and no keyboard flight in this edition.

## Resource lifecycle and submission cost

Every GPU-owning system has `dispose()`. `UniverseEngine.destroy()` cancels RAF, removes its own listeners, disposes systems/shared texture and disposes the renderer.

Opacity zero is not treated as “free”: particle groups toggle `visible` so invisible systems do not submit draw calls. CPU-updated position buffers use `DynamicDrawUsage`.

Galaxy formation moves vertices in the shader, so normal CPU frustum culling is unsafe while formation is incomplete. At final formation, precomputed final-shape bounding spheres are used and frustum culling is re-enabled.

WebGL context loss pauses RAF; restoration re-synchronizes viewport/pixel ratio and restarts rendering.

## WebGL-unavailable fallback

`UniverseShell` catches an initial renderer failure. It marks the document as unavailable, exposes the normal static cover on home, and renders ordinary article links. Article routes remain readable without the 3D runtime. A graphics capability limitation therefore degrades the navigation metaphor, not the content itself.

## Verification gates

A visual release is ready only when all gates pass:

1. `npm run verify:offline` passes.
2. `astro check` passes with installed pinned dependencies.
3. Production `astro build` passes.
4. Chromium smoke test covers cover → collapse → Big Bang → index → article → reverse return without console errors.
5. Browser Back/Forward follows the same entry/return transition.
6. Resize does not corrupt camera or cover geometry; the index remains usable on touch and small viewports.
7. Reduced-motion path works.
8. The circular collapse, galaxy silhouettes and index readability are visually inspected on multiple aspect ratios.
9. Frame time and GPU memory are inspected on representative integrated- and discrete-GPU devices before particle budgets are raised.
