import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * The lighting rig the stage light comes from: steel pipes hung on cables
 * from the ceiling, with theatre instruments clamped under them, each in its
 * yoke and aimed at its mark. Fresnels (a short body, barn doors) light the
 * piano; the long-barrelled profile is the lantern that casts the rear wall's
 * slides. Two draw calls for all the ironwork, one per lens.
 */

const soup = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const DROP = 1.5; // pipe to pivot: clamp, yoke and body hang this far below
const PIPE_R = 0.16;

/** A Fresnel's or a profile's body along +z, lens at the front. */
function bodyGeometry(kind) {
  const profile = kind === "profile";
  const parts = [
    // Rounded back, the body, and the lens ring.
    new THREE.LatheGeometry(
      (profile
        ? [
            [0, -1.3],
            [0.55, -1.25],
            [0.72, -0.9],
            [0.72, 0.5],
            [0.48, 0.7],
            [0.48, 2.0],
            [0.56, 2.1],
            [0.56, 2.3],
          ]
        : [
            [0, -0.95],
            [0.5, -0.9],
            [0.78, -0.6],
            [0.8, 0.7],
            [0.86, 0.8],
            [0.86, 0.95],
          ]
      ).map(([r, z]) => new THREE.Vector2(r, z)),
      20,
    ).rotateX(Math.PI / 2),
    // Cooling fins along the top.
    ...[-0.25, 0, 0.25].map((x) =>
      new THREE.BoxGeometry(0.05, 0.16, 1.1).translate(x, 0.78, -0.15),
    ),
  ];
  if (!profile)
    // Four barn doors, opened out round the lens.
    for (let i = 0; i < 4; i++)
      parts.push(
        new THREE.BoxGeometry(1.5, 0.03, 0.75)
          .translate(0, 0, 0.36)
          .rotateX(-0.5)
          .translate(0, 0.86, 0.95)
          .rotateZ((i * Math.PI) / 2),
      );
  return soup(parts);
}

/** Yoke and C-clamp, pivot at the origin, pipe `DROP` above. */
function yokeGeometry() {
  const parts = [];
  for (const x of [-0.95, 0.95])
    parts.push(new THREE.BoxGeometry(0.1, 1.15, 0.3).translate(x, 0.5, 0));
  parts.push(
    new THREE.BoxGeometry(2, 0.1, 0.3).translate(0, 1.07, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).translate(0, 1.25, 0),
    // The clamp round the pipe.
    new THREE.BoxGeometry(0.22, 0.5, 0.5).translate(0, DROP - 0.05, 0),
  );
  return soup(parts);
}

/**
 * @param pipes [{ y, z, x0, x1, hangers: [x…] }]
 * @param instruments [{ x, pipe, aim: Vector3, kind: "fresnel"|"profile" }]
 * @returns per instrument { lens: world position of its lens, material }
 */
export function buildLightingRig(parent, { pipes, instruments, ceilingY }) {
  const iron = new THREE.MeshStandardMaterial({
    color: 0x151515,
    metalness: 0.5,
    roughness: 0.55,
  });
  iron.userData.keepEnv = true;
  const steel = [];
  for (const { y, z, x0, x1, hangers } of pipes) {
    steel.push(
      new THREE.CylinderGeometry(PIPE_R, PIPE_R, x1 - x0, 10)
        .rotateZ(Math.PI / 2)
        .translate((x0 + x1) / 2, y, z),
    );
    for (const x of hangers)
      steel.push(
        new THREE.CylinderGeometry(0.035, 0.035, ceilingY - y, 6).translate(
          x,
          (ceilingY + y) / 2,
          z,
        ),
      );
  }

  const bodies = { fresnel: bodyGeometry("fresnel") };
  bodies.profile = bodyGeometry("profile");
  const yoke = yokeGeometry();
  const lensGeometry = new THREE.CircleGeometry(1, 24);
  const lenses = [];
  const pivot = new THREE.Object3D();
  const pan = new THREE.Object3D();
  const out = instruments.map(({ x, pipe, aim, kind = "fresnel" }) => {
    const { y, z } = pipes[pipe];
    pivot.position.set(x, y - DROP, z);
    pivot.lookAt(aim); // +z, the lens, faces the mark
    pivot.updateMatrix();
    pan.position.copy(pivot.position);
    pan.lookAt(aim.x, pivot.position.y, aim.z); // the yoke only pans
    pan.updateMatrix();
    steel.push(
      bodies[kind].clone().applyMatrix4(pivot.matrix),
      yoke.clone().applyMatrix4(pan.matrix),
    );
    const front = kind === "profile" ? 2.31 : 0.96;
    const radius = kind === "profile" ? 0.5 : 0.8;
    const material = new THREE.MeshBasicMaterial({
      color: 0x0d0c0b,
      toneMapped: false,
    });
    const lens = new THREE.Mesh(lensGeometry, material);
    lens.scale.setScalar(radius);
    lens.position.set(0, 0, front).applyMatrix4(pivot.matrix);
    lens.quaternion.copy(pivot.quaternion);
    lenses.push(lens);
    return { lens: lens.position.clone(), material };
  });
  const rig = new THREE.Mesh(soup(steel), iron);
  rig.name = "lighting-rig";
  parent.add(rig, ...lenses);
  return out;
}
