import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const FilmShader = {
  name: "SigilFilmShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      vec2 aberration = centered * r2 * 0.0024;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + aberration).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - aberration).b;

      color = color * vec3(0.985, 1.0, 1.03) + vec3(0.003, 0.002, 0.009);

      float vignette = smoothstep(1.05, 0.22, r2 * 1.32);
      color *= mix(0.58, 1.0, vignette);

      float grain = hash21(uv * uResolution + fract(uTime) * 97.13);
      color += (grain - 0.5) * 0.026;

      color *= 1.0 - 0.015 * sin(uv.y * uResolution.y * 1.35 + uTime * 0.4);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  withBloom = true,
  withFilm = true,
): { composer: EffectComposer; film: ShaderPass | null } {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));

  if (withBloom) {
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.1, 0.32, 1.22);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());

  if (!withFilm) return { composer, film: null };

  const film = new ShaderPass(FilmShader);
  composer.addPass(film);

  return { composer, film };
}
