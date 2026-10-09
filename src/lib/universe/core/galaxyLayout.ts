import type { NebulaDefinition, ResolvedNebulaDefinition } from '../../../data/universe';
import { hashString, TAU } from './math';

/**
 * Adaptive galaxy layout. Hand-placed positions are honored; themes without an
 * explicit position are slotted deterministically onto fixed rings inside the
 * camera-reachable volume, respecting a minimum separation against every
 * already-resolved galaxy. The scheme holds up to MAX_THEMES (9) galaxies with
 * 11 candidate slots.
 */

const RING_A = { radius: 46, z: -58, anglesDeg: [90, 162, 234, 306, 18] } as const;
const RING_B = { radius: 63, z: -96, anglesDeg: [54, 114, 174, 234, 294, 354] } as const;
const SEPARATION_PADDING = 4;

interface Occupied {
  position: [number, number, number];
  radius: number;
}

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

const ringSlots = (ring: typeof RING_A | typeof RING_B): [number, number, number][] =>
  ring.anglesDeg.map((deg) => [
    Math.round(Math.cos(degToRad(deg)) * ring.radius * 10) / 10,
    Math.round(Math.sin(degToRad(deg)) * ring.radius * 10) / 10,
    ring.z,
  ] as [number, number, number]);

const SLOTS: [number, number, number][] = [...ringSlots(RING_A), ...ringSlots(RING_B)];

const distance3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const fits = (slot: readonly [number, number, number], radius: number, occupied: Occupied[]) =>
  occupied.every((other) => distance3(slot, other.position) >= other.radius + radius + SEPARATION_PADDING);

const firstFreeSlot = (radius: number, occupied: Occupied[]): [number, number, number] => {
  for (const slot of SLOTS) {
    if (fits(slot, radius, occupied)) return slot;
  }
  // Deterministic fallback: the slot with the largest clearance.
  let best = SLOTS[0];
  let bestClearance = -Infinity;
  for (const slot of SLOTS) {
    const clearance = occupied.reduce(
      (min, other) => Math.min(min, distance3(slot, other.position) - other.radius),
      Infinity,
    );
    if (clearance > bestClearance) {
      bestClearance = clearance;
      best = slot;
    }
  }
  return best;
};

export const resolveNebulaLayout = (definitions: NebulaDefinition[]): ResolvedNebulaDefinition[] => {
  const resolved: ResolvedNebulaDefinition[] = [];
  const occupied: Occupied[] = [];
  for (const definition of definitions) {
    const position = definition.position ?? firstFreeSlot(definition.radius, occupied);
    resolved.push({ ...definition, position });
    occupied.push({ position, radius: definition.radius });
  }
  return resolved;
};

/**
 * Deterministic article-star slot inside its galaxy disk when the Markdown
 * frontmatter omits `universe.offset`. Anchored on the slug hash; nudged along
 * the golden angle until it clears every already-placed sibling.
 */
export const autoArticleOffset = (
  slug: string,
  galaxyRadius: number,
  taken: readonly [number, number, number][],
): [number, number, number] => {
  const hash = hashString(slug);
  // Deterministic per-attempt sampler: angle, radius and height all re-roll so
  // retries explore the disk instead of circling one fixed radius.
  const attemptRandom = (attempt: number) => {
    let value = (hash ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b) >>> 0;
    return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
  };

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const angle = attemptRandom(attempt) * TAU;
    const radius = galaxyRadius * (0.28 + attemptRandom(attempt + 64) * 0.55);
    const z = (attemptRandom(attempt + 128) - 0.5) * galaxyRadius * 0.09;
    const candidate: [number, number, number] = [
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      z,
    ];
    if (taken.every((other) => Math.hypot(other[0] - candidate[0], other[1] - candidate[1], other[2] - candidate[2]) > 2.2)) {
      return [
        Math.round(candidate[0] * 100) / 100,
        Math.round(candidate[1] * 100) / 100,
        Math.round(candidate[2] * 100) / 100,
      ];
    }
  }
  const angle = attemptRandom(0) * TAU;
  const radius = galaxyRadius * 0.55;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
};
