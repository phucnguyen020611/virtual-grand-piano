import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { repeatSet } from "./surfaces.js";

/**
 * The ways in and out: the double doors guests leave by at the end of the
 * centre aisle (lit EXIT sign above), a stage door in each wing where the
 * performer walks on, and a grand stair up the rear wall to each balcony.
 * Everything is built in a doorway's or stair's own frame and merged per
 * material: a handful of draw calls in all.
 */

const soup = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Gilt doorcase round a w × h opening, facing +z from a wall at z = 0. */
function doorcase(w, h) {
  return [
    ...[-1, 1].map((s) =>
      box(0.7, h + 0.7, 1, s * (w / 2 + 0.35), (h + 0.7) / 2, 0.5),
    ),
    box(w + 1.4, 0.7, 1, 0, h + 0.35, 0.5),
    box(w + 1, 1.2, 0.5, 0, h + 1.3, 0.25), // frieze
    box(w + 2, 0.25, 1.1, 0, h + 1.83, 0.55), // bed moulding
    box(w + 2.4, 0.45, 1.3, 0, h + 2.17, 0.65), // cornice
  ];
}

/** A raised gilt moulding round a panel, `z` proud of the wall. */
const panelFrame = (cx, cy, pw, ph, z) => [
  box(pw, 0.08, 0.06, cx, cy + ph / 2, z),
  box(pw, 0.08, 0.06, cx, cy - ph / 2, z),
  box(0.08, ph, 0.06, cx + pw / 2, cy, z),
  box(0.08, ph, 0.06, cx - pw / 2, cy, z),
];

/**
 * The lit exit sign as fitted in halls today: ISO 7010's "exit, straight
 * ahead" (see docs/THIRD_PARTY_ART.md), on the diffuser of a light box.
 */
