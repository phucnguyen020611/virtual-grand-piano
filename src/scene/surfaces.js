import * as THREE from "three";

/**
 * Procedural PBR sets (albedo + normal + roughness) for the hall's surfaces.
 * Each set is painted once into typed arrays; normals come from a height
 * field, so grooves, gaps and weave catch the stage light like real relief.
 */

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Smooth tiling value noise in 0..1, `cells` lattice cells across. */
function valueNoise(rand, cellsX, cellsY) {
  const lattice = Array.from({ length: cellsX * cellsY }, rand);
  const at = (x, y) =>
    lattice[
      (((y % cellsY) + cellsY) % cellsY) * cellsX +
        (((x % cellsX) + cellsX) % cellsX)
    ];
  return (u, v) => {
    const x = u * cellsX;
    const y = v * cellsY;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

function texture(
  data,
  w,
  h,
  { srgb = false, repeat = [1, 1], aniso = 1 } = {},
) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Paint a set from a per-texel sampler returning [r, g, b, height, rough]. */
function paint(w, h, sample, strength, options) {
  const albedo = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, z, k] = sample(x / w, y / h, x, y);
      const i = y * w + x;
      albedo.set([r, g, b, 255], i * 4);
      rough.set([k * 255, k * 255, k * 255, 255], i * 4);
      height[i] = z;
    }
  const normal = new Uint8Array(w * h * 4);
  const hAt = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (hAt(x - 1, y) - hAt(x + 1, y)) * strength;
      const ny = (hAt(x, y - 1) - hAt(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      normal.set(
        [
          ((nx / len) * 0.5 + 0.5) * 255,
          ((ny / len) * 0.5 + 0.5) * 255,
          ((1 / len) * 0.5 + 0.5) * 255,
          255,
        ],
        (y * w + x) * 4,
      );
    }
  return {
    map: texture(albedo, w, h, { ...options, srgb: true }),
    normalMap: texture(normal, w, h, options),
    roughnessMap: texture(rough, w, h, options),
  };
}

/** Clone a set with its own repeat, sharing the painted images. */
export function repeatSet(set, x, y) {
  return Object.fromEntries(
    Object.entries(set).map(([key, t]) => {
      const clone = t.clone();
      clone.repeat.set(x, y);
      clone.needsUpdate = true;
      return [key, clone];
    }),
  );
}

/**
 * Stained oak stage boards: eight boards across, two lengths down the tile,
 * each with its own tone, flowing grain, bevelled seams and butt joints.
 */
export function stageBoardSet(aniso) {
  const W = 512;
  const H = 1024;
  const boards = 8;
  const rand = rng(7);
  const tone = Array.from({ length: boards }, () => 0.88 + rand() * 0.18);
  const joint = Array.from({ length: boards }, () => 0.15 + rand() * 0.7);
  const phase = Array.from({ length: boards }, () => rand() * 100);
  const blotch = valueNoise(rng(11), 6, 12);
  const fine = valueNoise(rng(13), 64, 256);
  return paint(
    W,
    H,
    (u, v) => {
      const bu = u * boards;
      const board = Math.floor(bu);
      const across = bu - board; // 0..1 across this board
      const p = phase[board];
      // Growth rings: stretched along the board, gently meandering.
      const ring = Math.sin(
        (across * 9 + Math.sin(v * 7 + p) * 0.8 + Math.sin(v * 23 + p) * 0.12) *
          Math.PI *
          2,
      );
      const figure = Math.pow(0.5 + 0.5 * ring, 6);
      const grain = fine(u, v);
      const t =
        tone[board] *
        (0.9 + 0.2 * blotch(u, v)) *
        (1 - 0.22 * figure) *
        (0.96 + 0.08 * grain);
      // Seams: a dark bevel at each board edge, and one butt joint per length.
      const edge = Math.min(across, 1 - across) * (W / boards);
      const lengthPos = (v * 2 + joint[board]) % 1;
      const butt = Math.min(lengthPos, 1 - lengthPos) * (H / 2);
      const seam = Math.min(edge, butt);
      const groove = seam < 1 ? 1 : seam < 2 ? 0.35 : 0;
      const shade = t * (1 - 0.45 * groove);
      return [
        Math.min(255, 116 * shade),
        Math.min(255, 84 * shade),
        Math.min(255, 62 * shade),
        -groove * 2 -
          figure * 0.12 -
          Math.pow(Math.abs(across - 0.5) * 2, 6) * 0.25,
        0.38 + 0.18 * figure + 0.1 * grain + 0.3 * groove,
      ];
    },
    2.2,
    { aniso },
  );
}

/** Hand-trowelled lime plaster: soft mottling and a fine, matte tooth. */
export function plasterSet(aniso) {
  const W = 512;
  const H = 512;
  const broad = valueNoise(rng(31), 5, 5);
  const mid = valueNoise(rng(37), 24, 24);
  const tooth = valueNoise(rng(41), 160, 160);
  return paint(
    W,
    H,
    (u, v) => {
      const m = 0.9 + 0.1 * broad(u, v) + 0.05 * mid(u, v);
      return [
        142 * m,
        128 * m,
        108 * m,
        mid(u, v) * 0.6 + tooth(u, v) * 0.35,
        0.86 + 0.1 * tooth(u, v),
      ];
    },
    1.6,
    { aniso },
  );
}

/** Cut velvet: a fine twill weave, slightly irregular pile. */
export function velvetSet(aniso) {
  const W = 256;
  const H = 256;
  const pile = valueNoise(rng(51), 64, 64);
  return paint(
    W,
    H,
    (u, v, x, y) => {
      const twill = (x + y) % 4 < 2 ? 1 : 0;
      const p = pile(u, v);
      const m = 0.88 + 0.1 * p + 0.04 * twill;
      return [150 * m, 34 * m, 46 * m, twill * 0.25 + p * 0.5, 0.88 + 0.08 * p];
    },
    1.2,
    { aniso },
  );
}

/**
 * Silk damask wall covering: a tone-on-tone crimson medallion repeat, the
 * pattern woven satin (glossier) against a matte ground.
 */
export function damaskSet(aniso) {
  const W = 256;
  const H = 384;
  const fine = valueNoise(rng(61), 96, 144);
  return paint(
    W,
    H,
    (u, v) => {
      // Ogee lattice: two offset rows of pointed medallions per tile.
      const cell = (x, y) => {
        const dx = Math.abs((((x % 1) + 1) % 1) - 0.5) * 2;
        const dy = ((y % 1) + 1) % 1;
        const width =
          Math.sin(dy * Math.PI) * (0.55 + 0.25 * Math.cos(dy * Math.PI * 4));
        return dx < width ? 1 - dx / Math.max(width, 1e-3) : 0;
      };
      const motif = Math.max(
        cell(u * 2, v * 2),
        cell(u * 2 + 0.5, v * 2 + 0.5),
      );
      const satin = motif > 0.08 ? 1 : 0;
      const thread = fine(u, v);
      const m = (satin ? 1.12 : 0.86) * (0.95 + 0.08 * thread);
      return [
        118 * m,
        18 * m,
        26 * m,
        satin * 0.35 + thread * 0.2,
        satin ? 0.42 : 0.82,
      ];
    },
    1.2,
    { aniso },
  );
}

/**
 * Coffered ceiling panel (one coffer per tile): ivory ribs, a stepped gilded
 * moulding, and a painted deep-blue field with a gold star rosette.
 */
export function cofferSet(aniso) {
  const W = 256;
  const H = 256;
  return paint(
    W,
    H,
    (u, v) => {
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const r = Math.hypot(u - 0.5, v - 0.5);
      const angle = Math.atan2(v - 0.5, u - 0.5);
      const petals = 0.13 + 0.05 * Math.cos(angle * 8);
      if (edge < 0.1) return [222, 208, 180, 1, 0.8]; // ivory rib
      if (edge < 0.135 || (edge > 0.16 && edge < 0.175))
        return [212, 168, 80, 0.6, 0.3]; // gilt fillets
      if (r < petals) return [214, 170, 82, 0.5 - r, 0.32]; // rosette
      const field = 0.9 + 0.1 * Math.cos(r * 18);
      return [34 * field, 44 * field, 76 * field, 0.1 - edge * 0.2, 0.75];
    },
    3,
    { aniso },
  );
}

/**
 * Oak herringbone parquet, the floor of a palace salon: 1 × 4 blocks laid at
 * 45° so the zigzag runs along the texture's u axis. Blocks follow the
 * lattice (1, 1) · (8, 0) in cell units; the tile is its rotated period,
 * √2 × 4√2 cells, so it repeats seamlessly. `cellSize` is one block width.
 */
export function parquetSet(aniso) {
  const W = 128;
  const H = 512;
  const cellPx = W / Math.SQRT2;
  // 8 × 8 cell table: which block covers a cell, its direction and place.
  const table = [];
  for (let s = 0; s < 8; s++) {
    for (let i = 0; i < 4; i++)
      table[s * 8 + ((s + i) % 8)] = { id: s * 2, vertical: false, index: i };
    for (let j = 0; j < 4; j++)
      table[((s + 1 + j) % 8) * 8 + s] = {
        id: s * 2 + 1,
        vertical: true,
        index: j,
      };
  }
  const rand = rng(83);
  const tone = Array.from({ length: 16 }, () => 0.88 + rand() * 0.2);
  const phase = Array.from({ length: 16 }, () => rand() * 10);
  const fine = valueNoise(rng(89), 24, 96);
  return paint(
    W,
    H,
    (u, v, x, y) => {
      // Texel → lattice coordinates (cells), via the 45° frame.
      const X = x / cellPx;
      const Y = y / cellPx;
      const a = (X + Y) / Math.SQRT2;
      const b = (X - Y) / Math.SQRT2;
      const ca = Math.floor(a);
      const cb = Math.floor(b);
      const cell = table[(((cb % 8) + 8) % 8) * 8 + (((ca % 8) + 8) % 8)];
      const fa = a - ca;
      const fb = b - cb;
      const along = cell.vertical
        ? (cell.index + fb) / 4
        : (cell.index + fa) / 4;
      const across = cell.vertical ? fa : fb;
      const p = phase[cell.id];
      // Quarter-sawn oak: fine straight grain with a slow wander.
      const ring = Math.sin(
        (across * 7 + Math.sin(along * 5 + p) * 0.4 + p) * Math.PI * 2,
      );
      const figure = Math.pow(0.5 + 0.5 * ring, 5);
      const grain = fine(u, v);
      // The two block directions catch the light differently.
      const t =
        tone[cell.id] *
        (cell.vertical ? 0.93 : 1) *
        (1 - 0.18 * figure) *
        (0.95 + 0.1 * grain);
      const seam = Math.min(
        Math.min(across, 1 - across) * cellPx,
        Math.min(along, 1 - along) * cellPx * 4,
      );
      const groove = seam < 0.9 ? 1 : seam < 1.8 ? 0.3 : 0;
      const shade = t * (1 - 0.5 * groove);
      return [
        Math.min(255, 152 * shade),
        Math.min(255, 104 * shade),
        Math.min(255, 62 * shade),
        -groove * 1.6 - figure * 0.1,
        0.34 + 0.14 * figure + 0.08 * grain + 0.3 * groove,
      ];
    },
    2,
    { aniso },
  );
}
/** World size of one parquet tile (√2 × 4√2 block widths of 0.33 units). */
export const PARQUET_TILE = [0.33 * Math.SQRT2, 0.33 * 4 * Math.SQRT2];

/**
 * Royal aisle runner: a crimson wool field between gold borders, a gold
 * lozenge medallion every repeat. u runs across the runner, v along it.
 */
export function runnerSet(aniso) {
  const W = 256;
  const H = 512;
  const pile = valueNoise(rng(97), 64, 128);
  const CRIMSON = [132, 16, 28];
  const DEEP = [80, 8, 18];
  const GOLD = [200, 156, 74];
  return paint(
    W,
    H,
    (u, v) => {
      const edge = Math.min(u, 1 - u);
      const dx = Math.abs(u - 0.5);
      const dy = Math.abs(v - 0.5);
      const lozenge = dx / 0.3 + dy / 0.22; // diamond around the centre
      const petals =
        Math.hypot(dx * 1.6, dy) <
        0.05 + 0.02 * Math.cos(Math.atan2(dy, dx) * 8);
      let colour = CRIMSON;
      if (edge < 0.035) colour = DEEP;
      else if (edge < 0.08) colour = GOLD;
      else if (edge < 0.1) colour = DEEP;
      else if (edge < 0.11) colour = GOLD;
      else if ((lozenge > 0.92 && lozenge < 1) || petals) colour = GOLD;
      else if (lozenge < 0.92) colour = DEEP;
      // Small gold studs between medallions.
      else if (Math.hypot(dx, Math.min(v, 1 - v) * 1.4) < 0.025) colour = GOLD;
      const gold = colour === GOLD;
      const p = pile(u, v);
      const m = 0.92 + 0.12 * p;
      return [
        colour[0] * m,
        colour[1] * m,
        colour[2] * m,
        p * 0.5 + (gold ? 0.35 : 0),
        gold ? 0.62 : 0.9,
      ];
    },
    1.1,
    { aniso },
  );
}
