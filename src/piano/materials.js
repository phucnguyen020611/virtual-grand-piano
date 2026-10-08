import * as THREE from "three";

/** Draw an offscreen canvas into an sRGB CanvasTexture. */
export function makeCanvasTexture(draw, w, h, maxAniso = 1) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function createWoodTexture(maxAniso) {
  const tex = makeCanvasTexture(
    (g, w, h) => {
      const base = g.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, "#1e110b");
      base.addColorStop(0.5, "#2d1a11");
      base.addColorStop(1, "#190e0a");
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 118; i++) {
        const y = (i / 118) * h + Math.sin(i * 11.7) * 7;
        const a = 0.025 + ((i * 17) % 9) * 0.006;
        g.strokeStyle = `rgba(151,98,59,${a})`;
        g.lineWidth = 0.45 + ((i * 7) % 5) * 0.24;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x < w; x += 28)
          g.lineTo(
            x,
            y + Math.sin(x * 0.012 + i * 0.7) * 2.5 + Math.sin(x * 0.003) * 3,
          );
        g.stroke();
      }
      for (let y = 0; y < h; y += 106) {
        g.fillStyle = "rgba(12,6,4,.32)";
        g.fillRect(0, y, w, 3);
        g.fillStyle = "rgba(91,54,34,.14)";
        g.fillRect(0, y + 4, w, 1);
      }
    },
    1024,
    1024,
    maxAniso,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.8, 2.0);
  return tex;
}

export function createSpruceTexture(maxAniso) {
  const tex = makeCanvasTexture(
    (g, w, h) => {
      const base = g.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, "#afa68f");
      base.addColorStop(0.5, "#c8bea4");
      base.addColorStop(1, "#ada28a");
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // Fine, low-saturation longitudinal spruce grain.
      for (let x = 0; x < w; x += 5) {
        const a = 0.028 + ((x * 13) % 17) * 0.0024;
        g.strokeStyle = `rgba(93,79,53,${a})`;
        g.lineWidth = 0.45 + ((x * 3) % 4) * 0.2;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(
          x + Math.sin(x * 0.028) * 4,
          h * 0.34,
          x + Math.sin(x * 0.012 + 2) * 5,
          h * 0.68,
          x + Math.sin(x * 0.02) * 3,
          h,
        );
        g.stroke();
      }
      g.fillStyle = "rgba(85,73,49,.05)";
      for (let y = 18; y < h; y += 120) g.fillRect(0, y, w, 1);
    },
    1024,
    1024,
    maxAniso,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRoughnessTexture(size, sample) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = THREE.MathUtils.clamp(sample(x, y), 0, 255);
      const index = (y * size + x) * 4;
      // Three.js roughness maps read green; replicate into RGB so this stays
      // robust for diagnostics and future channel-specific material maps.
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createCastRoughnessTexture() {
  const tex = createRoughnessTexture(128, (x, y) => {
    const grain = ((x * 47 + y * 71 + x * y * 3) % 29) - 14;
    const wave = Math.sin(x * 0.71 + y * 0.43) * 8;
    return 164 + grain + wave;
  });
  tex.repeat.set(5, 5);
  return tex;
}

function createWoodRoughnessTexture() {
  const tex = createRoughnessTexture(192, (x, y) => {
    const grain = Math.sin(x * 0.18 + Math.sin(y * 0.06) * 2.2) * 18;
    const longWave = Math.sin(x * 0.042) * 10;
    return 183 + grain + longWave;
  });
  tex.repeat.set(3, 2);
  return tex;
}

/** Textured brand plaque for the fallboard (tasteful text, not a traced mark). */
export function createLogoTexture(maxAniso) {
  return makeCanvasTexture(
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#d7b66f";
      g.strokeStyle = "#d7b66f";
      g.textAlign = "center";
      const cx = w / 2;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 31, 17);
      g.bezierCurveTo(cx - 36, 42, cx - 26, 58, cx, 68);
      g.bezierCurveTo(cx + 26, 58, cx + 36, 42, cx + 31, 17);
      g.stroke();
      [-16, -8, 0, 8, 16].forEach((dx) => {
        g.beginPath();
        g.moveTo(cx + dx, 23);
        g.lineTo(cx + dx * 0.42, 62);
        g.stroke();
      });
      g.beginPath();
      g.moveTo(cx - 24, 69);
      g.lineTo(cx + 24, 69);
      g.moveTo(cx - 15, 75);
      g.lineTo(cx + 15, 75);
      g.stroke();
      g.font = "600 38px Georgia";
      g.fillText("STEINWAY & SONS", w / 2, 112);
      g.font = "14px Georgia";
      g.fillText("NEW YORK · HAMBURG", w / 2, 137);
    },
    1000,
    150,
    maxAniso,
  );
}

