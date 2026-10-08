import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * The foyer behind the exit doors, where a visit begins: a marble-floored
 * antechamber in ivory and gold, crimson damask panels between candle
 * sconces, a royal runner to the doors and two torchères flanking them. The
 * doorway wears a grand doorcase: pilasters, an entablature and a segmental
 * pediment under a crowned cartouche. The two leaves (white and gold, in the
 * manner of Versailles) swing open into the foyer, and the hall's light
 * spills out across the floor through the widening gap.
 *
 * Built in hall coordinates: the hall's rear wall stands at z = backZ, the
 * foyer runs on toward +z.
 */

export const DOOR = { width: 8, height: 11.5 };
const HALF = 11; // the foyer's half width
const DEPTH = 25;
const HEIGHT = 17;
const REVEAL = 0.8; // the wall's thickness at the doorway
const SWING = 1.5; // how far the leaves open (rad)

const soup = (parts) =>
  mergeGeometries(
    parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute("uv");
      return flat;
    }),
  );
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A raised moulding round a w × h panel centred at (x, y), facing ±z. */
const frame = (x, y, w, h, z, t = 0.09) => [
  box(w + t, t, t, x, y + h / 2, z),
  box(w + t, t, t, x, y - h / 2, z),
  box(t, h, t, x + w / 2, y, z),
  box(t, h, t, x - w / 2, y, z),
];

/** Lamps for the royal interior to light: [x, y, z] sconces on the side
 *  walls, [x, y, z, r, round] globes on the torchères. */
export function foyerLamps(backZ, floorY) {
  const z0 = backZ + REVEAL;
  return {
    sconces: [-1, 1].flatMap((s) =>
      [8.5, 16.5].map((dz) => [s * HALF, floorY + 7.5, z0 + dz]),
    ),
    bulbs: [-1, 1].map((s) => [s * 6.6, floorY + 8.9, z0 + 1.7, 0.42, true]),
  };
}

