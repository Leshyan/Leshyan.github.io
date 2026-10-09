import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  fileName,
}).outputText;

const load = async (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const js = transpile(source, relativePath);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const math = await load('src/lib/universe/core/math.ts');
const stateModule = await load('src/lib/universe/core/UniverseStateMachine.ts');
const navigation = await load('src/lib/universe/core/navigation.ts');

const a = math.createSeededRandom('same-seed');
const b = math.createSeededRandom('same-seed');
const seqA = Array.from({ length: 32 }, () => a());
const seqB = Array.from({ length: 32 }, () => b());
assert(JSON.stringify(seqA) === JSON.stringify(seqB), 'seeded PRNG is not deterministic');
assert(seqA.every((value) => value >= 0 && value < 1), 'seeded PRNG escaped [0, 1)');
assert(math.easeInOutCubic(0) === 0 && math.easeInOutCubic(1) === 1, 'easing endpoints are invalid');

const straight = navigation.cameraRelativeMovement({ x: 0, y: 0, z: -1 }, 1, 0);
assert(Math.abs(straight.x) < 1e-9 && Math.abs(straight.y) < 1e-9 && straight.z < -0.999, 'W is not camera-forward');
const right = navigation.cameraRelativeMovement({ x: 0, y: 0, z: -1 }, 0, 1);
assert(right.x > 0.999 && Math.abs(right.z) < 1e-9, 'D is not camera-right');
const pitched = navigation.cameraRelativeMovement({ x: 0, y: 0.6, z: -0.8 }, 1, 0);
assert(pitched.y > 0.59, 'forward movement incorrectly discarded camera pitch');
const rotated = navigation.cameraRelativeMovement({ x: 1, y: 0, z: 0 }, 1, 0);
assert(rotated.x > 0.999, 'W fell back to a world axis instead of camera direction');

const machine = new stateModule.UniverseStateMachine('cover');
for (const next of ['collapse', 'bigbang', 'cosmos', 'article-enter', 'article', 'article-return', 'cosmos']) {
  machine.transition(next);
}
assert(machine.state === 'cosmos', 'normal state path did not return to cosmos');

let rejected = false;
try {
  new stateModule.UniverseStateMachine('cover').transition('article');
} catch {
  rejected = true;
}
assert(rejected, 'invalid state transition was not rejected');

// Build a tiny temporary ESM graph for pure procedural-generation modules.
// This keeps geometry tests dependency-free: no Three.js or Astro installation is required.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-core-tests-'));
const graphFiles = [
  'src/data/themes.ts',
  'src/data/universe.ts',
  'src/lib/universe/core/math.ts',
  'src/lib/universe/core/sampling.ts',
  'src/lib/universe/core/galaxyLayout.ts',
  'src/lib/universe/generation/GalaxyDistribution.ts',
];

try {
  for (const relativePath of graphFiles) {
    const sourcePath = path.join(root, relativePath);
    const outputPath = path.join(tempRoot, relativePath.replace(/\.ts$/, '.mjs'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    let output = transpile(fs.readFileSync(sourcePath, 'utf8'), relativePath);
    output = output.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g, (full, quote, specifier) => (
      `from ${quote}${specifier}.mjs${quote}`
    ));
    fs.writeFileSync(outputPath, output);
  }

  const sampling = await import(pathToFileURL(path.join(tempRoot, 'src/lib/universe/core/sampling.mjs')).href);
  const galaxy = await import(pathToFileURL(path.join(tempRoot, 'src/lib/universe/generation/GalaxyDistribution.mjs')).href);
  const universe = await import(pathToFileURL(path.join(tempRoot, 'src/data/universe.mjs')).href);
  const themeModule = await import(pathToFileURL(path.join(tempRoot, 'src/data/themes.mjs')).href);
  const galaxyLayout = await import(pathToFileURL(path.join(tempRoot, 'src/lib/universe/core/galaxyLayout.mjs')).href);

  const nebulaIds = universe.NEBULAE.map((definition) => definition.id);
  assert(new Set(nebulaIds).size === nebulaIds.length, 'nebula theme ids are duplicated');
  assert(
    themeModule.THEME_IDS.length === nebulaIds.length
      && themeModule.THEME_IDS.every((theme) => nebulaIds.includes(theme)),
    'THEME_IDS and NEBULAE are not a one-to-one set',
  );

  assert(
    themeModule.THEME_IDS.length <= (themeModule.MAX_THEMES ?? 9),
    `theme count ${themeModule.THEME_IDS.length} exceeds the architecture ceiling`,
  );

  const resolvedNebulae = galaxyLayout.resolveNebulaLayout(universe.NEBULAE);
  assert(resolvedNebulae.every((d) => d.position?.length === 3), 'resolved layout missing concrete positions');
  for (let i = 0; i < resolvedNebulae.length; i += 1) {
    for (let j = i + 1; j < resolvedNebulae.length; j += 1) {
      const a = resolvedNebulae[i];
      const b = resolvedNebulae[j];
      const distance = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      assert(
        distance >= a.radius + b.radius + 4,
        `galaxies ${a.id}/${b.id} overlap after layout resolution (${distance.toFixed(1)} < ${a.radius + b.radius + 4})`,
      );
    }
  }

  // Nine synthetic themes with no explicit positions must still resolve separated.
  const synthetic = Array.from({ length: 9 }, (_, index) => ({
    id: `t${index}`,
    title: `T${index}`,
    subtitle: '',
    radius: 11,
    arms: 3,
    rotationDeg: [20, -15, 10],
    hueA: [0.5, 0.5, 1],
    hueB: [1, 0.5, 0.5],
  }));
  const syntheticResolved = galaxyLayout.resolveNebulaLayout(synthetic);
  for (let i = 0; i < syntheticResolved.length; i += 1) {
    for (let j = i + 1; j < syntheticResolved.length; j += 1) {
      const a = syntheticResolved[i];
      const b = syntheticResolved[j];
      const distance = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      assert(distance >= a.radius + b.radius + 4, `synthetic galaxies ${i}/${j} overlap (${distance.toFixed(1)})`);
    }
  }

  // Auto star offsets: deterministic, inside the disk, mutually spaced.
  const autoA = galaxyLayout.autoArticleOffset('same-slug', 12.5, []);
  const autoB = galaxyLayout.autoArticleOffset('same-slug', 12.5, []);
  assert(autoA[0] === autoB[0] && autoA[1] === autoB[1] && autoA[2] === autoB[2], 'auto article offset is not deterministic');
  const autoTaken = [];
  for (let index = 0; index < 40; index += 1) {
    const slot = galaxyLayout.autoArticleOffset(`auto-post-${index}`, 12.5, autoTaken);
    assert(Math.hypot(slot[0], slot[1]) < 12.5 * 0.88, `auto slot ${index} escapes the galaxy disk`);
    assert(Math.abs(slot[2]) < 12.5 * 0.1, `auto slot ${index} floats off the disk plane`);
    autoTaken.push(slot);
  }
  let minAutoDistance = Infinity;
  for (let i = 0; i < autoTaken.length; i += 1) {
    for (let j = i + 1; j < autoTaken.length; j += 1) {
      minAutoDistance = Math.min(minAutoDistance, Math.hypot(
        autoTaken[i][0] - autoTaken[j][0],
        autoTaken[i][1] - autoTaken[j][1],
        autoTaken[i][2] - autoTaken[j][2],
      ));
    }
  }
  assert(minAutoDistance > 2.0, `auto star slots collide (min distance ${minAutoDistance.toFixed(2)})`);

  const diskRandom = math.createSeededRandom('circular-cover-test');
  let diskMeanX = 0;
  let diskMeanY = 0;
  let diskMaxRadius = 0;
  const diskCount = 20000;
  for (let i = 0; i < diskCount; i += 1) {
    const point = sampling.sampleDisk(diskRandom, 0.58);
    const radius = Math.hypot(point.x, point.y);
    diskMeanX += point.x;
    diskMeanY += point.y;
    diskMaxRadius = Math.max(diskMaxRadius, radius);
  }
  diskMeanX /= diskCount;
  diskMeanY /= diskCount;
  assert(diskMaxRadius <= 1.000001, 'cover disk sampler escaped its circular reservoir');
  assert(Math.abs(diskMeanX) < 0.02 && Math.abs(diskMeanY) < 0.02, 'cover disk sampler is visibly off-center');

  for (const definition of universe.NEBULAE) {
    const structure = galaxy.buildGalaxyLayer(definition, 'structure', 9000);
    const structureAgain = galaxy.buildGalaxyLayer(definition, 'structure', 9000);
    assert(
      structure.positions.slice(0, 120).every((value, index) => value === structureAgain.positions[index]),
      `${definition.id} galaxy generation is not deterministic`,
    );

    const layers = [
      ['structure', structure, 0.34, 0.004],
      ['cloud', galaxy.buildGalaxyLayer(definition, 'cloud', 5000), 0.22, 0.006],
    ];
    for (const [kind, layer, maxThicknessRatio, maxCornerRatio] of layers) {
      let maxX = 0;
      let maxY = 0;
      let sumXY2 = 0;
      let sumZ2 = 0;
      let cornerCount = 0;
      const count = layer.positions.length / 3;
      for (let i = 0; i < count; i += 1) {
        const i3 = i * 3;
        const x = layer.positions[i3];
        const y = layer.positions[i3 + 1];
        const z = layer.positions[i3 + 2];
        maxX = Math.max(maxX, Math.abs(x));
        maxY = Math.max(maxY, Math.abs(y));
        sumXY2 += x * x + y * y;
        sumZ2 += z * z;
        if (Math.abs(x) > definition.radius * 0.82 && Math.abs(y) > definition.radius * 0.82) cornerCount += 1;
      }
      const planarAspect = maxX / Math.max(1e-6, maxY);
      const xyRms = Math.sqrt(sumXY2 / count);
      const zRms = Math.sqrt(sumZ2 / count);
      assert(planarAspect > 0.76 && planarAspect < 1.32, `${definition.id} ${kind} plane is anisotropic/strip-like`);
      assert(zRms < xyRms * maxThicknessRatio, `${definition.id} ${kind} layer is too thick for a coherent disk`);
      assert(cornerCount / count < maxCornerRatio, `${definition.id} ${kind} layer is filling rectangular corners`);
    }

    const [rotationX, rotationY] = definition.rotationDeg.map((degrees) => degrees * Math.PI / 180);
    const faceOnScore = Math.abs(Math.cos(rotationX) * Math.cos(rotationY));
    assert(faceOnScore > 0.5, `${definition.id} is configured close to edge-on from the initial camera`);
    assert(definition.rotationDeg.some((value) => Math.abs(value) >= 8), `${definition.id} has no meaningful 3D orientation`);
  }

  const nebulaById = new Map(universe.NEBULAE.map((definition) => [definition.id, definition]));
  const postDir = path.join(root, 'src/content/posts');
  for (const fileName of fs.readdirSync(postDir).filter((name) => name.endsWith('.md'))) {
    const source = fs.readFileSync(path.join(postDir, fileName), 'utf8');
    const theme = source.match(/^theme:\s*([^\s]+)\s*$/m)?.[1];
    const offset = source.match(/^\s*offset:\s*\[([^\]]+)\]\s*$/m)?.[1]
      ?.split(',').map((value) => Number(value.trim()));
    const definition = theme ? nebulaById.get(theme) : null;
    assert(definition, `${fileName} cannot be mapped into a nebula`);
    if (offset?.length === 3) {
      const planarRadius = Math.hypot(offset[0], offset[1]);
      assert(planarRadius < definition.radius * 0.88, `${fileName} article star lies outside its nebula disk`);
      assert(Math.abs(offset[2]) < definition.radius * 0.10, `${fileName} article star floats implausibly far above its nebula disk`);
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Core behavior tests PASS');
console.log('  deterministic PRNG');
console.log('  easing endpoints');
console.log('  camera-relative movement basis');
console.log('  theme/nebula one-to-one mapping');
console.log('  circular cover sampler');
console.log('  galaxy structure+cloud geometry / soft radial envelope / view orientation');
console.log('  article-star embedding constraints');
console.log('  normal state path');
console.log('  invalid transition rejection');
