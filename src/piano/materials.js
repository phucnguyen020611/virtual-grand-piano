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
      g.fillStyle = "#3b2116";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 170; i++) {
        const y = Math.random() * h,
          a = 0.05 + Math.random() * 0.11;
        g.strokeStyle = `rgba(238,180,105,${a})`;
        g.lineWidth = 0.5 + Math.random() * 2;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x < w; x += 28)
          g.lineTo(
            x,
            y + Math.sin(x * 0.018 + i) * 2 + Math.sin(x * 0.003 + i) * 5,
          );
        g.stroke();
      }
      for (let x = 0; x < w; x += 128) {
        g.fillStyle = "rgba(0,0,0,.18)";
        g.fillRect(x, 0, 2, h);
      }
    },
    1400,
    800,
    maxAniso,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 1.4);
  return tex;
}

export function createSpruceTexture(maxAniso) {
  const tex = makeCanvasTexture(
    (g, w, h) => {
      g.fillStyle = "#d7ab63";
      g.fillRect(0, 0, w, h);
      // Fine vertical spruce grain running along the soundboard.
      for (let x = 0; x < w; x += 3) {
        const a = 0.04 + Math.random() * 0.06;
        g.strokeStyle = `rgba(120,78,34,${a})`;
        g.lineWidth = 0.8 + Math.random() * 1.2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + Math.sin(x * 0.02) * 3, h);
        g.stroke();
      }
    },
    1024,
    1024,
    maxAniso,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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

  return {
    woodTex,
    spruceTex,
    maxAniso,

    // Case / exterior
    blackLacquer: new THREE.MeshPhysicalMaterial({
      color: 0x060607,
      metalness: 0.16,
      roughness: 0.055,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
    }),
    blackSatin: new THREE.MeshStandardMaterial({
      color: 0x0d0d0e,
      metalness: 0.15,
      roughness: 0.28,
    }),
    innerCase: new THREE.MeshStandardMaterial({
      color: 0x161311,
      metalness: 0.1,
      roughness: 0.5,
    }),

    // Metals
    gold: new THREE.MeshStandardMaterial({
      color: 0xc69948,
      metalness: 0.82,
      roughness: 0.24,
    }),
    plateGold: new THREE.MeshStandardMaterial({
      color: 0xb98f42,
      metalness: 0.7,
      roughness: 0.36,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: 0x8b6333,
      metalness: 0.72,
      roughness: 0.32,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0xc9c9c2,
      metalness: 0.9,
      roughness: 0.21,
    }),
    copper: new THREE.MeshStandardMaterial({
      color: 0xb06a33,
      metalness: 0.78,
      roughness: 0.34,
    }),

    // Timber
    maple: new THREE.MeshStandardMaterial({ color: 0xa87945, roughness: 0.45 }),
    spruce: new THREE.MeshStandardMaterial({
      color: 0xd8b070,
      roughness: 0.58,
      map: spruceTex,
    }),
    bridge: new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.5 }),

    // Felt / keytops
    felt: new THREE.MeshStandardMaterial({ color: 0x5a1115, roughness: 0.93 }),
    hammerFelt: new THREE.MeshStandardMaterial({
      color: 0xd8c8a8,
      roughness: 0.88,
    }),
    ivory: new THREE.MeshPhysicalMaterial({
      color: 0xf1eee2,
      roughness: 0.28,
      clearcoat: 0.22,
      clearcoatRoughness: 0.18,
    }),
    ebony: new THREE.MeshPhysicalMaterial({
      color: 0x070708,
      roughness: 0.18,
      clearcoat: 0.62,
      clearcoatRoughness: 0.08,
    }),

    // String line materials
    trebleLine: new THREE.LineBasicMaterial({ color: 0xd7d4c9 }),
  };
}
