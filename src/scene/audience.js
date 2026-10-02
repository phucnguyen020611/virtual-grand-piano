import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * A court audience in about seven seats of ten, dressed for the evening:
 * gentlemen in gilt-trimmed frock coats over brocade waistcoats, lace jabots,
 * breeches and white stockings, powdered hair rolled at the sides and tied
 * in a queue; ladies in ball gowns with puffed sleeves and long gloves,
 * a necklace and a little tiara on their hair, piled up in a chignon with
 * ringlets at the temples. They sway with the music and, at the end of a
 * piece, raise their hands and applaud, each on their own beat.
 *
 * Built in seat space (+y up, −z toward the stage, floor at y = 0). Every
 * part of a figure is an instanced mesh in one of three frames: the body,
 * the forearms (pivoting at the elbows) and the hands (which also clap).
 */

const UP = new THREE.Vector3(0, 1, 0);
const soup = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

/** A capsule of radius `r` from a to b, optionally scaled before aiming. */
function limb(a, b, r, scale) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const g = new THREE.CapsuleGeometry(r, from.distanceTo(to), 2, 8);
  if (scale) g.scale(...scale);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      UP,
      to.clone().sub(from).normalize(),
    ),
  );
  return g.translate(...from.add(to).multiplyScalar(0.5).toArray());
}
const ball = (r, [x, y, z], scale = [1, 1, 1]) =>
  new THREE.SphereGeometry(r, 14, 10).scale(...scale).translate(x, y, z);
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// The forearms pivot about the line through the elbows.
const ELBOW = new THREE.Vector3(0, 3.25, 0.25);
const HEAD = [0, 5.05, 0.35];
const HEAD_SHAPE = [0.88, 1.08, 1];
const head = () => ball(0.5, HEAD, HEAD_SHAPE);
const neck = () => limb([0, 4.15, 0.45], [0, 4.6, 0.4], 0.19);
const hairCap = (back = 0.62) =>
  new THREE.SphereGeometry(0.56, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56)
    .rotateX(back) // the hairline sits back from the brow
    .scale(...HEAD_SHAPE)
    .translate(...HEAD);
const pivot = (g) => g.translate(...ELBOW.clone().negate().toArray());

/** Forearms and hands resting on the lap, elbows out, hands near the knees. */
const forearms = (r) =>
  soup(
    [-1, 1].map((s) =>
      limb([s * 0.93, 3.25, 0.25], [s * 0.32, 3.02, -0.72], r),
    ),
  );
const hands = () =>
  soup([-1, 1].map((s) => ball(0.16, [s * 0.29, 2.99, -0.9], [0.62, 1, 1.3])));

function gentleman() {
  const coat = [
    limb([0, 2.75, 0.4], [0, 4.15, 0.45], 0.6, [1.45, 1, 0.8]),
    // The coat's skirts over the thighs and falling beside the seat.
    ...[-1, 1].flatMap((s) => [
      box(0.78, 0.12, 1.0, s * 0.42, 2.92, -0.25),
      limb([s * 0.82, 2.85, 0.55], [s * 0.88, 1.85, 0.35], 0.16, [1, 1, 2]),
      limb([s * 0.98, 4.1, 0.45], [s * 0.93, 3.25, 0.25], 0.21), // upper arm
      limb([s * 0.42, 2.6, 0.2], [s * 0.42, 2.65, -1.25], 0.33), // breeches
    ]),
    new THREE.TorusGeometry(0.31, 0.09, 6, 16)
      .rotateX(Math.PI / 2 - 0.15)
      .translate(0, 4.22, 0.42), // standing collar
  ];
  // Shaped to the chest, just proud of the coat's open fronts.
  const waistcoat = [
    limb([0, 2.95, 0.14], [0, 3.95, 0.2], 0.42, [0.82, 1, 0.55]),
  ];
  const linen = [
    new THREE.TorusGeometry(0.21, 0.07, 6, 16)
      .rotateX(Math.PI / 2 - 0.2)
      .translate(0, 4.32, 0.38), // the stock wound round the neck
    ball(1, [0, 4.02, -0.08], [0.12, 0.22, 0.06]), // the lace jabot below it
    ...[-1, 1].map((s) =>
      limb([s * 0.43, 2.45, -1.3], [s * 0.45, 0.32, -1.45], 0.25),
    ), // stockings
  ];
  const shoes = [-1, 1].map((s) =>
    box(0.36, 0.22, 0.78, s * 0.45, 0.11, -1.65),
  );
  const gold = [
    // Braid down the coat's fronts, a row of buttons, and the pocket flaps.
    ...[-1, 1].map((s) => box(0.06, 1.3, 0.06, s * 0.36, 3.45, -0.1)),
    ...[3.0, 3.3, 3.6, 3.9].map((y) => ball(0.045, [0.42, y, -0.12])),
    ...[-1, 1].map((s) => box(0.42, 0.05, 0.06, s * 0.58, 2.95, -0.04)),
  ];
  const hair = [
    hairCap(),
    // Powdered rolls over the ears and a queue at the nape.
    ...[-1, 1].map((s) =>
      limb([s * 0.43, 5.0, 0.15], [s * 0.43, 5.0, 0.6], 0.13),
    ),
    limb([0, 4.95, 0.82], [0, 4.45, 0.92], 0.11),
  ];
  return {
    body: { coat, waistcoat, linen, shoes, gold, skin: [head(), neck()], hair },
    arm: { coat: [forearms(0.17)] },
    hand: { skin: [hands()] },
  };
}

