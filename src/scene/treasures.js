import * as THREE from "three";

/**
 * Eight keepsakes of the composers whose portraits hang in the hall, left
 * about the hall and the salon for the treasure hunt (see hunt.js). Each is
 * a small model, a little larger than life so a child can spot it, with a
 * twinkle above it while it waits to be found.
 */
const porcelain = new THREE.MeshStandardMaterial({
  color: 0xf6f1e7,
  roughness: 0.25,
});
const gilt = new THREE.MeshStandardMaterial({
  color: 0xd6a94a,
  metalness: 1,
  roughness: 0.3,
});
const silver = new THREE.MeshStandardMaterial({
  color: 0xd8dde3,
  metalness: 1,
  roughness: 0.22,
});
const brass = new THREE.MeshStandardMaterial({
  color: 0xb98c3c,
  metalness: 1,
  roughness: 0.35,
  side: THREE.DoubleSide,
});
const ebony = new THREE.MeshStandardMaterial({
  color: 0x1c1410,
  roughness: 0.35,
});
const kid = new THREE.MeshStandardMaterial({
  color: 0xf4f0e8,
  roughness: 0.8,
});
const moonlight = new THREE.MeshStandardMaterial({
  color: 0xf2e3a6,
  emissive: 0xffe9a8,
  emissiveIntensity: 0.6,
  roughness: 0.5,
});

const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const lathe = (points, material, segments = 28) =>
  mesh(
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(r, y)),
      segments,
    ),
    material,
  );

/** Bach's coffee cup, on its saucer (he wrote a cantata about coffee). */
function coffeeCup() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [
        [0, 0.02],
        [0.75, 0.02],
        [0.82, 0.07],
        [0.78, 0.1],
        [0, 0.08],
      ],
      porcelain,
    ),
    lathe(
      [
        [0.001, 0.1],
        [0.28, 0.1],
        [0.42, 0.22],
        [0.5, 0.75],
        [0.47, 0.75],
        [0.39, 0.25],
        [0.001, 0.2],
      ],
      porcelain,
    ),
    lathe(
      [
        [0.47, 0.72],
        [0.51, 0.72],
        [0.51, 0.77],
        [0.47, 0.77],
      ],
      gilt,
    ),
    // Coffee, nearly to the brim.
    mesh(
      new THREE.CircleGeometry(0.44, 24).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2a160c, roughness: 0.15 }),
      0,
      0.66,
    ),
  );
  const handle = mesh(
    new THREE.TorusGeometry(0.17, 0.045, 8, 16, Math.PI * 1.3),
    porcelain,
    0.55,
    0.45,
  );
  handle.rotation.z = -Math.PI * 0.65;
  g.add(handle);
  return g;
}

/** Haydn's pocket watch (his "Clock" symphony), lying open. */
function pocketWatch() {
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 32), gilt, 0, 0.08),
    mesh(
      new THREE.CircleGeometry(0.54, 32).rotateX(-Math.PI / 2),
      porcelain,
      0,
      0.165,
    ),
    mesh(new THREE.BoxGeometry(0.035, 0.02, 0.38), ebony, 0, 0.18, -0.15),
    mesh(new THREE.BoxGeometry(0.03, 0.02, 0.26), ebony, 0.09, 0.18, 0.06),
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12), gilt, 0, 0.08, -0.7),
  );
  const bow = mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), gilt, 0, 0.08);
  bow.position.z = -0.92;
  bow.rotation.x = Math.PI / 2;
  g.add(bow);
  // Hour marks.
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    g.add(
      mesh(
        new THREE.BoxGeometry(0.03, 0.01, h % 3 ? 0.05 : 0.1),
        ebony,
        Math.sin(a) * 0.45,
        0.172,
        -Math.cos(a) * 0.45,
      ).rotateY(-a),
    );
  }
  return g;
}

/** Mozart's magic flute: ebony with silver keys, lying down. */
function magicFlute() {
  const g = new THREE.Group();
  const body = mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 3.2, 16).rotateZ(Math.PI / 2),
    ebony,
    0,
    0.12,
  );
  g.add(body);
  for (const x of [-1.45, -0.5, 0.45, 1.45])
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.135, 0.135, 0.08, 16).rotateZ(Math.PI / 2),
        silver,
        x,
        0.12,
      ),
    );
  for (let i = 0; i < 6; i++)
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10),
        silver,
        -0.1 + i * 0.22,
        0.23,
      ),
    );
  // The mouthpiece's embouchure plate.
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.14), silver, -1.15, 0.22));
  return g;
}

/** Beethoven's brass ear trumpet, lying on its side. */
function earTrumpet() {
  const horn = lathe(
    [
      [0.06, 0],
      [0.07, 0.8],
      [0.11, 1.3],
      [0.22, 1.7],
      [0.42, 1.95],
      [0.62, 2.05],
    ],
    brass,
  );
  horn.rotation.z = Math.PI / 2;
  horn.position.set(1, 0.62, 0);
  const g = new THREE.Group();
  g.add(horn);
  // The earpiece, bent toward the ear.
  const ear = mesh(
    new THREE.TorusGeometry(0.25, 0.06, 8, 16, Math.PI / 2),
    brass,
    1.0,
    0.37,
  );
  ear.rotation.z = Math.PI / 2;
  g.add(ear);
  return g;
}

