import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
  // Softly radiused edges, as on a real keyboard. Black keys also taper
  // toward the top and slope back at the front, like turned ebony sharps.
  const keyGeometry = ({ width, height, keyLength, isBlack }) => {
    const geometry = new RoundedBoxGeometry(
      width,
      height,
      keyLength,
      2,
      isBlack ? 0.014 : 0.01,
    );
    if (!isBlack) return geometry;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const rise = position.getY(i) / height + 0.5; // 0 at the base, 1 on top
      position.setX(i, position.getX(i) * (1 - 0.24 * rise));
      if (position.getZ(i) > 0)
        position.setZ(i, position.getZ(i) - 0.035 * rise);
    }
    return geometry;
  };
  const whiteGeo = keyGeometry(layout.find((entry) => !entry.isBlack));
  const blackGeo = keyGeometry(layout.find((entry) => entry.isBlack));

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
