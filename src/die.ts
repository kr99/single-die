import * as THREE from "three";
import { GLYPH_COUNT } from "./glyphs";
import { createGlyphMaterial, type GlyphSharedUniforms } from "./glyphMaterial";
import { createRimMaterial } from "./rimMaterial";
import {
  SHAPES,
  createFaceFrames,
  createRoundedGeometry,
  type DieShape,
  type ShapeId,
} from "./polyhedra";
const PALETTES: Array<[number, number]> = [
  [0x00eaff, 0x8a3cff],
  [0xff2ecc, 0x8a3cff],
  [0x00ffb3, 0x00aaff],
  [0x00d9ff, 0xff9a00],
  [0xa05cff, 0xff2ecc],
];


export interface PokeResult {
  faceIndex: number;
  symbolIndex: number;
}

/**
 * The glass oracle die.
 *
 * root -> pivot (poke orientation) -> wobble (idle / pointer / impact)
 *      -> content (scale spring) -> glass + glyph decals + core
 */
export class SigilDie {
  readonly root = new THREE.Group();
  readonly hitMesh: THREE.Mesh;
  private readonly rimMesh: THREE.Mesh;
  private readonly rimMaterial: THREE.ShaderMaterial;

  private readonly pivot = new THREE.Group();
  private readonly wobble = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly glassMaterial: THREE.MeshPhysicalMaterial;
  private readonly decalGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly geometryCache = new Map<ShapeId, THREE.BufferGeometry>();
  private readonly shared: GlyphSharedUniforms;
  private readonly atlas: THREE.Texture;

  private shape: DieShape = SHAPES.d6;
  private decals: THREE.Mesh[] = [];
  private decalMaterials: THREE.ShaderMaterial[] = [];

  private targetQuaternion = new THREE.Quaternion();
  private tiltEuler = new THREE.Euler();
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private kickAxis = new THREE.Vector3(1, 0.2, 0.4).normalize();
  private kickStrength = 0;
  private kickTime = 0;

  private scale = 0.02;
  private scaleVelocity = 0;
  private currentFace = 0;
  private burst = 0;

