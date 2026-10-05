import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * A court audience in about seven seats of ten, dressed as for an evening at
 * a palace in the 1770s.
 *
 * Gentlemen: velvet frock coats with deep turned-back cuffs, gilt braid and
 * buttons, brocade waistcoats, a stock and lace jabot, lace at the wrists,
 * breeches, white stockings and buckled shoes; a few officers in gold
 * epaulettes, a few knights with the blue sash and star of an order. Hair
 * powdered and rolled over the ears, or their own, always tied in a queue
 * with a black silk bow.
 *
 * Ladies: satin gowns, the bodice pointed over a brocade stomacher, lace at
 * the neckline and in tiers at the elbows, the robe open on a brocade
 * petticoat; long gloves, earrings and a necklace; a tiara or flowers in
 * hair dressed high in curls with ringlets at the temples; some hold a fan.
 *
 * Every face has a jaw, nose, ears, eyes, brows and lips; heads turn on
 * their own (a glance round the hall, toward the stage when the music plays,
 * to a neighbour while applauding), and no two figures are quite the same
 * height or build.
 *
 * Built in seat space (+y up, −z toward the stage, floor at y = 0). Each part
 * is an instanced mesh in one of four frames: the body, the head (pivoting at
 * the neck), the forearms (pivoting at the elbows) and the hands, which also
 * clap. A part may be worn by only some of a group (the `who` test).
 */

const UP = new THREE.Vector3(0, 1, 0);
const soup = (parts) =>
  mergeGeometries(
    parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute("uv"); // only the brocade parts keep their own
      return flat;
    }),
  );
const soupUv = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

