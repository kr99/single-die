import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { drawRuneRing } from "./glyphs";
import {
  createEnvironmentTexture,
  createFloorTexture,
  createGlowTexture,
  createWallTexture,
} from "./textures";

export interface World {
  update: (time: number, dt: number) => void;
  dispose: () => void;
}

export function createWorld(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  lowQuality = false,
): World {
  RectAreaLightUniformsLib.init();

  scene.fog = new THREE.FogExp2(0x04030c, 0.035);

  const environment = createEnvironmentTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(environment).texture;
  environment.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 1.25;

  // --- Backdrop -------------------------------------------------------------
  const wallTexture = createWallTexture();
  const wallMaterial = new THREE.MeshBasicMaterial({ map: wallTexture, color: 0xc4d2ea });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), wallMaterial);
  wall.name = "wall";
  wall.position.set(0, 0.2, -7.5);
  scene.add(wall);

  // --- Floor ----------------------------------------------------------------
  const floorTexture = createFloorTexture();
  floorTexture.wrapS = THREE.ClampToEdgeWrapping;
  floorTexture.wrapT = THREE.ClampToEdgeWrapping;
  // On software / low-power GPUs the lit floor is by far the most expensive
  // surface, so fall back to the baked texture with no per-pixel lighting.
  const floorMaterial = lowQuality
    ? new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xd7e6ff })
    : new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.35,
        metalness: 0.55,
        envMapIntensity: 1.1,
        emissive: new THREE.Color(0x0c2a33),
        emissiveMap: floorTexture,
        emissiveIntensity: 0.28,
      });
  const litFloor = floorMaterial instanceof THREE.MeshStandardMaterial ? floorMaterial : null;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMaterial);
  floor.name = "floor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.95, -2);
  scene.add(floor);

  // Opaque rune halo gives the refracted image another depth layer.
  const halo = createRuneHalo();
  halo.mesh.name = "halo";
  scene.add(halo.mesh);

  // --- Lights ---------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x5a7dff, 0x05020a, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xe8f7ff, 2.4);
  key.position.set(3.5, 6, 5);
  scene.add(key);

  const cyanLight = new THREE.PointLight(0x6ff8ff, 34, 14, 2);
  cyanLight.position.set(-4.2, 1.6, 2.8);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(0xff6bd6, 30, 13, 2);
  magentaLight.position.set(4.2, -1.4, 2.2);
  scene.add(magentaLight);

  const amberLight = new THREE.PointLight(0xffc27a, 3, 11, 2);
  amberLight.position.set(0.8, 3.2, -3.5);
  scene.add(amberLight);

  const floorGlow = new THREE.PointLight(0x3fd8ff, 12, 7, 2);
  floorGlow.position.set(0, -1.15, -0.8);
  scene.add(floorGlow);

  const backCyan = new THREE.PointLight(0x54e8ff, 12, 6.5, 2);
  backCyan.position.set(-1.6, 1.3, -1.9);
  scene.add(backCyan);

  const backMagenta = new THREE.PointLight(0xff5fc8, 8, 6.5, 2);
  backMagenta.position.set(1.9, -0.9, -2.1);
  scene.add(backMagenta);

  // Broad studio panels: these are what make the glass body read as a volume.
  const keyPanel = new THREE.RectAreaLight(0xc8f6ff, 2.2, 7.0, 1.0);
  keyPanel.position.set(-3.8, 3.4, 3.4);
  keyPanel.lookAt(0, 0, 0);
  scene.add(keyPanel);

  const rimPanel = new THREE.RectAreaLight(0xff9ce6, 1.6, 1.0, 5.0);
  rimPanel.position.set(3.9, -0.4, 2.8);
  rimPanel.lookAt(0, 0, 0);
  scene.add(rimPanel);

  const frontPanel = new THREE.RectAreaLight(0xcaf4ff, 1.2, 1.0, 5.0);
  frontPanel.position.set(-4.1, 0.7, 3.6);
  frontPanel.lookAt(0, 0, 0);
  scene.add(frontPanel);

  // --- Motes ----------------------------------------------------------------
  const glow = createGlowTexture();
  const moteCount = 150;
  const positions = new Float32Array(moteCount * 3);
  const seeds = new Float32Array(moteCount);
  let rngSeed = 7;
  const rnd = () => {
    rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
    return rngSeed / 4294967296;
  };
  for (let i = 0; i < moteCount; i++) {
    positions[i * 3] = (rnd() - 0.5) * 9;
    positions[i * 3 + 1] = (rnd() - 0.5) * 5.5;
    positions[i * 3 + 2] = (rnd() - 0.5) * 6 - 0.5;
    seeds[i] = rnd();
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const moteMaterial = new THREE.PointsMaterial({
    size: 0.045,
    map: glow,
    color: 0x9fefff,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  scene.add(motes);

  const baseMotePositions = positions.slice();

  return {
    update(time: number, _dt: number) {
      wall.rotation.z = Math.sin(time * 0.045) * 0.035;
      wall.position.y = 0.2 + Math.sin(time * 0.32) * 0.035;

      halo.mesh.rotation.z = -time * 0.045;
      halo.mesh.position.y = 0.1 + Math.sin(time * 0.42) * 0.05;

      motes.rotation.y = time * 0.012;
      const positionAttr = moteGeometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        const seed = seeds[i];
        positionAttr.setY(
          i,
          baseMotePositions[i * 3 + 1] + Math.sin(time * (0.24 + seed * 0.5) + seed * 22) * 0.28,
        );
      }
      positionAttr.needsUpdate = true;

      if (litFloor) litFloor.emissiveIntensity = 0.36 + Math.sin(time * 0.7) * 0.05;
      cyanLight.intensity = 33 + Math.sin(time * 1.3) * 4;
      magentaLight.intensity = 29 + Math.sin(time * 0.9 + 2.1) * 4;
    },
    dispose() {
      wallTexture.dispose();
      wallMaterial.dispose();
      wall.geometry.dispose();
      floorTexture.dispose();
      floorMaterial.dispose();
      floor.geometry.dispose();
      halo.dispose();
      glow.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
      envMap.dispose();
      hemi.dispose();
      key.dispose();
      cyanLight.dispose();
      magentaLight.dispose();
      amberLight.dispose();
      floorGlow.dispose();
      backCyan.dispose();
      backMagenta.dispose();
      keyPanel.dispose();
      rimPanel.dispose();
      frontPanel.dispose();
    },
  };
}

function createRuneHalo(): { mesh: THREE.Mesh; dispose: () => void } {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");

  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(125,245,255,0.8)";
  ctx.shadowColor = "rgba(125,245,255,0.9)";
  ctx.shadowBlur = 14;
  for (const r of [size * 0.44, size * 0.34, size * 0.2]) {
    ctx.lineWidth = r === size * 0.44 ? 3 : 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,122,217,0.7)";
  ctx.shadowColor = "rgba(255,122,217,0.8)";
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const long = i % 4 === 0;
    ctx.lineWidth = long ? 3 : 1.4;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(a) * size * (long ? 0.36 : 0.4),
      cy + Math.sin(a) * size * (long ? 0.36 : 0.4),
    );
    ctx.lineTo(cx + Math.cos(a) * size * 0.43, cy + Math.sin(a) * size * 0.43);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(190,245,255,0.9)";
  ctx.shadowBlur = 12;
  drawRuneRing(ctx, cx, cy, size * 0.39, 22, "rgba(205,245,255,0.95)", 8, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
    color: 0x3d6f80,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7), material);
  mesh.position.set(0, 0.1, -4.4);

  return {
    mesh,
    dispose() {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
