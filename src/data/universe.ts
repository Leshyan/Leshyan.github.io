import type { ThemeId } from './themes';
export type { ThemeId } from './themes';

export interface ArticleStarDefinition {
  slug: string;
  title: string;
  subtitle: string;
  theme: ThemeId;
  /** Local coordinates inside the owning nebula. */
  offset: [number, number, number];
}

export interface NebulaDefinition {
  id: ThemeId;
  title: string;
  subtitle: string;
  /** Optional: omitted positions are auto-placed by resolveNebulaLayout(). */
  position?: [number, number, number];
  radius: number;
  /** Number of dominant spiral arms used by the procedural distribution. */
  arms: number;
  /** XYZ Euler orientation in degrees. The galaxy disk itself is generated in local XY. */
  rotationDeg: [number, number, number];
  hueA: [number, number, number];
  hueB: [number, number, number];
}

/** A definition after adaptive layout resolution: position is always concrete. */
export type ResolvedNebulaDefinition = NebulaDefinition & {
  position: [number, number, number];
};

export const NEBULAE: NebulaDefinition[] = [
  {
    id: 'research',
    title: 'RESEARCH',
    subtitle: 'ideas · papers · experiments',
    position: [-26, 8, -48],
    radius: 12.5,
    arms: 3,
    rotationDeg: [24, -18, 8],
    hueA: [0.28, 0.52, 1.0],
    hueB: [0.72, 0.35, 1.0],
  },
  {
    id: 'engineering',
    title: 'ENGINEERING',
    subtitle: 'systems · code · prototypes',
    position: [25, -9, -65],
    radius: 13,
    arms: 2,
    rotationDeg: [-31, 17, -20],
    hueA: [0.18, 0.92, 0.82],
    hueB: [0.16, 0.46, 1.0],
  },
  {
    id: 'notes',
    title: 'NOTES',
    subtitle: 'fragments · reading · thoughts',
    position: [10, 24, -92],
    radius: 11.5,
    arms: 3,
    rotationDeg: [46, -12, 31],
    hueA: [1.0, 0.56, 0.22],
    hueB: [0.94, 0.20, 0.48],
  },
  {
    id: 'visual',
    title: 'VISUAL',
    subtitle: 'images · motion · experiments',
    position: [-18, -24, -118],
    radius: 12.5,
    arms: 2,
    rotationDeg: [-22, 36, -28],
    hueA: [0.84, 0.30, 1.0],
    hueB: [0.30, 0.72, 1.0],
  },
];