/**
 * Build the shared material palette. Canvas textures need the renderer's max
 * anisotropy, so the whole set is created once the renderer exists.
 */
export function createMaterials(maxAniso) {
  const woodTex = createWoodTexture(maxAniso);
  const spruceTex = createSpruceTexture(maxAniso);
  const castRoughness = createCastRoughnessTexture();
  const woodRoughness = createWoodRoughnessTexture();

  return {
    woodTex,
    spruceTex,
    castRoughness,
    woodRoughness,
    maxAniso,

    // Case / exterior
    // Concert polyester finish: full clearcoat over a slightly softer base.
    blackLacquer: new THREE.MeshPhysicalMaterial({
      color: 0x0a0b0d,
      metalness: 0,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      ior: 1.5,
      specularIntensity: 0.5,
      envMapIntensity: 1.05,
    }),
    blackSatin: new THREE.MeshPhysicalMaterial({
      color: 0x0b0c0d,
      metalness: 0,
      roughness: 0.34,
      clearcoat: 0.25,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.55,
    }),
    innerCase: new THREE.MeshStandardMaterial({
      color: 0x151210,
      metalness: 0,
      roughness: 0.68,
    }),

    // Metals
    gold: new THREE.MeshStandardMaterial({
      color: 0x756348,
      metalness: 0.9,
      roughness: 0.3,
      envMapIntensity: 0.78,
    }),
    // Gold-painted cast-iron plate: warm enough to read under the raised lid.
    plateGold: new THREE.MeshStandardMaterial({
      color: 0x8f7442,
      metalness: 0.6,
      roughness: 0.48,
      roughnessMap: castRoughness,
      envMapIntensity: 0.45,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: 0x735637,
      metalness: 0.84,
      roughness: 0.38,
      envMapIntensity: 0.8,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x858d90,
      metalness: 0.92,
      roughness: 0.28,
      envMapIntensity: 0.9,
    }),
    copper: new THREE.MeshStandardMaterial({
      color: 0x875034,
      metalness: 0.82,
      roughness: 0.4,
      envMapIntensity: 0.8,
    }),

    // Timber
    maple: new THREE.MeshStandardMaterial({
      color: 0x8c623d,
      roughness: 0.62,
    }),
    spruce: new THREE.MeshStandardMaterial({
      color: 0xb9b5ab,
      roughness: 0.76,
      map: spruceTex,
      roughnessMap: woodRoughness,
    }),
    bridge: new THREE.MeshStandardMaterial({
      color: 0x3f2112,
      roughness: 0.6,
    }),

    // Felt / keytops
    felt: new THREE.MeshStandardMaterial({ color: 0x3d0d14, roughness: 0.98 }),
    hammerFelt: new THREE.MeshStandardMaterial({
      color: 0xbba68a,
      roughness: 0.96,
    }),
    ivory: new THREE.MeshPhysicalMaterial({
      color: 0xe9e1cf,
      roughness: 0.34,
      clearcoat: 0.14,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.45,
    }),
    ebony: new THREE.MeshPhysicalMaterial({
      color: 0x090a0c,
      roughness: 0.28,
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.75,
    }),

    // String line materials
    trebleLine: new THREE.LineBasicMaterial({
      color: 0x6f746f,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    }),
  };
}

/**
 * The case's finish (the bench matches): concert black, ivory white, figured
 * walnut, or gold leaf, all under a polyester clearcoat but the gilding,
 * which keeps a softer sheen. Changes `blackLacquer` in place, so everything
 * built from it follows.
 */
