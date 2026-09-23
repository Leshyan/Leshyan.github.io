# Verification record

## Offline gate

Run:

```bash
npm run verify:offline
```

The current dependency-free gate checks the following categories.

### Source and ownership

- relative TypeScript imports resolve;
- universe runtime contains no uncontrolled `Math.random()`, timer chains or TODO/FIXME/HACK markers;
- article data is not duplicated as an `ARTICLE_STARS` mapping;
- topic IDs are parsed from the single `THEME_IDS` source;
- Markdown frontmatter contains required spatial metadata and a valid topic;
- the content loader matches the flat single-segment `[slug]` route contract;
- page files do not take ownership of Astro route lifecycle listeners;
- `UniverseEngine` stays inside its orchestration-size budget.

### Route/CSS regression guards

- the home cover is default-hidden and revealed only by explicit home + cover/collapse state;
- article entrance does not retain `animation-fill-mode: both`;
- `article-return` cancels the entrance animation before fading the article;
- `UniverseShell` contains a WebGL-unavailable content fallback;
- wrapped navigation loaders contain failure-state recovery;
- numeric constant `smoothstep()` calls have increasing edges.

### Procedural geometry

- seeded PRNG output is deterministic and remains inside `[0, 1)`;
- circular cover sampling remains inside a unit disk and is statistically centered;
- every topic ID maps one-to-one to one galaxy definition;
- both structural and cloud galaxy layers are deterministic;
- galaxy local X/Y extents remain near-isotropic rather than forming a box/strip;
- Z remains a thin physical thickness relative to the disk;
- rectangular-corner occupancy remains low;
- configured 3D orientations are meaningful and not near edge-on from the initial camera;
- sample article stars stay inside the owning galaxy disk and plausible Z thickness.

### Interaction/state

- easing endpoints are valid;
- W follows current camera forward (movement basis kept as a tested pure module);
- forward motion preserves camera pitch;
- D follows camera-relative right, not world X;
- rotated camera movement does not fall back to world axes;
- the normal state path reaches cosmos again after article return;
- illegal state jumps are rejected.

### Render-resource static guards

- final galaxy geometry has a bounding sphere;
- normal frustum culling is restored only once shader-space formation reaches the final shape.

## Current offline result

At the v0.4 release-candidate audit, `npm run verify:offline` reports:

```text
Static audit PASS
  16 universe source files scanned
  5 posts validated
  UniverseEngine.ts orchestration size: 622 lines

Syntax scan PASS
  19 TypeScript source units parsed
  6 Astro frontmatter/script units parsed

Core behavior tests PASS
  deterministic PRNG
  easing endpoints
  camera-relative movement basis
  theme/nebula one-to-one mapping
  circular cover sampler
  galaxy structure+cloud geometry / soft radial envelope / view orientation
  article-star embedding constraints
  normal state path
  invalid transition rejection
```

The exact engine line count may change slightly with non-behavioral edits; the audit-enforced maximum remains 700.

## Dependency-backed gate

Run:

```bash
npm install
npm run verify
```

This adds:

1. `astro check`
2. production `astro build`

after all offline checks.

## Browser acceptance checklist

After `npm run dev`, verify in Chromium/Chrome at minimum:

1. Cover stars gather from a visibly non-rectangular/off-screen reservoir at center **and near all four screen edges**.
2. Resize from wide → tall → wide before clicking; the reservoir must remain circular, not become elliptical.
3. Big Bang starts exactly at the clicked point and all galaxy layers originate there.
4. Topic galaxies read as natural round/elliptical spiral systems from the initial view, not long rectangular strips.
5. After the Big Bang the article index appears: theme-grouped cards, real links, readable over the nebula background on desktop **and** mobile viewports.
6. Clicking a card plays the burst + camera fly-in; entry removes the selected star into the burst.
7. Return reforms the same star along the exact reverse trajectory and restores the index.
8. Return link and browser Back both restore the pre-entry camera pose.
9. During article return, the cover sentence never flashes—not even faintly at the final transition frame.
10. Trigger return immediately after the article appears and repeat Back/Forward several times; state must remain coherent.
11. Directly load an article URL, then return; the generated safe cosmos pose must work without a prior camera snapshot.
12. Cosmos-state canvas clicks are inert (no pointer-lock attempts, no console errors).
13. DevTools console remains free of uncaught errors during the complete loop.
14. With reduced-motion enabled, particle counts/timings reduce while navigation semantics remain intact.
15. If possible, test with WebGL disabled; the static cover/article-link fallback must remain usable.
16. On a touch device, the index is the primary navigation and requires no flight controls.

## Current environment limitation

The original development container had no public egress; v0.3+ validation now runs in an environment with registry access, so the dependency-backed gates (`astro check`, production `astro build`) and headless Chromium/WebGL smoke tests are part of the normal release loop and are expected to pass before deployment.
