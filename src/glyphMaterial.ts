import * as THREE from "three";

export interface GlyphSharedUniforms {
  uTime: { value: number };
  uBurst: { value: number };
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform float uBurst;
  uniform float uSeed;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;

  varying vec2 vUv;
  varying vec3 vViewNormal;

  const float CELLS = 8.0;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  vec4 glyphCell(float index, vec2 uv) {
    float col = mod(index, CELLS);
    // CanvasTexture is uploaded with flipY, so atlas row 0 lives at v = 1.
    float row = (CELLS - 1.0) - floor(index / CELLS);
    vec2 cellUv = (vec2(col, row) + uv) / CELLS;
    return texture2D(uAtlas, cellUv);
  }

  void main() {
    // Plane uvs mapped into the padded interior of an atlas cell.
    vec2 artUv = vec2(0.07, 0.07) + vUv * 0.86;

    float cycle = uTime * 0.85 + uSeed * 19.0;
    float seg = floor(cycle);
    float phase = fract(cycle);

    // Glide glyphs deliberately, with a short violent change-over window.
    float transition = smoothstep(0.7, 0.82, phase) * (1.0 - smoothstep(0.93, 1.0, phase));
    float glitch = clamp(transition + uBurst * 0.9, 0.0, 1.0);

    // Every facet keeps a stable identity sigil and glitches toward others.
    float cellA = floor(uSeed * 63.999);
    float cellB = floor(hash11(uSeed * 13.7 + seg + 1.0) * 63.999);

    // Horizontal slice tearing.
    float band = floor(vUv.y * 15.0);
    float jitter = (hash11(band * 3.17 + seg * 1.7) - 0.5) * 0.34 * glitch;
    float roll = (hash11(seg * 0.91 + uSeed) - 0.5) * 0.1 * glitch;
    vec2 guv = artUv + vec2(jitter, roll);

    float aA = glyphCell(cellA, guv).a;
    float aB = glyphCell(cellB, guv + vec2(jitter * 0.4, 0.0)).a;
    float chooseB = step(0.5, hash11(band * 1.93 + seg * 2.3 + uSeed)) * glitch;
    float mask = mix(aA, aB, chooseB);

    // Chromatic split during a glitch.
    float split = 0.018 * glitch;
    float rChan = glyphCell(cellA, guv + vec2(split, 0.0)).a;
    float bChan = glyphCell(cellA, guv - vec2(split, 0.0)).a;

    vec3 tint = mix(uColorA, uColorB, 0.25 + 0.5 * (0.5 + 0.5 * sin(uSeed * 21.0 + seg * 0.7)));

    vec3 color = tint * mask;
    color.r += rChan * glitch * 0.55;
    color.b += bChan * glitch * 0.65;

    // Soft aura and a very fine engraved scan texture.
    float radius = length(vUv - 0.5) * 2.0;
    color += tint * 0.05 * smoothstep(1.0, 0.15, radius);
    color *= 0.88 + 0.12 * sin((vUv.y + uTime * 0.22) * 210.0);

    // Fade decals on facets turned away from the viewer.
    float facing = smoothstep(-0.2, 0.38, vViewNormal.z);
    // Also fade at the very edge of the square plane.
    float edge = smoothstep(1.0, 0.82, radius);

    gl_FragColor = vec4(color * uIntensity * facing * edge, 1.0);
  }
`;

export function createGlyphMaterial(
  atlas: THREE.Texture,
  seed: number,
  colorA: THREE.Color,
  colorB: THREE.Color,
  shared: GlyphSharedUniforms,
  intensity = 1.15,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas },
      uTime: shared.uTime,
      uBurst: shared.uBurst,
      uSeed: { value: seed },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uIntensity: { value: intensity },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}
