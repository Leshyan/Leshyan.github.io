import * as THREE from 'three';
import type { ResolvedNebulaDefinition } from '../../../data/universe';

export const nebulaQuaternion = (
  definition: ResolvedNebulaDefinition,
  target = new THREE.Quaternion(),
) => {
  const [x, y, z] = definition.rotationDeg;
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z),
    'XYZ',
  );
  return target.setFromEuler(euler);
};

export const nebulaLocalToWorld = (
  definition: ResolvedNebulaDefinition,
  local: readonly [number, number, number],
  target = new THREE.Vector3(),
) => {
  target.fromArray(local as [number, number, number]);
  target.applyQuaternion(nebulaQuaternion(definition));
  target.add(new THREE.Vector3(...definition.position));
  return target;
};
