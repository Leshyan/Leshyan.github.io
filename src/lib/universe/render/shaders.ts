export const STAR_VERTEX = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uOpacity;

  void main() {
    vColor = color;
    vAlpha = aAlpha * uOpacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pointSize = aSize * uPixelRatio * (95.0 / max(1.0, -mvPosition.z));
    gl_PointSize = min(pointSize, 30.0 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const STAR_FRAGMENT = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float core = pow(max(0.0, 1.0 - r), 2.6);
    float halo = pow(max(0.0, 1.0 - r), 7.0) * 0.75;
    float alpha = (core + halo) * vAlpha;
    gl_FragColor = vec4(vColor * (1.0 + halo * 1.8), alpha);
  }
`;

export const NEBULA_VERTEX = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute float aFormationDelay;
  attribute float aFormationCurl;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSizePx;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFormation;
  uniform vec3 uOrigin;
  uniform float uDriftScale;

  void main() {
    float globalFormation = clamp(uFormation, 0.0, 1.0);
    float formed = smoothstep(aFormationDelay, 1.0, globalFormation);

    vec3 target = position;
    target.y += sin(uTime * 0.12 + position.x * 0.19 + position.z * 0.07)
      * 0.035 * uDriftScale * formed;
    target.x += cos(uTime * 0.09 + position.y * 0.17)
      * 0.025 * uDriftScale * formed;

    vec3 p = mix(uOrigin, target, formed);
    vec2 travel = target.xy - uOrigin.xy;
    float travelLength = length(travel);
    if (travelLength > 0.0001) {
      vec2 tangent = vec2(-travel.y, travel.x) / travelLength;
      p.xy += tangent * sin(formed * 3.14159265) * aFormationCurl;
    }

    vColor = color;
    vAlpha = aAlpha * uOpacity * smoothstep(0.0, 0.16, formed);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float pointSize = aSize * uPixelRatio * (130.0 / max(3.0, -mvPosition.z));
    gl_PointSize = min(pointSize, 26.0 * uPixelRatio);
    vSizePx = pointSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const NEBULA_FRAGMENT = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSizePx;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float core = pow(max(0.0, 1.0 - r), 2.0);
    float edge = 1.0 - smoothstep(0.42, 1.0, r);
    float alpha = core * edge * vAlpha;

    // Near the camera, size-capped sprites would read as soft bokeh discs.
    // Resolve them into clumps of micro-stars so galaxies keep texture when approached.
    float grainAmt = smoothstep(12.0, 28.0, vSizePx);
    if (grainAmt > 0.001) {
      vec2 g = p * max(4.0, vSizePx * 0.5);
      vec2 id = floor(g);
      float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
      float d = length(fract(g) - 0.5);
      float sparkle = smoothstep(0.35, 0.95, h) * (1.0 - smoothstep(0.0, 0.42, d));
      alpha *= mix(1.0, 0.5 + 1.25 * sparkle, grainAmt * edge);
    }
    gl_FragColor = vec4(vColor, alpha);
  }
`;