/** Schubert's round spectacles (he slept in them, it is said). */
function spectacles() {
  const g = new THREE.Group();
  const lens = new THREE.MeshStandardMaterial({
    color: 0xddeeff,
    transparent: true,
    opacity: 0.25,
    roughness: 0.05,
  });
  for (const x of [-0.36, 0.36]) {
    const rim = mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 28), silver, x);
    const glass = mesh(new THREE.CircleGeometry(0.27, 24), lens, x);
    g.add(rim, glass);
  }
  const bridge = mesh(
    new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI),
    silver,
    0,
    0.04,
  );
  g.add(bridge);
  for (const x of [-0.64, 0.64]) {
    const arm = mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6).rotateX(Math.PI / 2),
      silver,
      x,
      0,
      -0.45,
    );
    g.add(arm);
  }
  // Folded flat on the floor, lenses up.
  g.rotation.x = -Math.PI / 2 + 0.25;
  g.position.y = 0.32;
  const holder = new THREE.Group();
  holder.add(g);
  holder.scale.setScalar(1.3); // small things are hard to spot
  return holder;
}

/** Chopin's little porcelain dog (the "Minute" Waltz chased its tail). */
function littleDog() {
  const g = new THREE.Group();
  const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = mesh(new THREE.SphereGeometry(r, 18, 14), porcelain, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  g.add(
    ball(0.38, 0, 0.55, 0, 1.45, 0.9, 1), // body
    ball(0.27, 0.55, 0.92, 0), // head
    ball(0.13, 0.82, 0.86, 0, 1.2, 0.8, 0.9), // muzzle
    ball(0.1, 0.5, 1.12, 0.17, 0.6, 1.5, 0.6), // ears
    ball(0.1, 0.5, 1.12, -0.17, 0.6, 1.5, 0.6),
    mesh(new THREE.SphereGeometry(0.045, 8, 6), ebony, 0.95, 0.9, 0), // nose
  );
  for (const [x, z] of [
    [0.32, 0.17],
    [0.32, -0.17],
    [-0.32, 0.17],
    [-0.32, -0.17],
  ])
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.4, 10),
        porcelain,
        x,
        0.2,
        z,
      ),
    );
  // A curled tail, still chasing itself.
  const tail = mesh(
    new THREE.TorusGeometry(0.14, 0.045, 8, 16, Math.PI * 1.5),
    porcelain,
    -0.6,
    0.75,
  );
  g.add(tail);
  g.add(
    mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.06, 28), gilt, 0, 0.03, 0),
  );
  return g;
}

/** Liszt's white kid gloves, dropped as he sat to play. */
function gloves() {
  const outline = () => {
    const s = new THREE.Shape();
    s.moveTo(-0.28, 0);
    s.lineTo(0.28, 0);
    s.lineTo(0.3, 0.55);
    // Four fingers, then the thumb.
    const fingers = [
      [0.21, 0.55, 0.45],
      [0.07, 0.62, 0.52],
      [-0.07, 0.6, 0.5],
      [-0.21, 0.52, 0.38],
    ];
    for (const [x, base, length] of fingers) {
      s.lineTo(x + 0.06, base);
      s.lineTo(x + 0.06, base + length);
      s.absarc(x, base + length, 0.06, 0, Math.PI, false);
      s.lineTo(x - 0.06, base);
    }
    s.lineTo(-0.3, 0.45);
    s.lineTo(-0.48, 0.62);
    s.absarc(-0.5, 0.56, 0.06, Math.PI * 0.3, Math.PI * 1.3, false);
    s.lineTo(-0.3, 0.25);
    s.lineTo(-0.28, 0);
    return s;
  };
  const geometry = new THREE.ExtrudeGeometry(outline(), {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  }).rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  const a = mesh(geometry, kid, -0.3, 0.06, 0.4);
  a.rotation.y = 0.5;
  const b = mesh(geometry, kid, 0.35, 0.16, 0.2);
  b.rotation.y = -0.4;
  b.scale.x = -1; // the right hand
  g.add(a, b);
  return g;
}

/** Debussy's crescent moon ("Clair de lune"), come down to rest. */
function crescentMoon() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.8, Math.PI * 0.5, Math.PI * 1.5, false);
  s.absarc(0.32, 0, 0.86, Math.PI * 1.37, Math.PI * 0.63, true);
  const moon = mesh(
    new THREE.ExtrudeGeometry(s, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 3,
    }),
    moonlight,
    0,
    0.82,
  );
  moon.rotation.z = -0.35;
  const g = new THREE.Group();
  g.add(moon, mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 20), gilt));
  return g;
}

/** A soft star of light that breathes above an unfound keepsake. */
let sparkleTexture = null;
function sparkle() {
  sparkleTexture ??= (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,246,214,1)");
    glow.addColorStop(0.25, "rgba(255,224,150,0.55)");
    glow.addColorStop(1, "rgba(255,210,120,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,250,230,0.9)";
    g.fillRect(31, 4, 2, 56);
    g.fillRect(4, 31, 56, 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sparkleTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.scale.setScalar(1.6);
  return s;
}

export const TREASURES = {
  bach: coffeeCup,
  haydn: pocketWatch,
  mozart: magicFlute,
  beethoven: earTrumpet,
  schubert: spectacles,
  chopin: littleDog,
  liszt: gloves,
  debussy: crescentMoon,
};

/** The keepsake of `composer`, with its sparkle `height` above it. */
export function buildTreasure(composer, height = 1.6) {
  const group = new THREE.Group();
  group.name = `treasure-${composer}`;
  const model = TREASURES[composer]();
  const glint = sparkle();
  glint.position.y = height;
  group.add(model, glint);
  group.userData = { composer, glint };
  return group;
}
