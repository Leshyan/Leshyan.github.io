import * as THREE from 'three';
import type { ThemeId } from '../../../data/universe';
import { UNIVERSE_CONFIG } from '../core/config';
import { clamp01, createSeededRandom, easeOutExpo, randomSigned, smoothstep, TAU } from '../core/math';
import { createStarMaterial, themeColor } from '../render/materials';

export class ArticleBurstSystem {
  private readonly scene: THREE.Scene;
  private readonly reducedMotion: boolean;
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private velocities: Float32Array | null = null;
  private readonly origin = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private pixelRatio: number;

  constructor(scene: THREE.Scene, pixelRatio: number, reducedMotion: boolean) {
    this.scene = scene;
    this.pixelRatio = pixelRatio;
    this.reducedMotion = reducedMotion;
  }

  configure(slug: string, origin: THREE.Vector3, theme: ThemeId, plane?: THREE.Quaternion) {
    this.cleanup();
    this.origin.copy(origin);

    const count = this.reducedMotion
      ? UNIVERSE_CONFIG.particles.articleBurstReduced
      : UNIVERSE_CONFIG.particles.articleBurst;
    const random = createSeededRandom(`article-burst:${slug}:v2`);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alpha = new Float32Array(count);
    const baseColor = themeColor(theme);

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      const theta = random() * TAU;
      const z = randomSigned(random);
      const radial = Math.sqrt(Math.max(0, 1 - z * z));
      const speed = 2.8 + Math.pow(random(), 0.45) * 12;
      // Blast along the owning galaxy's disk plane so the burst reads as part of
      // the galaxy rather than a detached spherical firework.
      this.scratch.set(
        Math.cos(theta) * radial * speed,
        Math.sin(theta) * radial * speed,
        z * speed * 0.3,
      );
      if (plane) this.scratch.applyQuaternion(plane);
      velocities[i3] = this.scratch.x;
      velocities[i3 + 1] = this.scratch.y;
      velocities[i3 + 2] = this.scratch.z;
      positions[i3] = origin.x;
      positions[i3 + 1] = origin.y;
      positions[i3 + 2] = origin.z;

      const brightness = 1.08 + random() * 0.48;
      colors[i3] = Math.min(1, baseColor.r * brightness);
      colors[i3 + 1] = Math.min(1, baseColor.g * brightness);
      colors[i3 + 2] = Math.min(1, baseColor.b * brightness);
      sizes[i] = 0.8 + random() * 3.1;
      alpha[i] = 0.3 + random() * 0.7;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const material = createStarMaterial(this.pixelRatio, 1);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);
    this.points = points;
    this.velocities = velocities;
  }

  setProgress(progress: number) {
    if (!this.points || !this.velocities) return;
    const p = clamp01(progress);
    const distance = easeOutExpo(p);
    const attribute = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;

    for (let i = 0; i < positions.length / 3; i += 1) {
      const i3 = i * 3;
      positions[i3] = this.origin.x + this.velocities[i3] * distance;
      positions[i3 + 1] = this.origin.y + this.velocities[i3 + 1] * distance;
      positions[i3 + 2] = this.origin.z + this.velocities[i3 + 2] * distance;
    }
    attribute.needsUpdate = true;
    this.points.material.uniforms.uOpacity.value = 1 - smoothstep(0.48, 0.96, p) * 0.98;
  }

  setPixelRatio(pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    if (this.points) this.points.material.uniforms.uPixelRatio.value = pixelRatio;
  }


  cleanup() {
    if (!this.points) {
      this.velocities = null;
      return;
    }
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points = null;
    this.velocities = null;
  }

  dispose() {
    this.cleanup();
  }
}
