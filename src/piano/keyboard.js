import * as THREE from "three";
import { tag } from "./geometry.js";
import { createKeyboardLayout } from "./keyboardLayout.js";

export function noteName(m) {
  const n = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return n[m % 12] + (Math.floor(m / 12) - 1);
}

/**
 * Build the full 88-key keyboard (A0–C8) seated at the front of the case.
 * White keys sit on the keybed; black keys are shorter, higher and set back.
 * Returns the group plus lookup structures used by audio and interaction.
 */
export function buildKeyboard(mats, layout = createKeyboardLayout()) {
  const group = new THREE.Group();
  const keyMeshes = [];
  const midiToKey = new Map();
  const midiToMechanism = new Map();
  const whiteGeo = new THREE.BoxGeometry(layout[0].width, 0.09, 1.02);
  const blackGeo = new THREE.BoxGeometry(layout[0].width * 0.56, 0.12, 0.64);

  for (const entry of layout) {
    const pivot = new THREE.Group();
    pivot.position.set(entry.x, entry.restY, entry.pivotZ);
    const key = new THREE.Mesh(
      entry.isBlack ? blackGeo : whiteGeo,
      entry.isBlack ? mats.ebony : mats.ivory,
    );
    key.position.z = entry.centerZ - entry.pivotZ;
    key.castShadow = key.receiveShadow = true;
    key.userData = {
      pianoKey: true,
      midi: entry.midi,
      isBlack: entry.isBlack,
      pressed: false,
      partName: `${noteName(entry.midi)} key`,
      partText:
        "Playable piano key. Click it or use the mapped computer keyboard.",
      partCategory: "Keyboard",
      inspectable: true,
    };
    pivot.add(key);
    group.add(pivot);
    keyMeshes.push(key);
    midiToKey.set(entry.midi, key);
    midiToMechanism.set(entry.midi, {
      pivot,
      key,
      travelRotation: entry.travelRotation,
    });
  }

  tag(
    group,
    "88-key keyboard",
    "Full 88-key geometry from A0 to C8. A central range maps to the computer keyboard; every visible key is mouse/touch playable.",
    "Interface",
  );

  return { group, keyMeshes, midiToKey, midiToMechanism, layout };
}
