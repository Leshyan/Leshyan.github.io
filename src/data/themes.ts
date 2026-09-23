export const THEME_IDS = ['research', 'engineering', 'notes', 'visual'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/**
 * UI accent channels (r,g,b) per theme. Single source for both the DOM index
 * accents and the WebGL theme colors derived in render/materials.ts.
 */
export const THEME_RGB: Record<ThemeId, string> = {
  research: '154,182,255',
  engineering: '127,249,232',
  notes: '255,183,109',
  visual: '210,162,255',
};