export const FINISHES = {
  black: { color: 0x0a0b0d, roughness: 0.2, metalness: 0, clearcoat: 1 },
  ivory: { color: 0xece4d4, roughness: 0.24, metalness: 0, clearcoat: 1 },
  walnut: { color: 0xffffff, roughness: 0.26, metalness: 0, clearcoat: 1 },
  // Not fully metallic: in the dim hall pure metal only shows what it
  // mirrors; a little diffuse lets the stage light warm the gilding.
  gold: { color: 0xe2b85a, roughness: 0.3, metalness: 0.75, clearcoat: 0.4 },
};
export function setFinish(mats, name) {
  const finish = FINISHES[name] ?? FINISHES.black;
  const lacquer = mats.blackLacquer;
  const map =
    name === "walnut"
      ? (mats.burlWalnut ??= createBurlWalnutTexture(mats.maxAniso))
      : null;
  if (lacquer.map !== map) {
    lacquer.map = map;
    lacquer.needsUpdate = true;
  }
  lacquer.color.set(finish.color);
  lacquer.roughness = finish.roughness;
  lacquer.metalness = finish.metalness;
  lacquer.clearcoat = finish.clearcoat;
}

/**
 * Burl walnut veneer, as on a fine case: swirling, eyed figure in warm
 * browns, with no grain direction (the case's faces are mapped every which
 * way, so straight grain would run wrong on half of them). Domain-warped
 * value noise, periodic so it tiles without a seam, at a scale of a few
 * features per hand's breadth (the case's UVs are in scene units).
 */
export function createBurlWalnutTexture(maxAniso) {
  const SIZE = 512;
  const CELLS = 6; // lattice cells across the tile, at the first octave
  // Each octave's lattice of random values, wrapped at its period: tiles.
  const lattices = new Map();
  const lattice = (period, o) => {
    const key = period * 100 + o;
    if (!lattices.has(key)) {
      const values = new Float32Array(period * period);
      for (let i = 0; i < values.length; i++) {
        const h = Math.sin(i * 127.1 + o * 311.7) * 43758.5453;
        values[i] = h - Math.floor(h);
      }
      lattices.set(key, values);
    }
    return lattices.get(key);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, period, o) => {
    const values = lattice(period, o);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const x0 = ((ix % period) + period) % period;
    const y0 = ((iy % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = ((y0 + 1) % period) * period;
    const r0 = y0 * period;
    const a = values[r0 + x0] + (values[r0 + x1] - values[r0 + x0]) * fx;
    const b = values[y1 + x0] + (values[y1 + x1] - values[y1 + x0]) * fx;
    return a + (b - a) * fy;
  };
  const fbm = (x, y, seed) => {
    let sum = 0;
    let amp = 0.5;
    for (let o = 0; o < 4; o++) {
      const k = 2 ** o;
      sum += amp * noise(x * k, y * k, CELLS * k, o + seed);
      amp /= 2;
    }
    return sum;
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d");
  const image = g.createImageData(SIZE, SIZE);
  const dark = [52, 30, 17];
  const mid = [112, 70, 40];
  const light = [168, 112, 64];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * CELLS;
      const v = (y / SIZE) * CELLS;
      // Warp the coordinates by noise, twice: the swirls of burl.
      const qx = fbm(u, v, 1);
      const qy = fbm(u, v, 7);
      const n = fbm(u + 2.2 * qx, v + 2.2 * qy, 13);
      // Close contour lines round the warped hills: the figure…
      const figure = Math.abs(Math.sin(n * 34));
      // …and the small dark eyes of a burl, where the noise peaks.
      const eye = Math.max(0, (fbm(u * 3, v * 3, 21) - 0.72) * 5);
      let t = 0.35 + 0.5 * (n - 0.5) * 2 + 0.25 * figure ** 0.5;
      t = Math.min(1, Math.max(0, t - eye));
      const [a, b, k] = t < 0.5 ? [dark, mid, t * 2] : [mid, light, t * 2 - 1];
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = a[c] + (b[c] - a[c]) * k;
      image.data[i + 3] = 255;
    }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.22, 0.22);
  texture.anisotropy = maxAniso;
  return texture;
}