/** Polished marble laid on the diagonal: ivory and rosso squares, veined. */
function marbleTexture(aniso) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const g = canvas.getContext("2d");
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? "#5e2620" : "#e9e0cf";
      g.fillRect(i * 256, j * 256, 256, 256);
    }
  for (let k = 0; k < 60; k++) {
    const x = rand() * 512;
    const y = rand() * 512;
    g.strokeStyle = `rgba(${rand() < 0.5 ? "120,110,100" : "250,240,225"},${0.08 + rand() * 0.18})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(
      x + (rand() - 0.5) * 200,
      y + (rand() - 0.5) * 200,
      x + (rand() - 0.5) * 300,
      y + (rand() - 0.5) * 300,
      x + (rand() - 0.5) * 400,
      y + (rand() - 0.5) * 400,
    );
    g.stroke();
  }
  // A fine joint between the squares.
  g.strokeStyle = "rgba(40,30,25,0.5)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  g.strokeRect(256, 256, 256, 256);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso;
  map.center.set(0.5, 0.5);
  map.rotation = Math.PI / 4;
  return map;
}

/**
 * One leaf of the doors, hinged at its own origin and reaching toward −s·x:
 * white lacquer, gilt mouldings on both faces (a tall upper panel, an oval
 * medallion, a lower panel, rosettes), a tall gilt pull by the meeting stile.
 */
function leaf(s, ivory, gilt) {
  const W = DOOR.width / 2 - 0.02;
  const H = DOOR.height - 0.05;
  const T = 0.24;
  const cx = -s * (W / 2);
  const trim = [];
  for (const f of [-1, 1]) {
    const z = f * (T / 2 + 0.03);
    trim.push(
      ...frame(cx, H * 0.675, W - 1.0, H * 0.47, z),
      ...frame(cx, H * 0.675, W - 1.5, H * 0.47 - 0.5, z, 0.06),
      ...frame(cx, H * 0.19, W - 1.0, H * 0.24, z),
      ...frame(cx, H * 0.19, W - 1.5, H * 0.24 - 0.5, z, 0.06),
      new THREE.TorusGeometry(0.5, 0.06, 6, 28)
        .scale(1, 0.72, 1)
        .translate(cx, H * 0.375, z), // centred in the gap between the panels
      new THREE.SphereGeometry(0.16, 10, 8)
        .scale(1, 1, 0.5)
        .translate(cx, H * 0.375, z), // centred in the gap between the panels
      ...[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([a, b]) =>
        new THREE.SphereGeometry(0.11, 8, 6).translate(
          cx + a * ((W - 1.0) / 2),
          H * 0.675 + b * (H * 0.235),
          z,
        ),
      ),
      // The pull: a gilt bar on two stand-offs, a ball at each end.
      new THREE.CylinderGeometry(0.055, 0.055, 1.7, 10).translate(
        -s * (W - 0.4),
        H * 0.45,
        f * (T / 2 + 0.2),
      ),
      ...[-0.7, 0.7].flatMap((dy) => [
        box(0.09, 0.09, 0.2, -s * (W - 0.4), H * 0.45 + dy, f * (T / 2 + 0.1)),
        new THREE.SphereGeometry(0.09, 8, 6).translate(
          -s * (W - 0.4),
          H * 0.45 + dy * 1.27,
          f * (T / 2 + 0.2),
        ),
      ]),
    );
  }
  if (s > 0) trim.push(box(0.1, H, T + 0.06, -s * W, H / 2, 0)); // astragal
  const pivot = new THREE.Group();
  pivot.add(
    new THREE.Mesh(box(W, H, T, cx, H / 2, 0), ivory),
    new THREE.Mesh(soup(trim), gilt),
  );
  return pivot;
}

/** The light from the hall, out through the doors: additive, fading with
 *  distance and to either edge. */
function spillMaterial(strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      open: { value: 0 },
      color: { value: new THREE.Color(1.0, 0.74, 0.44) },
      strength: { value: strength },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float open;
      uniform vec3 color;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float across = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
        float along = pow(1.0 - vUv.y, 1.7);
        gl_FragColor = vec4(color * strength * open * across * along, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
/** Quads from the doorway edge (v = 0) to the far edge (v = 1). */
function quads(list) {
  const pos = [];
  const uv = [];
  for (const [a, b, c, d] of list) {
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    uv.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * @param room { backZ, floorY, gilt, aniso, plaster(w, h), damask(w, h),
 *   runner: { geometry(profile, half), material } }
 */
export function buildFoyer(hall, room) {
  const { backZ, floorY: F, gilt, aniso } = room;
  const z0 = backZ + REVEAL; // the foyer side of the doorway
  const z1 = z0 + DEPTH;
  const mid = (z0 + z1) / 2;
  const w = DOOR.width;
  const h = DOOR.height;
  const group = new THREE.Group();
  group.name = "foyer";
  hall.add(group);
  const add = (geometry, material, name) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = `foyer-${name}`;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const ivory = new THREE.MeshStandardMaterial({
    color: 0xf1e8d6,
    roughness: 0.35,
  });
  const marble = marbleTexture(aniso);
  marble.repeat.set((2 * HALF) / 5.2, (DEPTH + REVEAL) / 5.2);
  add(
    new THREE.PlaneGeometry(2 * HALF, DEPTH + REVEAL)
      .rotateX(-Math.PI / 2)
      .translate(0, F, (backZ + z1) / 2),
    new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18 }),
    "floor",
  );
  add(
    room.runner.geometry(
      [
        [F, backZ - 0.01],
        [F, z1 - 2],
      ],
      2.1,
    ),
    room.runner.material,
    "runner",
  );
  add(
    new THREE.PlaneGeometry(2 * HALF, DEPTH)
      .rotateX(Math.PI / 2)
      .translate(0, F + HEIGHT, mid),
    room.plaster(2 * HALF, DEPTH),
    "ceiling",
  );

  // The walls: the doorway's wall with its opening, the sides, the far end.
  const shape = new THREE.Shape()
    .moveTo(-HALF, 0)
    .lineTo(HALF, 0)
    .lineTo(HALF, HEIGHT)
    .lineTo(-HALF, HEIGHT)
    .closePath();
  shape.holes.push(
    new THREE.Path()
      .moveTo(-w / 2, 0)
      .lineTo(-w / 2, h)
      .lineTo(w / 2, h)
      .lineTo(w / 2, 0)
      .closePath(),
  );
  const front = new THREE.ShapeGeometry(shape);
  const uv = front.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getX(i) + HALF) / (2 * HALF), uv.getY(i) / HEIGHT);
  add(front.translate(0, F, z0), room.plaster(2 * HALF, HEIGHT), "front-wall");
  for (const s of [-1, 1])
    add(
      new THREE.PlaneGeometry(DEPTH, HEIGHT)
        .rotateY(-s * (Math.PI / 2))
        .translate(s * HALF, F + HEIGHT / 2, mid),
      room.plaster(DEPTH, HEIGHT),
      "side-wall",
    );
  add(
    new THREE.PlaneGeometry(2 * HALF, HEIGHT)
      .rotateY(Math.PI)
      .translate(0, F + HEIGHT / 2, z1),
    room.plaster(2 * HALF, HEIGHT),
    "end-wall",
  );

  // Crimson damask panels in gilt frames down each side, a gilt dado rail
  // and skirting, a gilt cornice all round, coffers overhead.
  const panels = [];
  const giltParts = [];
  for (const s of [-1, 1])
    for (const dz of [4.5, 12.5, 20.5]) {
      const x = s * (HALF - 0.02);
      panels.push(
        new THREE.PlaneGeometry(5, 9)
          .rotateY(-s * (Math.PI / 2))
          .translate(x, F + 7.2, z0 + dz),
      );
      giltParts.push(
        ...frame(0, 0, 5, 9, 0, 0.16).map((g) =>
          g
            .rotateY(-s * (Math.PI / 2))
            .translate(s * (HALF - 0.08), F + 7.2, z0 + dz),
        ),
      );
    }
  add(
    mergeGeometries(panels.map((g) => g.toNonIndexed())),
    room.damask(5, 9),
    "damask",
  );
  for (const s of [-1, 1]) {
    giltParts.push(
      box(0.12, 0.14, DEPTH, s * (HALF - 0.06), F + 2.2, mid),
      box(0.2, 0.5, DEPTH, s * (HALF - 0.1), F + 0.25, mid),
      box(0.5, 0.5, DEPTH, s * (HALF - 0.25), F + HEIGHT - 0.25, mid),
    );
  }
  giltParts.push(
    box(2 * HALF, 0.5, 0.5, 0, F + HEIGHT - 0.25, z0 + 0.25),
    box(2 * HALF, 0.5, 0.5, 0, F + HEIGHT - 0.25, z1 - 0.25),
    box(2 * HALF, 0.5, 0.2, 0, F + 0.25, z1 - 0.1),
  );
  for (let x = -HALF + 5.5; x < HALF; x += 5.5)
    giltParts.push(box(0.18, 0.18, DEPTH, x, F + HEIGHT - 0.09, mid));
  for (let z = z0 + 5; z < z1; z += 5)
    giltParts.push(box(2 * HALF, 0.18, 0.18, 0, F + HEIGHT - 0.09, z));

  // The doorway: its reveal through the wall, an architrave, pilasters with
  // gilt bases, flutes and capitals, the entablature, a segmental pediment,
  // and the crowned cartouche above.
  const stone = [
    box(
      0.3,
      h + 0.3,
      REVEAL,
      -(w / 2 + 0.15),
      F + (h + 0.3) / 2,
      backZ + REVEAL / 2,
    ),
    box(
      0.3,
      h + 0.3,
      REVEAL,
      w / 2 + 0.15,
      F + (h + 0.3) / 2,
      backZ + REVEAL / 2,
    ),
    box(w + 0.6, 0.3, REVEAL, 0, F + h + 0.15, backZ + REVEAL / 2),
    // Frieze.
    box(w + 3.6, 1.2, 0.45, 0, F + h + 1.6, z0 + 0.22),
  ];
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 0.95);
    stone.push(box(1.1, h + 1, 0.4, x, F + (h + 1) / 2, z0 + 0.2));
    giltParts.push(
      box(1.4, 0.8, 0.6, x, F + 0.4, z0 + 0.3), // base
      box(1.5, 0.55, 0.62, x, F + h + 0.72, z0 + 0.31), // capital
      ...[-0.3, 0, 0.3].map((dx) =>
        box(
          0.07,
          h - 1.6,
          0.06,
          x + dx,
          F + 0.8 + (h - 1.6) / 2 + 0.1,
          z0 + 0.42,
        ),
      ),
      // The architrave round the opening.
      box(
        0.32,
        h + 0.32,
        0.22,
        s * (w / 2 + 0.16),
        F + (h + 0.32) / 2,
        z0 + 0.11,
      ),
    );
  }
  giltParts.push(
    box(w + 0.64, 0.32, 0.22, 0, F + h + 0.16, z0 + 0.11),
    box(w + 3.8, 0.22, 0.55, 0, F + h + 0.95, z0 + 0.27), // frieze's foot
    box(w + 4.4, 0.45, 0.85, 0, F + h + 2.42, z0 + 0.42), // cornice
  );
  // The pediment: an arc of gilt over the cornice (chord 12.4, rise 1.9).
  const chord = w + 4.4;
  const rise = 1.9;
  const R = (chord * chord) / 4 / (2 * rise) + rise / 2;
  const arc = 2 * Math.asin(chord / 2 / R);
  giltParts.push(
    new THREE.TorusGeometry(R, 0.24, 6, 40, arc)
      .rotateZ(Math.PI / 2 - arc / 2)
      .scale(1, 1, 1.6)
      .translate(0, F + h + 2.65 - R + rise, z0 + 0.42),
  );
  // The cartouche, an oval shield, and a crown above it.
  const cy = F + h + 3.5;
  giltParts.push(
    new THREE.TorusGeometry(0.95, 0.13, 8, 32)
      .scale(0.78, 1, 1)
      .translate(0, cy, z0 + 0.7),
    // The crown: a band, five points with pearls, arches to an orb.
    new THREE.CylinderGeometry(0.62, 0.55, 0.36, 20, 1, true).translate(
      0,
      cy + 1.35,
      z0 + 0.7,
    ),
    new THREE.TorusGeometry(0.6, 0.06, 6, 24)
      .rotateX(Math.PI / 2)
      .translate(0, cy + 1.18, z0 + 0.7),
    ...Array.from({ length: 5 }, (_, k) => {
      const a = ((k - 2) / 4) * Math.PI * 0.9 - Math.PI / 2;
      const [x, z] = [Math.cos(a) * 0.6, z0 + 0.7 + Math.sin(a) * 0.6];
      return [
        new THREE.ConeGeometry(0.1, 0.42, 6).translate(x, cy + 1.72, z),
        new THREE.SphereGeometry(0.08, 8, 6).translate(x, cy + 1.97, z),
      ];
    }).flat(),
    ...[-1, 1].map((s) =>
      new THREE.TorusGeometry(0.55, 0.05, 6, 16, Math.PI / 2)
        .rotateZ(s > 0 ? 0 : Math.PI / 2)
        .translate(0, cy + 1.52, z0 + 0.7),
    ),
    new THREE.SphereGeometry(0.17, 12, 10).translate(0, cy + 2.17, z0 + 0.7),
    box(0.06, 0.34, 0.06, 0, cy + 2.45, z0 + 0.7),
    box(0.22, 0.06, 0.06, 0, cy + 2.48, z0 + 0.7),
  );
  add(soup(stone), ivory, "doorcase");
  // The cartouche's field: crimson enamel.
  add(
    new THREE.CircleGeometry(0.9, 28)
      .scale(0.78, 1, 1)
      .translate(0, cy, z0 + 0.66),
    new THREE.MeshStandardMaterial({ color: 0x7a1424, roughness: 0.35 }),
    "cartouche",
  );

  // Two torchères flanking the doors, each a gilt column bearing a globe.
  for (const s of [-1, 1]) {
    const [x, z] = [s * 6.6, z0 + 1.7];
    giltParts.push(
      new THREE.CylinderGeometry(0.75, 0.9, 0.35, 16).translate(x, F + 0.18, z),
      new THREE.LatheGeometry(
        [
          [0.45, 0],
          [0.22, 0.5],
          [0.16, 2.5],
          [0.24, 4.5],
          [0.14, 6.8],
          [0.3, 7.6],
          [0.5, 8.1],
          [0.2, 8.3],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        14,
      ).translate(x, F + 0.35, z),
    );
  }
  add(soup(giltParts), gilt, "gilt");

  // The doors.
  const leaves = [-1, 1].map((s) => {
    const pivot = leaf(s, ivory, gilt);
    pivot.position.set(s * (w / 2 - 0.02), F + 0.03, z0 - 0.13);
    pivot.userData.side = s;
    group.add(pivot);
    return pivot;
  });

  // The hall's light through the opening: a pool across the marble and a
  // faint shaft in the air, both widening as the doors part.
  const poolMaterial = spillMaterial(0.55);
  const pool = add(
    quads([
      [
        [-w / 2, F + 0.03, z0],
        [w / 2, F + 0.03, z0],
        [-w / 2 - 3.5, F + 0.03, z0 + 15],
        [w / 2 + 3.5, F + 0.03, z0 + 15],
      ],
    ]),
    poolMaterial,
    "spill-pool",
  );
  const shaftMaterial = spillMaterial(0.07);
  const [a, b] = [
    [-w / 2, F + h, z0],
    [w / 2, F + h, z0],
  ];
  const [c, d] = [
    [-w / 2, F, z0],
    [w / 2, F, z0],
  ];
  const far = (p, dx, y) => [p[0] + Math.sign(p[0]) * dx, y, z0 + 13];
  const shaft = add(
    quads([
      [a, b, far(a, 2.5, F + 4), far(b, 2.5, F + 4)], // the top
      [c, a, far(c, 2.5, F), far(a, 2.5, F + 4)], // the sides
      [d, b, far(d, 2.5, F), far(b, 2.5, F + 4)],
    ]),
    shaftMaterial,
    "spill-shaft",
  );
  pool.renderOrder = shaft.renderOrder = 5;
  pool.visible = shaft.visible = false;

  // Candlelight in the foyer, and the hall's light spilling out once open.
  // Both are put away once the visitor is inside, the pair together, so
  // the hall's every pixel stops paying for them (in one shader change,
  // compiled ahead at the welcome card: see main.js).
  const lamp = new THREE.PointLight(0xffd2a0, 0, 40, 2);
  lamp.position.set(0, F + 13, z0 + 12);
  const spill = new THREE.PointLight(0xffc88c, 0, 34, 2);
  spill.position.set(0, F + 8, backZ - 3);
  group.add(lamp, spill);
  let lit = false;
  let open = 0;
  const show = () => (lamp.visible = spill.visible = lit || open > 0.001);

  return {
    /** Where a visit starts: before the closed doors. */
    start: {
      position: new THREE.Vector3(0, F + 6.2, z1 - 3),
      target: new THREE.Vector3(0, F + 8.6, backZ),
    },
    /** How open the doors are: 0 = shut, 1 = open wide. */
    get doors() {
      return open;
    },
    /** 0 = shut, 1 = open wide. */
    setDoors(e) {
      for (const pivot of leaves)
        pivot.rotation.y = pivot.userData.side * SWING * e;
      poolMaterial.uniforms.open.value = shaftMaterial.uniforms.open.value = e;
      pool.visible = shaft.visible = e > 0.001;
      pool.scale.x = shaft.scale.x = 0.15 + 0.85 * e;
      spill.intensity = 260 * e;
      open = e;
      show();
    },
    /** The foyer's candles: lit while a visitor stands there. */
    setLit(on) {
      lamp.intensity = on ? 420 : 0;
      lit = on;
      show();
    },
  };
}
