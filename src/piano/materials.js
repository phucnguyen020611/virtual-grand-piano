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

/** Two-page Für Elise score used on the music desk. */
export function createSheetTexture(maxAniso) {
  return makeCanvasTexture(
    (g, w, h) => {
      g.fillStyle = "#efe9d8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(100,75,42,.08)";
      for (let i = 0; i < 140; i++)
        g.fillRect(
          Math.random() * w,
          Math.random() * h,
          Math.random() * 2 + 1,
          Math.random() * 18 + 4,
        );
      g.fillStyle = "#2b2722";
      g.textAlign = "center";
      g.font = "26px Georgia";
      g.fillText("FÜR ELISE", w / 2, 48);
      g.font = "14px Georgia";
      g.fillText("Ludwig van Beethoven", w / 2, 72);
      g.textAlign = "left";
      for (let stave = 0; stave < 4; stave++) {
        const sy = 118 + stave * 116;
        g.lineWidth = 1.3;
        g.strokeStyle = "#3c3831";
        for (let l = 0; l < 5; l++) {
          g.beginPath();
          g.moveTo(54, sy + l * 13);
          g.lineTo(w - 54, sy + l * 13);
          g.stroke();
        }
        g.font = "50px Georgia";
        g.fillText("𝄞", 60, sy + 48);
        for (let n = 0; n < 18; n++) {
          const x = 128 + n * 43 + (stave % 2) * 8,
            y = sy + 15 + ((n * 7 + stave * 3) % 5) * 8;
          g.beginPath();
          g.ellipse(x, y, 6.5, 4.8, -0.25, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 6, y);
          g.lineTo(x + 6, y - 28);
          g.stroke();
          if (n % 5 === 0) {
            g.font = "15px Georgia";
            g.fillText(n % 10 === 0 ? "♭" : "♯", x - 18, y + 4);
          }
        }
      }
    },
    900,
    620,
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
    blackLacquer: new THREE.MeshPhysicalMaterial({
      color: 0x08090a,
      metalness: 0,
      roughness: 0.13,
      clearcoat: 0.58,
      clearcoatRoughness: 0.065,
      ior: 1.5,
      specularIntensity: 0.38,
      envMapIntensity: 0.4,
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
    plateGold: new THREE.MeshStandardMaterial({
      color: 0x514f42,
      metalness: 0.72,
      roughness: 0.62,
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
