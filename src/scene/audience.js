import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * An evening audience in about seven seats of ten: simple, matte figures in
 * dark suits and gowns. They sway a little while the music plays, and at
 * the end of a piece raise their forearms and clap, each on their own beat.
 * Five instanced meshes for everyone (clothes, skin, hair, sleeves, hands);
 * the matrices are only rewritten while someone is moving.
 */

const UP = new THREE.Vector3(0, 1, 0);
const soup = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

/** A capsule of radius `r` from a to b (seat space: +y up, −z forward). */
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

// The forearms pivot at the elbows; their parts are built about that line.
const ELBOW = new THREE.Vector3(0, 3.25, 0.25);

function figure() {
  const clothes = [
    limb([0, 2.75, 0.35], [0, 4.2, 0.45], 0.6, [1.45, 1, 0.8]), // torso
    ...[-1, 1].flatMap((s) => [
      limb([s * 0.42, 2.6, 0.2], [s * 0.42, 2.65, -1.3], 0.33), // thigh
      limb([s * 0.43, 2.45, -1.38], [s * 0.45, 0.3, -1.5], 0.27), // shin
      new THREE.BoxGeometry(0.4, 0.24, 0.8).translate(s * 0.45, 0.12, -1.7),
      limb([s * 0.98, 4.1, 0.45], [s * 0.93, 3.25, 0.25], 0.2), // upper arm
    ]),
  ];
  const skin = [
    limb([0, 4.15, 0.45], [0, 4.6, 0.4], 0.2), // neck
    new THREE.SphereGeometry(0.5, 14, 10)
      .scale(0.88, 1.08, 1)
      .translate(0, 5.05, 0.35),
  ];
  const hair = [
    new THREE.SphereGeometry(0.56, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)
      .rotateX(0.62) // the hairline sits back from the brow
      .scale(0.88, 1.08, 1)
      .translate(0, 5.05, 0.35), // the head's own centre: no skin through
  ];
  // Resting on the thighs: forearms forward from the elbows, hands near the knees.
  const sleeves = [-1, 1].map((s) =>
    limb([s * 0.93, 3.25, 0.25], [s * 0.34, 3.0, -0.75], 0.17),
  );
  const hands = [-1, 1].map((s) =>
    new THREE.SphereGeometry(0.16, 10, 8)
      .scale(0.7, 1, 1.3)
      .translate(s * 0.3, 2.98, -0.92),
  );
  const pivot = (parts) =>
    soup(parts).translate(...ELBOW.clone().negate().toArray());
  return {
    clothes: soup(clothes),
    skin: soup(skin),
    hair: soup(hair),
    sleeves: pivot(sleeves),
    hands: pivot(hands),
  };
}

const CLOTHES = [
  0x22222a, 0x141416, 0x1e2a44, 0x5a1a24, 0x1f3328, 0x3d2440, 0x7a5c40,
  0x4a4d54, 0x1f4048, 0x2e1c18,
];
const SKIN = [0xf1c7a5, 0xe0ac83, 0xc68b62, 0xa0694a, 0x7a4e34, 0x5c3a28];
const HAIR = [0x16110d, 0x2e2018, 0x4a3020, 0x8a6a40, 0xb4aca2, 0x6a3420];

/** `seats`: [x, y, z, yaw] of every seat, facing −z. */
export function buildAudience(parent, seats) {
  const hash = (i, k) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const people = seats.filter((_, i) => hash(i, 0) < 0.7);
  const shapes = figure();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const make = (geometry, palette, k) => {
    const mesh = new THREE.InstancedMesh(geometry, material, people.length);
    people.forEach((_, i) =>
      mesh.setColorAt(
        i,
        new THREE.Color(palette[Math.floor(hash(i, k) * palette.length)]),
      ),
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // the instances span the whole stalls
    parent.add(mesh);
    return mesh;
  };
  const clothes = make(shapes.clothes, CLOTHES, 1);
  const skin = make(shapes.skin, SKIN, 2);
  const hair = make(shapes.hair, HAIR, 3);
  const sleeves = make(shapes.sleeves, CLOTHES, 1); // their own jacket's colour
  const hands = make(shapes.hands, SKIN, 2);
  clothes.name = "audience";

  const seat = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const arm = new THREE.Matrix4();
  const tilt = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const at = new THREE.Vector3();
  const turn = new THREE.Matrix4();
  const raise = new THREE.Matrix4();
  const close = new THREE.Matrix4();
  const elbow = new THREE.Matrix4().makeTranslation(...ELBOW.toArray());
  let time = 0;
  let sway = 0; // 0..1, eased in while music plays
  let clap = 0; // 0..1, the applause's strength
  let clapUntil = -1;
  let posed = false;

  function pose() {
    people.forEach(([x, y, z, yaw], i) => {
      const phase = hash(i, 4) * 6.283;
      const rate = 0.25 + 0.2 * hash(i, 5);
      euler.set(
        sway * 0.03 * Math.sin(time * rate * 3.1 + phase), // a nod
        0,
        sway * 0.035 * Math.sin(time * rate * 6.283 + phase), // a lean
      );
      seat.compose(at.set(x, y, z), tilt.setFromAxisAngle(UP, yaw), one);
      body.multiplyMatrices(seat, turn.makeRotationFromEuler(euler));
      clothes.setMatrixAt(i, body);
      skin.setMatrixAt(i, body);
      hair.setMatrixAt(i, body);
      // Applause: forearms up toward the chest, hands meeting on each beat.
      const keen = 0.6 + 0.4 * hash(i, 6);
      const lift = clap * keen;
      const beat = 0.5 + 0.5 * Math.sin(time * (8 + 5 * hash(i, 7)) + phase);
      arm
        .multiplyMatrices(body, elbow)
        .multiply(raise.makeRotationX(lift * 1.05))
        .multiply(close.makeScale(1 - lift * (0.45 - 0.4 * beat), 1, 1));
      sleeves.setMatrixAt(i, arm);
      hands.setMatrixAt(i, arm);
    });
    for (const mesh of [clothes, skin, hair, sleeves, hands])
      mesh.instanceMatrix.needsUpdate = true;
  }
  pose();

  return {
    count: people.length,
    meshes: [clothes, skin, hair, sleeves, hands],
    /** Applaud for `seconds`, rising at once and dying away at the end. */
    applaud(seconds = 9) {
      clapUntil = time + seconds;
    },
    /** `playing`: music is sounding, so the house sways with it. */
    update(dt, playing) {
      time += dt;
      const left = clapUntil - time;
      const clapTarget = left > 0 ? Math.min(1, left / 2.5) : 0;
      clap +=
        (clapTarget - clap) * Math.min(1, dt * (clapTarget > clap ? 6 : 2));
      sway += ((playing ? 1 : 0) - sway) * Math.min(1, dt * 0.8);
      const moving = sway > 0.002 || clap > 0.002;
      if (moving || posed) pose();
      posed = moving; // one last pose once everyone is still
    },
    set visible(on) {
      for (const mesh of [clothes, skin, hair, sleeves, hands])
        mesh.visible = on;
    },
  };
}
