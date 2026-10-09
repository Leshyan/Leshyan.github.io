/// <reference types="astro/client" />

import type { UniverseEngine } from './lib/universe/UniverseEngine';
import type { ArticleStarDefinition, ResolvedNebulaDefinition } from './data/universe';

declare global {
  interface Window {
    __nebulaUniverse?: UniverseEngine;
    __nebulaNavigationGuardWired?: boolean;
    __nebulaPageLoadWired?: boolean;
    __nebulaUniverseUnavailable?: boolean;
    __NEBULA_CONTENT__?: {
      articleStars: ArticleStarDefinition[];
      nebulae: ResolvedNebulaDefinition[];
    };
  }
}

export {};
