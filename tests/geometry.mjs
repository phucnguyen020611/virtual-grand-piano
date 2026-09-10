import assert from "node:assert/strict";
import * as THREE from "three";
import { DIM, outerFootprint } from "../src/piano/geometry.js";
import { buildKeyboard } from "../src/piano/keyboard.js";
import { buildPedals, buildLid } from "../src/piano/anatomy.js";
import { createMechanics } from "../src/piano/mechanics.js";

const material = new THREE.MeshStandardMaterial();
const mats = {
  ivory: material,
  ebony: material,
  gold: material,
  blackSatin: material,
  blackLacquer: material,
};
const keyboard = buildKeyboard(mats);
const pedals = buildPedals(mats);
const mechanics = createMechanics({
  ...keyboard,
  ...pedals,
  actionMechanisms: new Map(),
});
const bounds = new THREE.Box3();
const rest = new Map();
for (const entry of keyboard.layout) {
  const mesh = keyboard.midiToKey.get(entry.midi);
  assert.equal(mesh.geometry.parameters.width, entry.width);
  assert.equal(mesh.geometry.parameters.depth, entry.keyLength);
  mesh.updateWorldMatrix(true, false);
  rest.set(
    entry.midi,
    new THREE.Vector3(0, entry.height / 2, entry.keyLength / 2).applyMatrix4(
      mesh.matrixWorld,
    ),
  );
  mechanics.setNoteHeld(entry.midi, true);
}
// Hold all 88 keys for one simulated minute, checking the rendered mesh bounds.
for (let frame = 0; frame < 3600; frame++) {
  mechanics.update(1 / 60);
  for (const mesh of keyboard.keyMeshes) {
    bounds.setFromObject(mesh);
    assert(
      bounds.min.y > DIM.keybedTopY,
      `${mesh.userData.midi} penetrates keybed`,
    );
  }
}
for (const entry of keyboard.layout) {
  const mesh = keyboard.midiToKey.get(entry.midi);
  mesh.updateWorldMatrix(true, false);
  const front = new THREE.Vector3(
    0,
    entry.height / 2,
    entry.keyLength / 2,
  ).applyMatrix4(mesh.matrixWorld);
  const dip = rest.get(entry.midi).y - front.y;
  assert(dip >= DIM.keyDip && dip < DIM.keyDip + 0.001);
  mechanics.setNoteHeld(entry.midi, false);
}
for (let i = 0; i < 180; i++) mechanics.update(1 / 60);
for (const { pivot } of keyboard.midiToMechanism.values())
  assert(Math.abs(pivot.rotation.x) < 1e-10);
console.log(
  "PASS all 88 held keys: bounded ~10mm dip, keybed clearance, full return",
);

for (const [type, pivot] of pedals.pedalPivots) {
  const [arm, toe] = pivot.children;
  const armBox = new THREE.Box3().setFromObject(arm);
  const toeBox = new THREE.Box3().setFromObject(toe);
  assert(armBox.intersectsBox(toeBox), `${type} toe detached from arm`);
  const size = toeBox.getSize(new THREE.Vector3());
  assert(
    size.z > size.x && size.x > size.y * 3,
    "pedal must be a horizontal plate",
  );
  mechanics.setPedal(type, true);
}
for (let i = 0; i < 180; i++) mechanics.update(1 / 60);
for (const pivot of pedals.pedalPivots.values()) {
  bounds.setFromObject(pivot);
  assert(bounds.min.y > 0, "pedal crossed floor");
}
console.log(
  "PASS three connected horizontal pedal plates, depressed floor clearance",
);

const lid = buildLid(mats);
for (const angle of [0, 0.1, 0.2, DIM.lidOpenAngle]) {
  lid.setAngle(angle);
  lid.group.updateMatrixWorld(true);
  const base = new THREE.Vector3(0, -0.5, 0).applyMatrix4(lid.prop.matrixWorld);
  const top = new THREE.Vector3(0, 0.5, 0).applyMatrix4(lid.prop.matrixWorld);
  assert(base.distanceTo(new THREE.Vector3(3.7, 1.43, -0.2)) < 1e-8);
  const attachment = new THREE.Vector3(7.05, 0, -0.2).applyMatrix4(
    lid.pivot.matrixWorld,
  );
  assert(top.distanceTo(attachment) < 1e-8);
}
lid.setAngle(0);
const closed = new THREE.Box3().setFromObject(lid.pivot);
assert(closed.min.y > DIM.caseTopY + 0.02, "closed lid clips rim trim");
assert(closed.max.z < 1.48, "closed lid extends into music desk");
const outline = outerFootprint()
  .getPoints(48)
  .filter((p) => p.y >= -1.45);
for (const p of outline)
  assert(p.x >= closed.min.x && p.x <= closed.max.x && -p.y >= closed.min.z);
console.log(
  "PASS lid contour, closed trim clearance, prop attachment throughout travel",
);

const { createBench } = await import("../src/scene/bench.js");
const bench = createBench(mats, -0.045);
const benchBounds = new THREE.Box3().setFromObject(bench);
assert(Math.abs(benchBounds.min.y + 0.045) < 1e-6);
assert(benchBounds.max.y < DIM.whiteKeyTopY);
assert(benchBounds.min.z > 3.05 + 1.2, "bench blocks exploded key fronts");
console.log("PASS grounded bench with seat below keys and exploded clearance");
