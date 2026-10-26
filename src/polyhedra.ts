import * as THREE from "three";

export interface FacePlane {
  normal: THREE.Vector3;
  distance: number;
}

export type ShapeId = "d6" | "d8" | "d20";

export interface DieShape {
  id: ShapeId;
  sides: number;
  faces: FacePlane[];
  rounding: number;
  decalSize: number;
  decalLift: number;
}

const D6_D8_INRADIUS = 0.98;
const ICO_INRADIUS = 1.34;

function cubeFaces(): FacePlane[] {
  return [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ].map((normal) => ({ normal, distance: D6_D8_INRADIUS }));
}

function octaFaces(): FacePlane[] {
  const faces: FacePlane[] = [];
  for (const x of [1, -1]) {
    for (const y of [1, -1]) {
      for (const z of [1, -1]) {
        const normal = new THREE.Vector3(x, y, z).normalize();
        faces.push({ normal, distance: D6_D8_INRADIUS });
      }
    }
  }
  return faces;
}

function icoFaces(): FacePlane[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

  const triangles = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  return triangles.map(([a, b, c]) => {
    const normal = new THREE.Vector3()
      .add(verts[a])
      .add(verts[b])
      .add(verts[c])
      .normalize();
    return { normal, distance: ICO_INRADIUS };
  });
}

export const SHAPES: Record<ShapeId, DieShape> = {
  d6: {
    id: "d6",
    sides: 6,
    faces: cubeFaces(),
    rounding: 0.16,
    decalSize: 1.18,
    decalLift: 0.012,
  },
  d8: {
    id: "d8",
    sides: 8,
    faces: octaFaces(),
    rounding: 0.15,
    decalSize: 0.86,
    decalLift: 0.014,
  },
  d20: {
    id: "d20",
    sides: 20,
    faces: icoFaces(),
    rounding: 0.14,
    decalSize: 0.78,
    decalLift: 0.014,
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Polynomial smooth maximum. Used to bevel a convex intersection of
 * half-spaces: the original face planes stay put, while the shared edges
 * and corners are pulled into a smooth radius.
 */
function smoothMax(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return b + (a - b) * h + k * h * (1 - h);
}

function sdf(shape: DieShape, p: THREE.Vector3): number {
  let d = p.dot(shape.faces[0].normal) - shape.faces[0].distance;
  for (let i = 1; i < shape.faces.length; i++) {
    const face = shape.faces[i];
    const di = p.dot(face.normal) - face.distance;
    d = smoothMax(d, di, shape.rounding);
  }
  return d;
}

const probe = new THREE.Vector3();

function sdfNormal(shape: DieShape, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const e = 0.0018;

  probe.set(p.x + e, p.y, p.z);
  const dx = sdf(shape, probe);
  probe.set(p.x - e, p.y, p.z);
  const nx = dx - sdf(shape, probe);

  probe.set(p.x, p.y + e, p.z);
  const dy = sdf(shape, probe);
  probe.set(p.x, p.y - e, p.z);
  const ny = dy - sdf(shape, probe);

  probe.set(p.x, p.y, p.z + e);
  const dz = sdf(shape, probe);
  probe.set(p.x, p.y, p.z - e);
  const nz = dz - sdf(shape, probe);

  return out.set(nx, ny, nz).normalize();
}

const BOUNDING_LIMIT = 2.1;

/**
 * Project a dense icosphere onto the rounded SDF surface. This yields a
 * watertight, evenly tessellated rounded polyhedron without any bevel
 * seams; normals come from the SDF, so highlights stay buttery at the edges.
 */
export function createRoundedGeometry(shape: DieShape, detail = 26): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, detail);
  const sourcePosition = source.getAttribute("position") as THREE.BufferAttribute;
  const positions = new Float32Array(sourcePosition.count * 3);
  const normals = new Float32Array(sourcePosition.count * 3);

  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < sourcePosition.count; i++) {
    dir.fromBufferAttribute(sourcePosition, i).normalize();

    let lo = 0;
    let hi = BOUNDING_LIMIT;
    for (let step = 0; step < 30; step++) {
      const mid = (lo + hi) * 0.5;
      p.copy(dir).multiplyScalar(mid);
      if (sdf(shape, p) < 0) lo = mid;
      else hi = mid;
    }

    p.copy(dir).multiplyScalar((lo + hi) * 0.5);
    sdfNormal(shape, p, n);

    const o = i * 3;
    positions[o] = p.x;
    positions[o + 1] = p.y;
    positions[o + 2] = p.z;
    normals[o] = n.x;
    normals[o + 1] = n.y;
    normals[o + 2] = n.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  source.dispose();
  return geometry;
}

export interface FaceFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  seed: number;
  index: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);

/** Stable, upright decal frame for every face of a die. */
export function createFaceFrames(shape: DieShape): FaceFrame[] {
  return shape.faces.map((face, index) => {
    const n = face.normal;
    const up = Math.abs(n.y) > 0.94 ? FALLBACK_UP : UP;

    const t = new THREE.Vector3().crossVectors(up, n);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    const b = new THREE.Vector3().crossVectors(n, t).normalize();

    const basis = new THREE.Matrix4().makeBasis(t, b, n);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

    // Slight deterministic hand-inscribed rotation per facet.
    const roll = (Math.sin(index * 12.9898 + shape.faces.length) * 0.5) * 0.22;
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(n, roll));

    return {
      position: n.clone().multiplyScalar(face.distance + shape.decalLift),
      quaternion,
      seed: (index + 1) / shape.faces.length,
      index,
    };
  });
}
