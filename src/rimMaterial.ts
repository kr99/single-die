import * as THREE from "three";

const VERTEX = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  uniform float uIntensity;

  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = abs(dot(normalize(vViewNormal), viewDir));
    float fresnel = pow(1.0 - facing, 2.9);

    float swirl = 0.72 + 0.28 * sin(
      vViewPosition.y * 2.1 + vViewPosition.x * 1.35 + uTime * 0.85
    );
    float tintMix = clamp(vViewPosition.x * 0.24 + 0.5, 0.0, 1.0);
    vec3 color = mix(uColorA, uColorB, tintMix);

    gl_FragColor = vec4(color * fresnel * swirl * uIntensity, 1.0);
  }
`;

export function createRimMaterial(intensity = 0.8): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color(0x69efff) },
      uColorB: { value: new THREE.Color(0xff74d8) },
      uTime: { value: 0 },
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