  private readonly core: THREE.Group;
  private readonly coreRings: THREE.Mesh[] = [];
  private coreSeed!: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    atlas: THREE.Texture,
    shared: GlyphSharedUniforms,
    lowQuality = false,
  ) {
    this.camera = camera;
    this.atlas = atlas;
    this.shared = shared;

    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xcfefff,
      metalness: 0,
      roughness: lowQuality ? 0.07 : 0.03,
      transmission: 1,
      thickness: lowQuality ? 1.0 : 1.15,
      ior: 1.55,
      dispersion: lowQuality ? 0 : 0.5,
      attenuationColor: new THREE.Color(0x64e4ff),
      attenuationDistance: 5.5,
      clearcoat: lowQuality ? 0 : 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: lowQuality ? 1.0 : 1.8,
      iridescence: lowQuality ? 0 : 0.38,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [110, 480],
      specularIntensity: lowQuality ? 0.65 : 1.1,
      emissive: new THREE.Color(0x072830),
      emissiveIntensity: lowQuality ? 0 : 0.45,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    this.hitMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.glassMaterial);
    this.hitMesh.renderOrder = 2;

    this.rimMaterial = createRimMaterial(0.36);
    this.rimMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.rimMaterial);
    this.rimMesh.scale.setScalar(1.0015);
    this.rimMesh.renderOrder = 3;

    this.core = this.createCore();

    this.content.add(this.hitMesh, this.rimMesh, this.core);
    this.wobble.add(this.content);
    this.pivot.add(this.wobble);
    this.root.add(this.pivot);
    this.root.position.y = 0;
    scene.add(this.root);

    this.setShape("d6", true);
  }

  private createCore(): THREE.Group {
    const group = new THREE.Group();

    const seed = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.07, 1),
      new THREE.MeshStandardMaterial({
        color: 0x08131c,
        emissive: new THREE.Color(0x4ef0ff),
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.7,
      }),
    );
    seed.position.set(0, -0.42, 0.02);
    group.add(seed);
    this.coreSeed = seed;

    const ringMaterialA = new THREE.MeshBasicMaterial({
      color: 0x66f2ff,
      toneMapped: false,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.008, 6, 96), ringMaterialA);
    ringA.rotation.x = Math.PI / 2.6;

    const ringMaterialB = new THREE.MeshBasicMaterial({
      color: 0xff7ad9,
      toneMapped: false,
    });
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 6, 80), ringMaterialB);
    ringB.rotation.y = Math.PI / 2.2;
    ringB.rotation.z = 0.4;

    group.add(ringA, ringB);
    this.coreRings.push(ringA, ringB);

    const innerLight = new THREE.PointLight(0x63efff, 7, 4.5, 2);
    group.add(innerLight);

    return group;
  }

  setShape(id: ShapeId, intro = false): number {
    this.shape = SHAPES[id];

    let geometry = this.geometryCache.get(id);
    if (!geometry) {
      geometry = createRoundedGeometry(this.shape);
      this.geometryCache.set(id, geometry);
    }
    this.hitMesh.geometry = geometry;
    this.rimMesh.geometry = geometry;

    for (const decal of this.decals) this.content.remove(decal);
    for (const material of this.decalMaterials) material.dispose();
    this.decals = [];
    this.decalMaterials = [];

    const frames = createFaceFrames(this.shape);
    for (const frame of frames) {
      const [a, b] = PALETTES[frame.index % PALETTES.length];
      const material = createGlyphMaterial(
        this.atlas,
        frame.seed,
        new THREE.Color(a),
        new THREE.Color(b),
        this.shared,
        frame.index % 5 === 1 ? 1.05 : 1.15,
      );
      const decal = new THREE.Mesh(this.decalGeometry, material);
      decal.position.copy(frame.position);
      decal.quaternion.copy(frame.quaternion);
      decal.scale.set(this.shape.decalSize, this.shape.decalSize, 1);
      decal.renderOrder = 4;
      decal.frustumCulled = false;

      this.decals.push(decal);
      this.decalMaterials.push(material);
      this.content.add(decal);
    }

    this.currentFace = 0;
    this.alignToFace(0);

    this.scale = intro ? 0.02 : 0.82;
    this.scaleVelocity = intro ? 0 : 3.2;
    this.burst = 1;
    this.shared.uBurst.value = 1;

    return this.currentFace;
  }

  private alignToFace(faceIndex: number): void {
    const normal = this.shape.faces[faceIndex].normal;
    const toCamera = this.camera.position.clone().sub(this.root.position).normalize();

    const align = new THREE.Quaternion().setFromUnitVectors(normal, toCamera);
    const twist = new THREE.Quaternion().setFromAxisAngle(
      toCamera,
      (Math.sin(faceIndex * 2.7 + this.shape.faces.length) * 0.5) * 0.7,
    );

    // Keep a three-quarter view so neighbouring facets and highlights read.
    this.tiltEuler.set(
      0.38 + Math.sin(faceIndex * 1.9) * 0.08,
      -0.62 + Math.cos(faceIndex * 1.3) * 0.1,
      0,
    );
    const tilt = new THREE.Quaternion().setFromEuler(this.tiltEuler);

    this.targetQuaternion.copy(tilt).multiply(twist).multiply(align);
  }

  poke(): PokeResult {
    let next = Math.floor(Math.random() * this.shape.faces.length);
    if (next === this.currentFace && this.shape.faces.length > 1) {
      next =
        (next + 1 + Math.floor(Math.random() * (this.shape.faces.length - 1))) %
        this.shape.faces.length;
    }
    this.currentFace = next;
    this.alignToFace(next);

    const variation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (Math.random() - 0.5) * 0.22,
        (Math.random() - 0.5) * 0.32,
        (Math.random() - 0.5) * 0.16,
      ),
    );
    this.targetQuaternion.multiply(variation);

    this.kickAxis
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize();
    if (this.kickAxis.lengthSq() < 1e-4) this.kickAxis.set(1, 0.2, 0.4).normalize();
    this.kickTime = 0;
    this.kickStrength = 0.38;

    this.scaleVelocity += 2.6;
    this.burst = 1;
    this.shared.uBurst.value = 1;

    return { faceIndex: next, symbolIndex: this.symbolIndex };
  }

  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  update(time: number, dt: number): void {
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 3.4));

    // Orientation eases toward the selected facet.
    const orientationEase = 1 - Math.exp(-dt * 4.6);
    this.pivot.quaternion.slerp(this.targetQuaternion, orientationEase);

    // Impact wobble: a short, fast, decaying tilt.
    this.kickTime += dt;
    const kickAmp = this.kickStrength * Math.sin(this.kickTime * 24) * Math.exp(-this.kickTime * 7.5);
    const kickQuat = new THREE.Quaternion().setFromAxisAngle(this.kickAxis, kickAmp);

    const idleX = Math.sin(time * 0.57) * 0.018 + this.pointerSmooth.y * 0.12;
    const idleY = Math.cos(time * 0.46) * 0.024 + this.pointerSmooth.x * 0.16;
    const idleZ = Math.sin(time * 0.37 + 1.2) * 0.012;
    const idleQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(idleX, idleY, idleZ));
    this.wobble.quaternion.copy(idleQuat).multiply(kickQuat);

    // Floating.
    this.root.position.y = Math.sin(time * 0.82) * 0.045 - 0.02;

    // Scale spring.
    this.scaleVelocity += (1 - this.scale) * 130 * dt;
    this.scaleVelocity *= Math.exp(-12 * dt);
    this.scale = Math.max(0.005, this.scale + this.scaleVelocity * dt);
    this.content.scale.setScalar(this.scale);

    // Inner mechanism.
    this.coreRings[0].rotation.z = time * 0.55;
    this.coreRings[1].rotation.x = -time * 0.4;
    this.coreSeed.rotation.y = time * 0.3;
    this.coreSeed.position.y = -0.42 + Math.sin(time * 0.7) * 0.035;

    // Glitch energy decays after a poke or a shape change.
    this.burst *= Math.exp(-dt * 2.6);
    this.shared.uBurst.value = Math.max(0, this.burst);
    this.shared.uTime.value = time;
    this.rimMaterial.uniforms.uTime.value = time;
  }

  get faceIndex(): number {
    return this.currentFace;
  }

  get shapeId(): ShapeId {
    return this.shape.id;
  }

  get sides(): number {
    return this.shape.sides;
  }

  get symbolIndex(): number {
    const seed = (this.currentFace + 1) / this.shape.faces.length;
    return Math.floor(seed * (GLYPH_COUNT - 0.001)) % GLYPH_COUNT;
  }
}
