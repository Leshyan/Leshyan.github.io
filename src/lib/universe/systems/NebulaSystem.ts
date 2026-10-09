import * as THREE from 'three';
import type { ResolvedNebulaDefinition } from '../../../data/universe';
import { buildGalaxyLayer, type GalaxyLayerKind } from '../generation/GalaxyDistribution';
import { UNIVERSE_CONFIG } from '../core/config';
import { clamp01 } from '../core/math';
import { nebulaQuaternion } from '../core/nebulaTransform';
import { createNebulaMaterial } from '../render/materials';

interface NebulaLayer {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
}

interface NebulaRuntime {
  def: ResolvedNebulaDefinition;
  group: THREE.Group;
  structure: NebulaLayer;
  cloud: NebulaLayer;
}

export class NebulaSystem {
  private readonly scene: THREE.Scene;
  private readonly runtimes: NebulaRuntime[] = [];

  constructor(
    scene: THREE.Scene,
    definitions: ResolvedNebulaDefinition[],
    pixelRatio: number,
    reducedMotion: boolean,
  ) {
    this.scene = scene;
    for (const definition of definitions) {
      const group = new THREE.Group();
      group.position.fromArray(definition.position);
      group.quaternion.copy(nebulaQuaternion(definition));

      const structure = this.createLayer(
        definition,
        'structure',
        reducedMotion
          ? UNIVERSE_CONFIG.particles.nebulaStructureReduced
          : UNIVERSE_CONFIG.particles.nebulaStructure,
        pixelRatio,
      );
      const cloud = this.createLayer(
        definition,
        'cloud',
        reducedMotion
          ? UNIVERSE_CONFIG.particles.nebulaCloudReduced
          : UNIVERSE_CONFIG.particles.nebulaCloud,
        pixelRatio,
      );

      group.add(cloud.points, structure.points);
      group.visible = false;
      scene.add(group);
      group.updateMatrixWorld(true);
      this.runtimes.push({ def: definition, group, structure, cloud });
    }
  }

  setOrigin(originWorld: THREE.Vector3) {
    for (const runtime of this.runtimes) {
      runtime.group.updateMatrixWorld(true);
      this.updateLayerOrigin(runtime.structure, originWorld);
      this.updateLayerOrigin(runtime.cloud, originWorld);
    }
  }

  setFormation(progress: number) {
    const formation = clamp01(progress);
    const canCullAtFinalShape = formation >= 0.999;
    for (const runtime of this.runtimes) {
      runtime.structure.material.uniforms.uFormation.value = formation;
      runtime.cloud.material.uniforms.uFormation.value = formation;
      runtime.structure.points.frustumCulled = canCullAtFinalShape;
      runtime.cloud.points.frustumCulled = canCullAtFinalShape;
    }
  }

  setOpacity(opacity: number) {
    for (const runtime of this.runtimes) {
      runtime.group.visible = opacity > 0.001;
      runtime.structure.material.uniforms.uOpacity.value = opacity;
      runtime.cloud.material.uniforms.uOpacity.value = opacity * 0.52;
    }
  }

  update(timeSeconds: number, _deltaSeconds: number) {
    for (const runtime of this.runtimes) {
      runtime.structure.material.uniforms.uTime.value = timeSeconds;
      runtime.cloud.material.uniforms.uTime.value = timeSeconds * 0.92;
    }
  }

  findNearest(worldPosition: THREE.Vector3) {
    let nearest: NebulaRuntime | null = null;
    let distance = Infinity;
    for (const runtime of this.runtimes) {
      const candidateDistance = worldPosition.distanceTo(runtime.group.position);
      if (candidateDistance < distance) {
        nearest = runtime;
        distance = candidateDistance;
      }
    }
    return nearest ? { definition: nearest.def, distance } : null;
  }

  setPixelRatio(pixelRatio: number) {
    for (const runtime of this.runtimes) {
      runtime.structure.material.uniforms.uPixelRatio.value = pixelRatio;
      runtime.cloud.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  dispose() {
    for (const runtime of this.runtimes) {
      this.scene.remove(runtime.group);
      runtime.structure.points.geometry.dispose();
      runtime.structure.material.dispose();
      runtime.cloud.points.geometry.dispose();
      runtime.cloud.material.dispose();
    }
    this.runtimes.length = 0;
  }

  private updateLayerOrigin(layer: NebulaLayer, originWorld: THREE.Vector3) {
    layer.points.updateMatrixWorld(true);
    const originLocal = layer.points.worldToLocal(originWorld.clone());
    layer.material.uniforms.uOrigin.value.copy(originLocal);
  }

  private createLayer(
    definition: ResolvedNebulaDefinition,
    kind: GalaxyLayerKind,
    count: number,
    pixelRatio: number,
  ): NebulaLayer {
    const attributes = buildGalaxyLayer(definition, kind, count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(attributes.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(attributes.colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(attributes.sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(attributes.alpha, 1));
    geometry.setAttribute('aFormationDelay', new THREE.BufferAttribute(attributes.formationDelay, 1));
    geometry.setAttribute('aFormationCurl', new THREE.BufferAttribute(attributes.formationCurl, 1));
    geometry.computeBoundingSphere();

    const material = createNebulaMaterial(pixelRatio, {
      opacity: 0,
      driftScale: kind === 'structure' ? 1 : 0.38,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, material };
  }
}
