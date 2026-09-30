import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { box } from "../piano/geometry.js";

const SEAT_W = 2.5;
const SEAT_D = 1.24;
const PUFF = 0.045;

/** Diamond (capitonné) tufting: three staggered rows of buttons. */
const BUTTONS = [
  ...[-0.99, -0.33, 0.33, 0.99].flatMap((x) => [
    [x, -0.4],
    [x, 0.4],
  ]),
  [-0.66, 0],
  [0, 0],
  [0.66, 0],
];

function distanceToSegment(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = THREE.MathUtils.clamp(
    ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz),
    0,
    1,
  );
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Creases run between diagonal neighbours: the folds of a tufted seat.
const CREASES = [];
BUTTONS.forEach((a, i) =>
  BUTTONS.slice(i + 1).forEach((b) => {
    const dx = Math.abs(a[0] - b[0]);
    const dz = Math.abs(a[1] - b[1]);
    if (Math.abs(dx - 0.33) < 0.01 && Math.abs(dz - 0.4) < 0.01)
      CREASES.push([a, b]);
  }),
);

/** Pillow height in 0..1 at seat coordinates (x, z). */
function puff(x, z) {
  const u = x / SEAT_W + 0.5;
  const v = z / SEAT_D + 0.5;
  const edge =
    THREE.MathUtils.smoothstep(u, 0, 0.07) *
    THREE.MathUtils.smoothstep(1 - u, 0, 0.07) *
    THREE.MathUtils.smoothstep(v, 0, 0.1) *
    THREE.MathUtils.smoothstep(1 - v, 0, 0.1);
  let dip = 0;
  for (const [bx, bz] of BUTTONS)
    dip = Math.max(dip, Math.exp(-(((x - bx) ** 2 + (z - bz) ** 2) / 0.0075)));
  let crease = 0;
  for (const [a, b] of CREASES)
    crease = Math.max(
      crease,
      Math.exp(-((distanceToSegment(x, z, a, b) / 0.022) ** 2)),
    );
  return edge * (1 - 0.9 * dip - 0.32 * crease);
}

/** Fine pebbled leather grain as a tiling normal + roughness pair. */
function createLeatherGrain() {
  const size = 256;
  const height = new Float32Array(size * size);
  // Worley noise on a 26×26 grid: one pebble per cell, 3×3 neighbour search.
  const grid = 26;
  const cell = size / grid;
  const jitter = Array.from({ length: grid * grid }, () => [
    Math.random(),
    Math.random(),
  ]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let best = Infinity;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox;
          const cy = gy + oy;
          const [jx, jy] =
            jitter[((cy + grid) % grid) * grid + ((cx + grid) % grid)];
          const dx = x - (cx + jx) * cell;
          const dy = y - (cy + jy) * cell;
          best = Math.min(best, dx * dx + dy * dy);
        }
      height[y * size + x] = Math.sqrt(best);
    }
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 0.35;
      const ny = (at(x, y - 1) - at(x, y + 1)) * 0.35;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      normal[i] = ((nx / len) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      normal[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
      // Pore valleys are duller than the polished pebble tops.
      rough[i] =
        rough[i + 1] =
        rough[i + 2] =
          110 + Math.min(1, at(x, y) / 6) * 70;
      rough[i + 3] = 255;
    }
  const toTexture = (data) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 9);
    texture.needsUpdate = true;
    return texture;
  };
  return { normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
}

/** A stationary pianist's bench with a tufted black leather seat. */
export function createBench(mats, stageTopY) {
  const bench = new THREE.Group();
  bench.name = "pianist-bench";
  bench.position.set(0, stageTopY, 5.1);

  const grain = createLeatherGrain();
  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x18120f,
    roughness: 1,
    roughnessMap: grain.roughnessMap,
    normalMap: grain.normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    clearcoat: 0.35,
    clearcoatRoughness: 0.42,
    sheen: 0.18,
    sheenColor: 0x7a6552,
    envMapIntensity: 0.9,
  });

  box(2.48, 0.14, 1.22, mats.blackLacquer, bench, 0, 0.83);
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(2.6, 0.2, 1.34, 3, 0.06),
    leather,
  );
  base.position.y = 0.98;
  base.castShadow = base.receiveShadow = true;
  bench.add(base);

  // Real geometry for the pillowed top, so tufts show in silhouette and light.
  const top = new THREE.PlaneGeometry(SEAT_W, SEAT_D, 160, 80);
  top.rotateX(-Math.PI / 2);
  const position = top.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, puff(position.getX(i), position.getZ(i)) * PUFF);
  top.computeVertexNormals();
  const seat = new THREE.Mesh(top, leather);
  seat.position.y = 1.075;
  seat.castShadow = seat.receiveShadow = true;
  bench.add(seat);

  const buttonGeometry = new THREE.SphereGeometry(0.03, 12, 8);
  buttonGeometry.scale(1, 0.55, 1);
  for (const [x, z] of BUTTONS) {
    const button = new THREE.Mesh(buttonGeometry, leather);
    button.position.set(x, seat.position.y + puff(x, z) * PUFF + 0.008, z);
    bench.add(button);
  }

  const legGeometry = new THREE.BoxGeometry(0.14, 0.8, 0.14);
  for (const x of [-1.08, 1.08]) {
    for (const z of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(legGeometry, mats.blackLacquer);
      leg.position.set(x, 0.4, z);
      leg.castShadow = leg.receiveShadow = true;
      bench.add(leg);
    }
  }
  return bench;
}