function exitSign() {
  const map = new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}art/exit-sign.svg`,
  );
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(1.15, 1.15, 1.15),
    toneMapped: false,
  });
}

/** Backstage, glimpsed past the portière: dark, a warm glow low down. */
function wingDark() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const glow = g.createRadialGradient(32, 70, 4, 32, 64, 60);
  glow.addColorStop(0, "#4a2e14");
  glow.addColorStop(1, "#050403");
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map });
}

/**
 * @param room { halfWidth, backZ, stageTopY, rearFloorY, deckY (balcony
 *   floor), railX (balcony rail), landing (stair width at the rail), wingZ,
 *   gilt, wood, velvet, runner: { geometry(profile, half), material } }
 */
export function buildPassages(hall, room) {
  const { halfWidth, backZ, rearFloorY, deckY, railX, landing } = room;
  const parts = {
    gilt: [],
    wood: [],
    dark: [],
    velvet: [],
    sign: [],
    housing: [],
    carpet: [],
  };
  const place = (yaw, x, y, z) =>
    new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const add = (key, geometries, matrix) =>
    parts[key].push(...geometries.map((g) => g.applyMatrix4(matrix)));

  // --- Exit: double doors at the head of the centre aisle ---------------------
  {
    const w = 8;
    const h = 11.5;
    const at = place(Math.PI, 0, rearFloorY, backZ);
    add("gilt", doorcase(w, h), at);
    const leaves = [];
    const trim = [];
    for (const s of [-1, 1]) {
      const cx = s * (w / 4);
      leaves.push(box(w / 2 - 0.04, h, 0.3, cx, h / 2, 0.35));
      trim.push(
        ...panelFrame(cx, h * 0.68, w / 2 - 1.1, h * 0.42, 0.53),
        ...panelFrame(cx, h * 0.24, w / 2 - 1.1, h * 0.3, 0.53),
        // A brass pull on each leaf by the meeting stiles.
        new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8).translate(
          s * 0.35,
          h * 0.47,
          0.62,
        ),
      );
    }
    add("wood", leaves, at);
    add("gilt", trim, at);
    // The light box, about 62 × 20 cm, on two stubs off the wall.
    const signY = h + 3.4;
    add(
      "housing",
      [
        box(3.15, 1.16, 0.22, 0, signY, 0.36),
        box(0.2, 0.2, 0.3, -0.9, signY, 0.12),
        box(0.2, 0.2, 0.3, 0.9, signY, 0.12),
      ],
      at,
    );
    add(
      "sign",
      [new THREE.PlaneGeometry(2.96, 0.96).translate(0, signY, 0.475)],
      at,
    );
  }

  // --- Stage doors in the wings, a velvet portière half drawn ----------------
  {
    const w = 7;
    const h = 12.5;
    const portiere = new THREE.PlaneGeometry(w * 0.55, h - 0.4, 24, 1);
    const pos = portiere.attributes.position;
    for (let i = 0; i < pos.count; i++)
      pos.setZ(i, Math.sin(pos.getX(i) * 4.2) * 0.14);
    portiere.computeVertexNormals();
    for (const side of [-1, 1]) {
      // On each side wall, the portière gathered toward the audience.
      const at = place(
        -side * (Math.PI / 2),
        side * halfWidth,
        room.stageTopY,
        room.wingZ,
      );
      const toHall = side; // local +x faces the hall on the right, the stage on the left
      add("gilt", doorcase(w, h), at);
      add(
        "gilt",
        [
          new THREE.CylinderGeometry(0.07, 0.07, w + 0.4, 8)
            .rotateZ(Math.PI / 2)
            .translate(0, h - 0.15, 0.85),
        ],
        at,
      );
      add(
        "dark",
        [new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.04)],
        at,
      );
      add(
        "wood",
        [
          box(0.12, h, 1, -(w / 2 - 0.06), h / 2, 0.5),
          box(0.12, h, 1, w / 2 - 0.06, h / 2, 0.5),
          box(w, 0.12, 1, 0, h - 0.06, 0.5),
        ],
        at,
      );
      add(
        "velvet",
        [
          portiere
            .clone()
            .translate(toHall * w * 0.22, (h - 0.4) / 2 + 0.05, 0.75),
        ],
        at,
      );
    }
  }

  // --- A grand stair up the rear wall to each balcony -------------------------
  // In the stair's frame: z runs downhill from the balcony rail, x across.
  const STEPS = 20;
  const run = 1.05;
  const rise = (deckY - rearFloorY) / STEPS;
  const half = landing / 2 - 0.2;
  const tread = (i) => rearFloorY + i * rise; // top of step i (1 = lowest)
  const front = (i) => (STEPS - i + 1) * run; // its nosing's z
  for (const side of [-1, 1]) {
    const at = place(
      -side * (Math.PI / 2),
      side * railX,
      0,
      backZ - landing / 2,
    );
    const blocks = [];
    const gilt = [];
    for (let i = 1; i <= STEPS; i++) {
      blocks.push(
        box(
          2 * half,
          i * rise,
          front(i),
          0,
          rearFloorY + (i * rise) / 2,
          front(i) / 2,
        ),
      );
      gilt.push(box(2 * half, 0.07, 0.12, 0, tread(i) + 0.03, front(i) - 0.05));
    }
    // The runner, down the treads and risers and a step out onto the floor.
    const profile = [[deckY, 0]];
    for (let i = STEPS; i >= 1; i--)
      profile.push([tread(i), front(i)], [tread(i - 1), front(i)]);
    profile.push([rearFloorY, front(1) + 1.5]);
    // Balustrade on the open side: newels at foot and head, a sloping rail,
    // a baluster on every step.
    const x = -side * (half - 0.2);
    const foot = new THREE.Vector3(x, tread(1) + 2.6, front(1) - 0.3);
    const head = new THREE.Vector3(x, deckY + 2.6, 0.3);
    for (const [top, bottom, z] of [
      [foot.y, tread(1), foot.z],
      [head.y, deckY, head.z],
    ])
      gilt.push(
        new THREE.CylinderGeometry(0.2, 0.26, top - bottom, 16).translate(
          x,
          (top + bottom) / 2,
          z,
        ),
        new THREE.SphereGeometry(0.32, 16, 12).translate(x, top + 0.3, z),
      );
    gilt.push(
      new THREE.CylinderGeometry(0.1, 0.1, foot.distanceTo(head), 10)
        .applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            head.clone().sub(foot).normalize(),
          ),
        )
        .translate(
          (foot.x + head.x) / 2,
          (foot.y + head.y) / 2,
          (foot.z + head.z) / 2,
        ),
    );
    for (let i = 2; i < STEPS; i++) {
      const z = front(i) - run / 2;
      const top =
        foot.y + ((foot.z - z) / (foot.z - head.z)) * (head.y - foot.y);
      gilt.push(
        new THREE.CylinderGeometry(0.06, 0.06, top - tread(i), 8).translate(
          x,
          (top + tread(i)) / 2,
          z,
        ),
      );
    }
    add("wood", blocks, at);
    add("gilt", gilt, at);
    add("carpet", [room.runner.geometry(profile, half - 0.45)], at);
  }

  const materials = {
    gilt: room.gilt,
    wood: room.wood,
    dark: wingDark(),
    sign: exitSign(),
    housing: new THREE.MeshStandardMaterial({
      color: 0xd8dadc,
      metalness: 0.6,
      roughness: 0.35,
    }),
    carpet: room.runner.material,
    velvet: new THREE.MeshPhysicalMaterial({
      ...repeatSet(room.velvet, 2, 6),
      color: 0xd06070,
      roughness: 1,
      sheen: 1,
      sheenRoughness: 0.35,
      sheenColor: 0xff8090,
      side: THREE.DoubleSide,
    }),
  };
  for (const [key, list] of Object.entries(parts)) {
    const m = new THREE.Mesh(soup(list), materials[key]);
    m.name = `passages-${key}`;
    m.receiveShadow = true;
    hall.add(m);
  }
}