function lady() {
  const gown = [
    limb([0, 2.85, 0.4], [0, 3.85, 0.43], 0.52, [1.2, 1, 0.78]), // bodice
    // The skirt, belled out over the seat and the knees to the floor.
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
      20,
    )
      .scale(0.7, 1, 1.25)
      .translate(0, 0, -0.55),
    ...[-1, 1].map((s) => ball(0.27, [s * 0.86, 3.98, 0.42], [1, 0.85, 1])), // puffed sleeves
  ];
  const skin = [
    head(),
    neck(),
    limb([-0.62, 4.05, 0.42], [0.62, 4.05, 0.42], 0.2), // bare shoulders
    ...[-1, 1].map((s) =>
      limb([s * 0.97, 3.85, 0.42], [s * 0.93, 3.25, 0.25], 0.16),
    ), // upper arms
  ];
  const gold = [
    new THREE.TorusGeometry(0.27, 0.03, 6, 20)
      .rotateX(Math.PI / 2 - 0.4)
      .translate(0, 4.27, 0.33), // necklace
    new THREE.TorusGeometry(0.4, 0.035, 6, 16, Math.PI)
      .rotateX(-0.5)
      .translate(0, 5.32, 0.18), // tiara
    ball(0.06, [0, 5.72, 0.02]), // its jewel
  ];
  const hair = [
    hairCap(0.5),
    ball(0.3, [0, 5.48, 0.62]), // the chignon
    ...[-1, 1].map((s) =>
      limb([s * 0.42, 5.0, 0.05], [s * 0.45, 4.55, 0.1], 0.08),
    ), // ringlets
  ];
  return {
    body: { coat: gown, skin, gold, hair },
    arm: { gloves: [forearms(0.15)] },
    hand: { gloves: [hands()] },
  };
}

const COATS = [
  0x1d2b5a, 0x5e1424, 0x14432f, 0x121214, 0x3b1d52, 0x1b1f3a, 0x123c44,
  0x4a1c14,
];
const BROCADE = [0xc8a24e, 0xe6dcc2, 0xd9c08a, 0x8a1d2c, 0xb9b7b2, 0x6a5a2a];
const GOWNS = [
  0x8c1c2b, 0x213f8c, 0x1d6a48, 0xb8913d, 0xe8dcc0, 0xb0566a, 0x5a3a8a,
  0x151318, 0xcdb27a,
];
const SKIN = [0xf1c7a5, 0xe6b48f, 0xd29c75, 0xb07a55, 0x8a5a3c, 0x60402c];
const HAIR_MEN = [0xe4e0d8, 0xd2cdc4, 0xb9b4ac, 0x2a1d14, 0x4a3020];
const HAIR_WOMEN = [0x1a130e, 0x3a2618, 0x6a3420, 0xc9a66b, 0x8a6a40, 0xe0dcd2];
const GLOVES = [0xf2ede2, 0xe8e0cc, 0xf6f2ea];

