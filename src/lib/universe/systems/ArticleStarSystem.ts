import * as THREE from 'three';
import type { ArticleStarDefinition, ResolvedNebulaDefinition } from '../../../data/universe';
import type { UniverseState } from '../core/UniverseStateMachine';
import { UNIVERSE_CONFIG } from '../core/config';
import { clamp01, smoothstep } from '../core/math';
import { nebulaLocalToWorld } from '../core/nebulaTransform';
import { themeColor } from '../render/materials';

export interface ArticleFocusResult {
  star: ArticleStarRuntime;
  screenDistance: number;
  worldDistance: number;
}

export interface ArticleStarRuntime {
  def: ArticleStarDefinition;
  galaxy: ResolvedNebulaDefinition;
  world: THREE.Vector3;
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  halo: THREE.Sprite;
}

export class ArticleStarSystem {
  private readonly scene: THREE.Scene;
  private readonly stars: ArticleStarRuntime[] = [];
  private readonly sharedGeometry = new THREE.SphereGeometry(0.16, 16, 16);
  private readonly projected = new THREE.Vector3();
  private readonly viewDirection = new THREE.Vector3();
  private readonly toStar = new THREE.Vector3();
  /** Ambient-brightness scale so total star glow stays constant as articles grow. */
  private readonly ambientScale: number;

  constructor(
    scene: THREE.Scene,
    articles: ArticleStarDefinition[],
    nebulae: ResolvedNebulaDefinition[],
    glowTexture: THREE.Texture,
  ) {
    this.scene = scene;

    for (const definition of articles) {
      const nebula = nebulae.find((candidate) => candidate.id === definition.theme);
      if (!nebula) continue;

      const world = nebulaLocalToWorld(nebula, definition.offset);
      const group = new THREE.Group();
      group.position.copy(world);

      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xf6f9ff,
        transparent: true,
        opacity: 0.02,
        depthWrite: false,
      });
      const core = new THREE.Mesh(this.sharedGeometry, coreMaterial);
      group.add(core);

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: themeColor(definition.theme),
        transparent: true,
        opacity: 0.02,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(2.8, 2.8, 1);
      group.add(glow);

      const haloMaterial = glowMaterial.clone();
      haloMaterial.opacity = 0.008;
      const halo = new THREE.Sprite(haloMaterial);
      halo.scale.set(6.5, 6.5, 1);
      group.add(halo);

      scene.add(group);
      this.stars.push({ def: definition, galaxy: nebula, world, group, core, glow, halo });
    }

    // Reference count: at or below it stars shine at full strength; beyond it each
    // star dims proportionally, so a galaxy of 60 articles glows like one of 6.
    this.ambientScale = Math.min(1, 6 / Math.max(1, this.stars.length));
  }

  findBySlug(slug: string | null) {
    if (!slug) return null;
    return this.stars.find((star) => star.def.slug === slug) ?? null;
  }

  getFocusCandidate(camera: THREE.PerspectiveCamera): ArticleFocusResult | null {
    let best: ArticleStarRuntime | null = null;
    let bestScreenDistance = Infinity;
    let bestWorldDistance = Infinity;

    camera.getWorldDirection(this.viewDirection);
    for (const star of this.stars) {
      this.toStar.subVectors(star.world, camera.position);
      const worldDistance = this.toStar.length();
      if (worldDistance > UNIVERSE_CONFIG.focus.articleWorldMax) continue;
      if (this.toStar.dot(this.viewDirection) <= 0) continue;

      this.projected.copy(star.world).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;
      const screenDistance = Math.hypot(this.projected.x, this.projected.y);
      if (
        screenDistance < UNIVERSE_CONFIG.focus.articleLabelRadius
        && (
          screenDistance < bestScreenDistance
          || (Math.abs(screenDistance - bestScreenDistance) < 0.01 && worldDistance < bestWorldDistance)
        )
      ) {
        best = star;
        bestScreenDistance = screenDistance;
        bestWorldDistance = worldDistance;
      }
    }

    return best
      ? { star: best, screenDistance: bestScreenDistance, worldDistance: bestWorldDistance }
      : null;
  }

  updateAppearance(
    camera: THREE.PerspectiveCamera,
    state: UniverseState,
    timeSeconds: number,
    selectedSlug: string | null,
    selectedIntegrity = 1,
    highlightSlug: string | null = null,
  ) {
    for (let index = 0; index < this.stars.length; index += 1) {
      const star = this.stars[index];
      const distance = camera.position.distanceTo(star.world);
      let visibility = 0;
      const selected = star.def.slug === selectedSlug;

      if (state === 'cosmos' || state === 'article-enter') {
        visibility = (0.025 + (1 - smoothstep(24, 60, distance)) * 0.92) * this.ambientScale;
        // A hovered index card ignites its star regardless of camera distance, so the
        // log and the universe answer each other while the camera stays at rest.
        if (state === 'cosmos' && highlightSlug !== null && star.def.slug === highlightSlug) {
          visibility = 0.92;
        }
      } else if (state === 'article' || state === 'article-return') {
        // Focus mode: the selected star dissolves into its burst; siblings keep a
        // soft distance-aware glimmer instead of a hard dim, so the transition
        // out of the index reads as focusing rather than stars snapping off.
        visibility = selected
          ? 0.92
          : (0.025 + (1 - smoothstep(24, 60, distance)) * 0.16) * this.ambientScale;
      }

      // The selected star shrinks into the blast origin as it dissolves, so its
      // disappearance reads as being drawn into the explosion.
      let collapse = 1;
      if (selected && (state === 'article-enter' || state === 'article' || state === 'article-return')) {
        visibility *= clamp01(selectedIntegrity);
        collapse = 0.1 + clamp01(selectedIntegrity) * 0.9;
      }

      star.group.visible = visibility > 0.001;
      if (!star.group.visible) continue;

      const pulse = 0.88 + Math.sin(timeSeconds * 2.1 + index * 1.7) * 0.12;
      star.core.material.opacity = visibility * 0.9;
      (star.glow.material as THREE.SpriteMaterial).opacity = visibility * 0.42;
      (star.halo.material as THREE.SpriteMaterial).opacity = visibility * 0.12;
      star.core.scale.setScalar((0.88 + visibility * 0.42) * collapse);
      star.glow.scale.setScalar((2 + visibility * 2) * pulse * collapse);
      star.halo.scale.setScalar((4.3 + visibility * 3.5) * pulse * collapse);
    }
  }

  dispose() {
    for (const star of this.stars) {
      this.scene.remove(star.group);
      star.core.material.dispose();
      (star.glow.material as THREE.SpriteMaterial).dispose();
      (star.halo.material as THREE.SpriteMaterial).dispose();
    }
    this.sharedGeometry.dispose();
    this.stars.length = 0;
  }
}
