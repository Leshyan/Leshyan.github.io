import * as THREE from 'three';
import { THEME_RGB, type ThemeId } from '../../../data/themes';
import { NEBULA_FRAGMENT, NEBULA_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from './shaders';

export const createStarMaterial = (pixelRatio: number, opacity = 1) => new THREE.ShaderMaterial({
  uniforms: {
    uPixelRatio: { value: pixelRatio },
    uOpacity: { value: opacity },
  },
  vertexShader: STAR_VERTEX,
  fragmentShader: STAR_FRAGMENT,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export const createNebulaMaterial = (
  pixelRatio: number,
  options: { opacity?: number; driftScale?: number } = {},
) => new THREE.ShaderMaterial({
  uniforms: {
    uPixelRatio: { value: pixelRatio },
    uOpacity: { value: options.opacity ?? 0 },
    uTime: { value: 0 },
    uFormation: { value: 0 },
    uOrigin: { value: new THREE.Vector3() },
    uDriftScale: { value: options.driftScale ?? 1 },
  },
  vertexShader: NEBULA_VERTEX,
  fragmentShader: NEBULA_FRAGMENT,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export const createGlowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.08, 'rgba(244,249,255,.95)');
    gradient.addColorStop(0.24, 'rgba(168,200,255,.34)');
    gradient.addColorStop(0.56, 'rgba(100,140,255,.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const themeColor = (theme: ThemeId): THREE.Color =>
  new THREE.Color(`rgb(${THEME_RGB[theme]})`);
