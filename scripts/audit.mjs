import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const failures = [];
const notes = [];

const walk = (dir, predicate = () => true) => {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(file, predicate));
    else if (predicate(file)) output.push(file);
  }
  return output;
};

const universeFiles = walk(path.join(src, 'lib', 'universe'), (file) => /\.(ts|astro)$/.test(file));
const allTextFiles = walk(src, (file) => /\.(ts|astro|md)$/.test(file));

for (const file of universeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/Math\.random\s*\(/.test(text)) failures.push(`${path.relative(root, file)} uses Math.random()`);
  if (/\b(?:TODO|FIXME|HACK)\b/.test(text)) failures.push(`${path.relative(root, file)} contains TODO/FIXME/HACK`);
  if (/setTimeout\s*\(/.test(text)) failures.push(`${path.relative(root, file)} uses setTimeout in the universe runtime`);
}

const combined = allTextFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (/\bARTICLE_STARS\b/.test(combined)) failures.push('ARTICLE_STARS duplicate article mapping still exists');

// Route lifecycle ownership is centralized in UniverseShell. Page-level listeners
// would accumulate across ClientRouter navigations and split route responsibility.
for (const file of walk(path.join(src, 'pages'), (candidate) => candidate.endsWith('.astro'))) {
  const text = fs.readFileSync(file, 'utf8');
  if (/addEventListener\(\s*['"]astro:page-load['"]/.test(text)) {
    failures.push(`${path.relative(root, file)} owns astro:page-load; route lifecycle belongs in UniverseShell`);
  }
}

for (const file of walk(src, (candidate) => candidate.endsWith('.ts'))) {
  const text = fs.readFileSync(file, 'utf8');
  const importPattern = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const match of text.matchAll(importPattern)) {
    const base = path.resolve(path.dirname(file), match[1]);
    const candidates = [base, `${base}.ts`, `${base}.astro`, path.join(base, 'index.ts')];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      failures.push(`${path.relative(root, file)} has unresolved relative import ${match[1]}`);
    }
  }
}

const themeSource = fs.readFileSync(path.join(src, 'data', 'themes.ts'), 'utf8');
const themeArray = themeSource.match(/THEME_IDS\s*=\s*\[([^\]]+)\]/)?.[1] ?? '';
const themes = new Set([...themeArray.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]));
if (!themes.size) failures.push('THEME_IDS could not be parsed by the offline audit');
const maxThemes = Number(themeSource.match(/MAX_THEMES\s*=\s*(\d+)/)?.[1] ?? 9);
if (themes.size > maxThemes) failures.push(`THEME_IDS has ${themes.size} themes; the architecture ceiling is ${maxThemes} (use tags for finer classification)`);
const postDir = path.join(src, 'content', 'posts');
const posts = walk(postDir, (file) => file.endsWith('.md'));
for (const file of posts) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    failures.push(`${path.relative(root, file)} is missing frontmatter`);
    continue;
  }
  const frontmatter = match[1];
  for (const key of ['title:', 'description:', 'theme:', 'published:']) {
    if (!frontmatter.includes(key)) failures.push(`${path.relative(root, file)} is missing ${key}`);
  }
  const theme = frontmatter.match(/^theme:\s*([^\s]+)\s*$/m)?.[1];
  if (!theme || !themes.has(theme)) failures.push(`${path.relative(root, file)} has invalid theme`);
  if (frontmatter.includes('universe:')) {
    const offset = frontmatter.match(/^\s*offset:\s*\[([^\]]+)\]\s*$/m)?.[1]
      ?.split(',').map((value) => Number(value.trim()));
    if (!offset || offset.length !== 3 || offset.some((value) => !Number.isFinite(value))) {
      failures.push(`${path.relative(root, file)} has invalid universe.offset`);
    }
  }
}


const homePage = fs.readFileSync(path.join(src, 'pages', 'index.astro'), 'utf8');
if (!/\.cover-copy\s*\{[\s\S]*?visibility:\s*hidden;/.test(homePage)) {
  failures.push('home cover must be default-hidden to prevent route-swap title flashes');
}
const articlePage = fs.readFileSync(path.join(src, 'pages', 'posts', '[slug].astro'), 'utf8');
if (/animation:\s*article-in[^;]*\bboth\b/.test(articlePage)) {
  failures.push('article entrance animation retains fill-mode both and can override return-state fading');
}
const shellSource = fs.readFileSync(path.join(src, 'components', 'UniverseShell.astro'), 'utf8');
if (!/data-universe-state=["']article-return["'][\s\S]*?\.article-page\s*\{[\s\S]*?animation:\s*none;/.test(shellSource)) {
  failures.push('article-return must cancel article entrance animation before fading the page');
}
if (!/class=["']universe-fallback["']/.test(shellSource) || !/universeUnavailable/.test(shellSource)) {
  failures.push('UniverseShell must provide a usable fallback when WebGL initialization fails');
}
if (!/recoverNavigationFailure/.test(shellSource) || !/catch\s*\(error\)/.test(shellSource)) {
  failures.push('navigation loader wrappers must recover the universe state when page preparation fails');
}
const contentConfig = fs.readFileSync(path.join(src, 'content.config.ts'), 'utf8');
if (!/pattern:\s*['"]\*\.md['"]/.test(contentConfig) || /pattern:\s*['"]\*\*\/\*\.md['"]/.test(contentConfig)) {
  failures.push('post loader must match the single-segment slug routing contract (*.md only)');
}
const nebulaSystemSource = fs.readFileSync(path.join(src, 'lib', 'universe', 'systems', 'NebulaSystem.ts'), 'utf8');
if (!/computeBoundingSphere\(\)/.test(nebulaSystemSource) || !/frustumCulled\s*=\s*canCullAtFinalShape/.test(nebulaSystemSource)) {
  failures.push('formed nebulae must restore safe frustum culling with a final-shape bounding sphere');
}
for (const file of universeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)) {
    if (Number(match[1]) >= Number(match[2])) {
      failures.push(`${path.relative(root, file)} has non-increasing numeric smoothstep edges (${match[1]}, ${match[2]})`);
    }
  }
}

const enginePath = path.join(src, 'lib', 'universe', 'UniverseEngine.ts');
const engineLines = fs.readFileSync(enginePath, 'utf8').split('\n').length;
if (engineLines > 700) failures.push(`UniverseEngine.ts is ${engineLines} lines; orchestration budget is 700`);
else notes.push(`UniverseEngine.ts orchestration size: ${engineLines} lines`);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const script of ['audit', 'test:core', 'verify:offline', 'verify']) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json is missing script ${script}`);
}

if (failures.length) {
  console.error('Static audit FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Static audit PASS');
console.log(`  ${universeFiles.length} universe source files scanned`);
console.log(`  ${posts.length} posts validated`);
for (const note of notes) console.log(`  ${note}`);