/** A capsule of radius `r` from a to b, optionally scaled before aiming. */
function limb(a, b, r, scale) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const g = new THREE.CapsuleGeometry(r, from.distanceTo(to), 2, 7);
  if (scale) g.scale(...scale);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      UP,
      to.clone().sub(from).normalize(),
    ),
  );
  return g.translate(...from.add(to).multiplyScalar(0.5).toArray());
}
const ball = (r, [x, y, z], scale = [1, 1, 1], detail = [10, 7]) =>
  new THREE.SphereGeometry(r, ...detail).scale(...scale).translate(x, y, z);
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A ring of lace: a torus whose tube ripples into little frills. */
function frill(radius, tube, [x, y, z], tilt = 0, scale = [1, 1, 1]) {
  const g = new THREE.TorusGeometry(radius, tube, 3, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getY(i), p.getX(i));
    const k = 1 + 0.35 * Math.sin(a * 18);
    p.setXYZ(i, p.getX(i), p.getY(i), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g
    .rotateX(Math.PI / 2 + tilt)
    .scale(...scale)
    .translate(x, y, z);
}

// Pivots: the forearms turn at the elbows, the head on the neck.
const ELBOW = new THREE.Vector3(0, 3.25, 0.25);
const NECK = new THREE.Vector3(0, 4.55, 0.42);
const HEAD = [0, 5.05, 0.35];
const HEAD_SHAPE = [0.88, 1.08, 1];
const about = (pivot) => (g) =>
  g.translate(...pivot.clone().negate().toArray());

/** A face: cranium and jaw, ears and nose in skin; eyes, brows and lips. */
function face() {
  return {
    skin: [
      ball(0.5, HEAD, HEAD_SHAPE, [14, 10]),
      ball(1, [0, 4.8, 0.24], [0.34, 0.28, 0.36]), // jaw and chin
      new THREE.ConeGeometry(0.06, 0.18, 8)
        .rotateX(-Math.PI / 2 + 0.25)
        .translate(0, 4.98, -0.19), // nose
      ...[-1, 1].map((s) =>
        ball(1, [s * 0.44, 5.0, 0.4], [0.05, 0.12, 0.08], [8, 6]),
      ), // ears
    ],
    eyes: [-1, 1].map((s) =>
      ball(0.045, [s * 0.16, 5.12, -0.105], [1, 0.62, 0.5], [8, 6]),
    ),
    lips: [ball(1, [0, 4.83, -0.115], [0.1, 0.034, 0.045], [10, 6])],
    brows: [-1, 1].map((s) =>
      limb([s * 0.07, 5.22, -0.12], [s * 0.25, 5.25, -0.06], 0.022),
    ),
  };
}
const hairCap = (back = 0.62) =>
  new THREE.SphereGeometry(0.56, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.56)
    .rotateX(back) // the hairline sits back from the brow
    .scale(...HEAD_SHAPE)
    .translate(...HEAD);
const neck = () => limb([0, 4.15, 0.45], [0, 4.62, 0.4], 0.19);

/** Forearms and hands resting on the lap, elbows out, hands near the knees. */
const forearm = (s, r) =>
  limb([s * 0.93, 3.25, 0.25], [s * 0.32, 3.02, -0.72], r);
const WRIST = (s) => [s * 0.34, 3.03, -0.7];
const hand = (s) => ball(0.16, [s * 0.29, 2.99, -0.9], [0.62, 1, 1.3]);

function gentleman() {
  const f = face();
  const coat = [
    limb([0, 2.75, 0.4], [0, 4.15, 0.45], 0.6, [1.45, 1, 0.8]),
    ...[-1, 1].flatMap((s) => [
      ball(0.27, [s * 0.8, 4.05, 0.45]), // shoulders
      limb([s * 0.98, 4.05, 0.45], [s * 0.93, 3.25, 0.25], 0.21), // upper arm
      box(0.78, 0.12, 1.0, s * 0.42, 2.92, -0.25), // skirts over the thighs
      limb([s * 0.82, 2.85, 0.55], [s * 0.88, 1.85, 0.35], 0.16, [1, 1, 2]),
      limb([s * 0.42, 2.6, 0.2], [s * 0.42, 2.65, -1.25], 0.33), // breeches
      // Lapels turned back over the chest.
      box(0.22, 0.9, 0.06, s * 0.3, 3.75, -0.07).rotateZ(s * 0.18),
    ]),
    new THREE.TorusGeometry(0.31, 0.09, 6, 18)
      .rotateX(Math.PI / 2 - 0.15)
      .translate(0, 4.22, 0.42), // standing collar
  ];
  const linen = [
    new THREE.TorusGeometry(0.21, 0.07, 6, 16)
      .rotateX(Math.PI / 2 - 0.2)
      .translate(0, 4.32, 0.38), // the stock
    ball(1, [0, 4.02, -0.08], [0.12, 0.22, 0.06]), // jabot
    ...[-1, 1].map((s) =>
      limb([s * 0.43, 2.45, -1.3], [s * 0.45, 0.32, -1.45], 0.25),
    ), // stockings
  ];
  const gold = [
    ...[-1, 1].map((s) => box(0.05, 1.3, 0.05, s * 0.37, 3.45, -0.1)), // braid
    ...[2.95, 3.25, 3.55, 3.85].flatMap((y) => [
      ball(0.045, [0.42, y, -0.12], undefined, [5, 3]),
      ball(0.03, [0, y - 0.1, -0.13], undefined, [4, 3]), // waistcoat buttons
    ]),
    ...[-1, 1].flatMap((s) => [
      box(0.42, 0.05, 0.06, s * 0.58, 2.95, -0.04), // pocket flaps
      box(0.16, 0.05, 0.12, s * 0.45, 0.24, -1.8), // shoe buckles
    ]),
  ];
  return {
    body: {
      coat,
      waistcoat: [limb([0, 2.95, 0.14], [0, 3.95, 0.2], 0.42, [0.82, 1, 0.55])],
      linen,
      shoes: [-1, 1].map((s) => box(0.36, 0.22, 0.78, s * 0.45, 0.11, -1.65)),
      gold,
      skin: [neck()],
      // A tenth wear an order: the blue sash across the chest, its star.
      sash: {
        who: 0.1,
        parts: [box(0.18, 1.5, 0.06, 0, 3.45, -0.14).rotateZ(0.62)],
      },
      star: {
        who: 0.1,
        parts: [
          new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8)
            .rotateX(Math.PI / 2)
            .translate(-0.3, 3.7, -0.16),
        ],
      },
      // And some are officers, in fringed gold epaulettes.
      epaulettes: {
        who: 0.15,
        parts: [-1, 1].map((s) =>
          ball(0.24, [s * 0.82, 4.22, 0.45], [1, 0.4, 0.9]),
        ),
      },
    },
    head: {
      ...f,
      // Powdered and rolled twice over the ears, or their own hair.
      wig: {
        who: 0.6,
        key: 30,
        parts: [
          hairCap(),
          ...[-1, 1].flatMap((s) =>
            [5.02, 4.84].map((y) =>
              limb([s * 0.44, y, 0.12], [s * 0.44, y, 0.6], 0.11),
            ),
          ),
        ],
      },
      natural: {
        who: -0.6,
        key: 30,
        parts: [
          hairCap(0.5),
          ...[-1, 1].map((s) => ball(0.2, [s * 0.38, 5.0, 0.42], [0.6, 1, 1])),
        ],
      },
      queue: [limb([0, 4.95, 0.84], [0, 4.4, 0.95], 0.1)],
      bow: [-1, 1].map((s) =>
        new THREE.ConeGeometry(0.12, 0.26, 8)
          .rotateZ((s * Math.PI) / 2)
          .scale(1, 1, 0.4)
          .translate(s * 0.13, 4.88, 0.92),
      ),
    },
    arm: {
      coat: [-1, 1].flatMap((s) => [
        forearm(s, 0.17),
        // A deep turned-back cuff above the wrist.
        limb(
          WRIST(s).map((v, k) => v + [s * 0.12, 0.05, 0.22][k]),
          WRIST(s),
          0.24,
        ),
      ]),
      gold: [-1, 1].map((s) =>
        new THREE.TorusGeometry(0.24, 0.025, 3, 12)
          .rotateY(Math.atan2(s * 0.6, 0.97))
          .translate(...WRIST(s)),
      ),
    },
    hand: {
      skin: [hand(-1), hand(1)],
      linen: [-1, 1].map((s) => frill(0.15, 0.05, [s * 0.31, 3.0, -0.78], 1.3)),
    },
  };
}