/** `seats`: [x, y, z, yaw] of every seat, facing −z. */
export function buildAudience(parent, seats) {
  const hash = (i, k) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const cloth = new THREE.MeshStandardMaterial({ roughness: 0.88 });
  const satin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const gilt = new THREE.MeshStandardMaterial({
    color: 0xd8ad55,
    metalness: 1,
    roughness: 0.32,
  });
  gilt.userData.keepEnv = true;
  const pick = (palette, i, k) =>
    palette[Math.floor(hash(i, k) * palette.length)];
  // How each part is coloured and finished: [colour, material].
  const look = {
    coat: (i, lady) => [pick(lady ? GOWNS : COATS, i, 1), lady ? satin : cloth],
    waistcoat: (i) => [pick(BROCADE, i, 2), satin],
    linen: () => [0xf1ece0, cloth],
    shoes: () => [0x0d0c0b, satin],
    gold: () => [0xffffff, gilt],
    skin: (i) => [pick(SKIN, i, 3), cloth],
    hair: (i, lady) => [pick(lady ? HAIR_WOMEN : HAIR_MEN, i, 4), cloth],
    gloves: (i) => [pick(GLOVES, i, 5), satin],
  };

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
  const all = [];
  for (const group of groups) {
    group.meshes = { body: [], arm: [], hand: [] };
    for (const frame of ["body", "arm", "hand"])
      for (const [part, geometries] of Object.entries(group.figure[frame])) {
        const geometry =
          frame === "body" ? soup(geometries) : pivot(soup(geometries));
        const mesh = new THREE.InstancedMesh(
          geometry,
          look[part](0, group.lady)[1],
          group.people.length,
        );
        group.people.forEach(({ i }, n) =>
          mesh.setColorAt(n, new THREE.Color(look[part](i, group.lady)[0])),
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // the instances span the whole stalls
        mesh.name = `audience-${part}-${frame}`;
        parent.add(mesh);
        group.meshes[frame].push(mesh);
        all.push(mesh);
      }
  }

  const seatM = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const arm = new THREE.Matrix4();
  const hand = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const raise = new THREE.Matrix4();
  const close = new THREE.Matrix4();
  const elbow = new THREE.Matrix4().makeTranslation(...ELBOW.toArray());
  const yawQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let time = 0;
  let sway = 0; // 0..1, eased in while music plays
  let clapFrom = -1;
  let clapUntil = -1;
  let posed = false;

  function pose() {
    for (const { people, meshes } of groups)
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
        seatM.compose(at.set(x, y, z), yawQ.setFromAxisAngle(UP, yaw), one);
        body.multiplyMatrices(seatM, turn.makeRotationFromEuler(euler));
        for (const mesh of meshes.body) mesh.setMatrixAt(n, body);
        // Forearms up toward the chest, the hands meeting on each beat.
        arm
          .multiplyMatrices(body, elbow)
          .multiply(raise.makeRotationX(clap * keen * 1.15));
        for (const mesh of meshes.arm) mesh.setMatrixAt(n, arm);
        hand
          .copy(arm)
          .multiply(close.makeScale(1 - clap * (0.42 - 0.38 * beat), 1, 1));
        for (const mesh of meshes.hand) mesh.setMatrixAt(n, hand);
      });
    for (const mesh of all) mesh.instanceMatrix.needsUpdate = true;
  }
  pose();

  return {
    count: seated.length,
    meshes: all,
    hands: groups.flatMap((group) => group.meshes.hand),
    /** Applaud for `seconds`, starting now. */
    applaud(seconds = 9) {
      clapFrom = time;
      clapUntil = time + seconds;
    },
    /** `playing`: music is sounding, so the house sways with it. */
    update(dt, playing) {
      time += dt;
      sway += ((playing ? 1 : 0) - sway) * Math.min(1, dt * 0.8);
      const moving = sway > 0.002 || time < clapUntil + 1;
      if (moving || posed) pose();
      posed = moving; // one last pose once everyone is still
    },
    get visible() {
      return all[0].visible;
    },
    set visible(on) {
      for (const mesh of all) mesh.visible = on;
    },
  };
}
