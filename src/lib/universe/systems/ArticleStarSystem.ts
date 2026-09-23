import * as THREE from 'three';
import type { ArticleStarDefinition, NebulaDefinition } from '../../../data/universe';
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
  galaxy: NebulaDefinition;
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

  constructor(
    scene: THREE.Scene,
    articles: ArticleStarDefinition[],
    nebulae: NebulaDefinition[],
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
  ) {
    for (let index = 0; index < this.stars.length; index += 1) {
      const star = this.stars[index];
      const distance = camera.position.distanceTo(star.world);
      let visibility = 0;

      if (state === 'cosmos' || state === 'article-enter') {
        visibility = 0.025 + (1 - smoothstep(24, 60, distance)) * 0.92;
      } else if (state === 'article' || state === 'article-return') {
        visibility = star.def.slug === selectedSlug ? 0.92 : 0.055;
      }

      if (
        star.def.slug === selectedSlug
        && (state === 'article-enter' || state === 'article' || state === 'article-return')
      ) {
        visibility *= clamp01(selectedIntegrity);
      }

      star.group.visible = visibility > 0.001;
      if (!star.group.visible) continue;

      const pulse = 0.88 + Math.sin(timeSeconds * 2.1 + index * 1.7) * 0.12;
      star.core.material.opacity = visibility * 0.9;
      (star.glow.material as THREE.SpriteMaterial).opacity = visibility * 0.42;
      (star.halo.material as THREE.SpriteMaterial).opacity = visibility * 0.12;
      star.core.scale.setScalar(0.88 + visibility * 0.42);
      star.glow.scale.setScalar((2 + visibility * 2) * pulse);
      star.halo.scale.setScalar((4.3 + visibility * 3.5) * pulse);
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