function lady() {
  const f = face();
  return {
    body: {
      coat: [
        // The bodice, narrow at the waist and pointed below it.
        new THREE.LatheGeometry(
          [
            [0.38, 2.75],
            [0.42, 3.05],
            [0.5, 3.55],
            [0.55, 3.85],
            [0.5, 4.02],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          12,
        )
          .scale(1.2, 1, 0.82)
          .translate(0, 0, 0.42),
        // The skirt, belled over the seat and the knees to the floor.
        new THREE.LatheGeometry(
          [
            [0.45, 3.05],
            [0.66, 2.75],
            [1.05, 2.1],
            [1.3, 1.1],
            [1.42, 0.3],
            [1.46, 0.04],
            [0, 0.04],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          16,
        )
          .scale(0.7, 1, 1.25)
          .translate(0, 0, -0.55),
        ...[-1, 1].flatMap((s) => [
          ball(0.27, [s * 0.86, 3.98, 0.42], [1, 0.85, 1]), // puffed sleeve
          limb([s * 0.95, 3.85, 0.42], [s * 0.93, 3.3, 0.26], 0.18), // to the elbow
        ]),
      ],
      // The stomacher down the bodice's front, and the petticoat the robe
      // opens on.
      waistcoat: [
        new THREE.ConeGeometry(0.34, 1.15, 4, 1, true)
          .rotateY(Math.PI / 4)
          .rotateX(Math.PI)
          .scale(1, 1, 0.16)
          .translate(0, 3.42, -0.02),
        new THREE.LatheGeometry(
          [
            [0.7, 2.7],
            [1.08, 2.08],
            [1.33, 1.08],
            [1.46, 0.28],
            [1.5, 0.06],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          10,
          Math.PI - 0.55,
          1.1,
        )
          .scale(0.7, 1, 1.25)
          .translate(0, 0, -0.55),
      ],
      skin: [neck(), limb([-0.6, 4.07, 0.42], [0.6, 4.07, 0.42], 0.2)],
      linen: [
        frill(0.5, 0.05, [0, 4.02, 0.4], 0.1, [1.2, 1, 0.75]), // neckline lace
        ...[-1, 1].map((s) => frill(0.22, 0.07, [s * 0.93, 3.28, 0.26], 0.2)), // elbows
      ],
      gold: [
        new THREE.TorusGeometry(0.27, 0.03, 6, 20)
          .rotateX(Math.PI / 2 - 0.4)
          .translate(0, 4.27, 0.33), // necklace
        ball(0.06, [0, 4.1, 0.1], undefined, [8, 6]), // its pendant
      ],
    },
    head: {
      ...f,
      hair: [
        hairCap(0.5),
        // The chignon, a cluster of curls high at the back.
        ...[
          [0, 5.5, 0.62],
          [-0.16, 5.42, 0.58],
          [0.16, 5.42, 0.58],
          [0, 5.32, 0.72],
          [0, 5.66, 0.5],
        ].map((p) => ball(0.17, p, undefined, [8, 6])),
        // Ringlets falling at the temples.
        ...[-1, 1].flatMap((s) =>
          [4.95, 4.78, 4.62].map((y, k) =>
            ball(0.075, [s * (0.43 + k * 0.01), y, 0.08], undefined, [6, 4]),
          ),
        ),
      ],
      gold: [-1, 1].map((s) =>
        ball(0.04, [s * 0.45, 4.86, 0.38], [1, 1.6, 1], [6, 4]),
      ), // earrings
      tiara: {
        who: 0.35,
        key: 31,
        parts: [
          new THREE.TorusGeometry(0.4, 0.035, 6, 16, Math.PI)
            .rotateX(-0.5)
            .translate(0, 5.32, 0.18),
          ball(0.06, [0, 5.72, 0.02], undefined, [8, 6]),
        ],
      },
      flowers: {
        who: -0.35,
        key: 31,
        parts: [0.2, -0.2].map((x) => ball(0.09, [x, 5.55, 0.34])),
      },
    },
    arm: { gloves: [forearm(-1, 0.15), forearm(1, 0.15)] },
    hand: {
      gloves: [hand(-1), hand(1)],
      // A third hold a folded fan in the right hand.
      fan: {
        who: 0.3,
        parts: [box(0.08, 0.06, 0.7, 0.3, 3.05, -1.05).rotateY(-0.3)],
      },
    },
  };
}

const COATS = [
  0x1d2b5a, 0x5e1424, 0x14432f, 0x121214, 0x3b1d52, 0x1b1f3a, 0x123c44,
  0x4a1c14, 0x2b2b2e,
];
const BROCADE = [0xd8b45e, 0xece2c8, 0xd9c08a, 0xa02232, 0xc4c2bc, 0x8a7a3a];
const GOWNS = [
  0x8c1c2b, 0x213f8c, 0x1d6a48, 0xb8913d, 0xe8dcc0, 0xb0566a, 0x5a3a8a,
  0x151318, 0xcdb27a, 0x6a8ab8,
];
const SKIN = [0xf1c7a5, 0xe6b48f, 0xd29c75, 0xb07a55, 0x8a5a3c, 0x60402c];
const POWDER = [0xece8e0, 0xdcd8d0, 0xc9c4bc];
const HAIR = [0x1a130e, 0x2a1d14, 0x3a2618, 0x6a3420, 0x8a6a40, 0xc9a66b];
const GLOVES = [0xe2d8c4, 0xd8ccb4, 0xe8e0ce];
const FLOWERS = [0xc2304a, 0xf0e6d0, 0x6a3a8a, 0xe88aa0];

/** A woven damask motif in greys, tinted per figure by its instance colour. */
function brocadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#bdbdbd";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#ffffff";
  for (const [x, y] of [
    [32, 32],
    [96, 96],
    [96, 32],
    [32, 96],
  ]) {
    g.save();
    g.translate(x, y);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.ellipse(0, -12, 6, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  g.strokeStyle = "#8a8a8a";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  return map;
}

/** `seats`: [x, y, z, yaw] of every seat, facing −z. */
export function buildAudience(parent, seats) {
  const hash = (i, k) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const velvet = new THREE.MeshPhysicalMaterial({
    roughness: 0.8,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: 0x8c7c70,
  });
  const satin = new THREE.MeshPhysicalMaterial({
    roughness: 0.34,
    sheen: 0.4,
    sheenRoughness: 0.3,
    sheenColor: 0xffffff,
  });
  const brocade = new THREE.MeshStandardMaterial({
    map: brocadeTexture(),
    roughness: 0.5,
    metalness: 0.25,
  });
  const linen = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const skin = new THREE.MeshPhysicalMaterial({
    roughness: 0.62,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: 0xffc8b0,
  });
  const hair = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const plain = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const gilt = new THREE.MeshStandardMaterial({
    color: 0xd8ad55,
    metalness: 1,
    roughness: 0.3,
  });
  gilt.userData.keepEnv = true;
  const pick = (palette, i, k) =>
    palette[Math.floor(hash(i, k) * palette.length)];
  // Each part's colour (per figure) and finish.
  const look = {
    coat: (i, lady) => [
      pick(lady ? GOWNS : COATS, i, 1),
      lady ? satin : velvet,
    ],
    waistcoat: (i) => [pick(BROCADE, i, 2), brocade],
    linen: () => [0xf3eee2, linen],
    shoes: () => [0x0d0c0b, satin],
    gold: () => [0xffffff, gilt],
    star: () => [0xf4f0e6, gilt],
    epaulettes: () => [0xffffff, gilt],
    tiara: () => [0xffffff, gilt],
    sash: () => [0x1f4aa8, satin],
    skin: (i) => [pick(SKIN, i, 3), skin],
    eyes: () => [0x1c140f, plain],
    lips: (i) => [
      new THREE.Color(pick(SKIN, i, 3)).lerp(new THREE.Color(0x9a4040), 0.45),
      skin,
    ],
    brows: (i, lady) => [lady ? pick(HAIR, i, 4) : 0x3a2a1e, hair],
    wig: (i) => [pick(POWDER, i, 4), hair],
    natural: (i) => [pick(HAIR, i, 4), hair],
    // The queue matches the hair: powdered with the wig (key 30), else their own.
    queue: (i) => [
      hash(i, 30) < 0.6 ? pick(POWDER, i, 4) : pick(HAIR, i, 4),
      hair,
    ],
    bow: () => [0x0c0b0b, satin],
    hair: (i) => [pick(HAIR, i, 4), hair],
    flowers: (i) => [pick(FLOWERS, i, 16), plain],
    gloves: (i) => [pick(GLOVES, i, 5), satin],
    fan: () => [0xf1e6c8, satin],
  };
  // Brocade parts keep their UVs for the weave.
  const woven = new Set(["waistcoat"]);

  const seated = seats
    .map((seat, i) => ({ seat, i }))
    .filter(({ i }) => hash(i, 0) < 0.7);
  const groups = [
    {
      figure: gentleman(),
      people: seated.filter(({ i }) => hash(i, 9) >= 0.5),
    },
    {
      figure: lady(),
      people: seated.filter(({ i }) => hash(i, 9) < 0.5),
      lady: true,
    },
  ];
  const pivots = {
    body: null,
    head: about(NECK),
    arm: about(ELBOW),
    hand: about(ELBOW),
  };
  const all = [];
  for (const group of groups) {
    group.meshes = [];
    for (const [frame, parts] of Object.entries(group.figure))
      for (const [part, spec] of Object.entries(parts)) {
        // `who` > 0: worn by that share of the group, by a per-figure draw on
        // `key`; < 0: by the rest (so wig and natural hair never overlap).
        const {
          who = 1,
          key = 40 + part.length,
          parts: geometries,
        } = Array.isArray(spec) ? { parts: spec } : spec;
        const members = group.people
          .map((person, n) => ({ person, n }))
          .filter(({ person }) =>
            who > 0 ? hash(person.i, key) < who : hash(person.i, key) >= -who,
          );
        if (!members.length) continue;
        let geometry = (woven.has(part) ? soupUv : soup)(geometries);
        if (pivots[frame]) geometry = pivots[frame](geometry);
        const [, material] = look[part](0, group.lady);
        const mesh = new THREE.InstancedMesh(
          geometry,
          material,
          members.length,
        );
        members.forEach(({ person }, k) =>
          mesh.setColorAt(
            k,
            new THREE.Color(look[part](person.i, group.lady)[0]),
          ),
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // the instances span the whole stalls
        mesh.name = `audience-${group.lady ? "lady" : "gentleman"}-${part}-${frame}`;
        mesh.userData = { frame, members: members.map(({ n }) => n) };
        parent.add(mesh);
        group.meshes.push(mesh);
        all.push(mesh);
      }
    // Every figure's four frames, written once per pose and copied out.
    group.frames = {
      body: new Float32Array(group.people.length * 16),
      head: new Float32Array(group.people.length * 16),
      arm: new Float32Array(group.people.length * 16),
      hand: new Float32Array(group.people.length * 16),
    };
  }

  const seatM = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const headM = new THREE.Matrix4();
  const arm = new THREE.Matrix4();
  const handM = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const look3 = new THREE.Matrix4();
  const raise = new THREE.Matrix4();
  const close = new THREE.Matrix4();
  const build = new THREE.Matrix4();
  const elbow = new THREE.Matrix4().makeTranslation(...ELBOW.toArray());
  const neckM = new THREE.Matrix4().makeTranslation(...NECK.toArray());
  const yawQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const gaze = new THREE.Euler(0, 0, 0, "YXZ");
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let time = 0;
  let sway = 0; // 0..1, eased in while music plays
  let clapFrom = -1;
  let clapUntil = -1;

  function pose() {
    for (const { people, meshes, frames } of groups) {
      people.forEach(({ seat: [x, y, z, yaw], i }, n) => {
        const phase = hash(i, 6) * 6.283;
        // Applause: each joins a moment late and stops on their own.
        const start = clapFrom + 0.6 * hash(i, 7);
        const stop = clapUntil - 1.8 * hash(i, 8);
        const clap =
          time < start || time > stop + 1
            ? 0
            : Math.min(1, (time - start) * 3, stop + 1 - time);
        const keen = 0.75 + 0.25 * hash(i, 10) + (hash(i, 11) > 0.9 ? 0.3 : 0);
        const rate = 6.283 * (2.5 + hash(i, 12)); // 2.5–3.5 claps a second
        const beat = 0.5 + 0.5 * Math.sin(time * rate + phase);
        const listen = sway * Math.sin(time * (1.4 + hash(i, 13)) + phase);
        euler.set(
          0.025 * listen + clap * (0.07 + 0.02 * beat), // a nod; leaning in to clap
          0,
          0.03 * sway * Math.sin(time * (0.9 + hash(i, 14)) + phase), // a sway
        );
        // No two the same: a little taller or shorter, broader or slighter.
        const tall = 0.94 + 0.12 * hash(i, 17);
        const broad = 0.92 + 0.16 * hash(i, 18);
        seatM.compose(at.set(x, y, z), yawQ.setFromAxisAngle(UP, yaw), one);
        body
          .multiplyMatrices(seatM, turn.makeRotationFromEuler(euler))
          .multiply(build.makeScale(broad, tall, 1));
        body.toArray(frames.body, n * 16);
        // The head: a slow glance about the hall when idle, held toward the
        // stage while music plays, turned to a neighbour while applauding.
        const idle = 1 - Math.max(sway, clap);
        const glance =
          0.45 *
          Math.sin(time * (0.11 + 0.1 * hash(i, 19)) + phase) *
          Math.max(0, Math.sin(time * 0.07 + phase * 3));
        const neighbour = (hash(i, 21) - 0.5) * 0.6;
        gaze.set(
          -0.06 + 0.05 * listen,
          glance * idle + neighbour * clap,
          0.04 * sway * Math.sin(time * 0.8 + phase),
        );
        headM
          .multiplyMatrices(body, neckM)
          .multiply(look3.makeRotationFromEuler(gaze));
        headM.toArray(frames.head, n * 16);
        // Forearms up toward the chest, the hands meeting on each beat.
        arm
          .multiplyMatrices(body, elbow)
          .multiply(raise.makeRotationX(clap * keen * 1.15));
        arm.toArray(frames.arm, n * 16);
        handM
          .copy(arm)
          .multiply(close.makeScale(1 - clap * (0.42 - 0.38 * beat), 1, 1));
        handM.toArray(frames.hand, n * 16);
      });
      for (const mesh of meshes) {
        const { frame, members } = mesh.userData;
        const from = frames[frame];
        const into = mesh.instanceMatrix.array;
        members.forEach((n, k) =>
          into.set(from.subarray(n * 16, n * 16 + 16), k * 16),
        );
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  pose();

  return {
    count: seated.length,
    meshes: all,
    hands: all.filter((mesh) => mesh.userData.frame === "hand"),
    /** Applaud for `seconds`, starting now. */
    applaud(seconds = 9) {
      clapFrom = time;
      clapUntil = time + seconds;
    },
    /** `playing`: music is sounding, so the house sways with it. Heads keep
     *  glancing about even when it is not. */
    update(dt, playing) {
      time += dt;
      sway += ((playing ? 1 : 0) - sway) * Math.min(1, dt * 0.8);
      if (all[0].visible) pose();
    },
    get visible() {
      return all[0].visible;
    },
    set visible(on) {
      for (const mesh of all) mesh.visible = on;
    },
  };
}
