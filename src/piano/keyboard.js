import * as THREE from "three";
import { DIM, tag } from "./geometry.js";

const BLACK_PC = new Set([1, 3, 6, 8, 10]);

export function noteName(m) {
  const n = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return n[m % 12] + (Math.floor(m / 12) - 1);
}

/**
 * Build the full 88-key keyboard (A0–C8) seated at the front of the case.
 * White keys sit on the keybed; black keys are shorter, higher and set back.
 * Returns the group plus lookup structures used by audio and interaction.
 */
export function buildKeyboard(mats) {
  const group = new THREE.Group();
  const keyMeshes = [];
  const midiToKey = new Map();

  const allMidis = Array.from({ length: 88 }, (_, i) => 21 + i);
  const whiteW = DIM.keyboardWidth / 52;
  const half = DIM.keyboardWidth / 2;

  // Assign each white key an X slot; black keys interpolate between neighbours.
  const whiteX = new Map();
  let wi = 0;
  for (const midi of allMidis) {
    if (!BLACK_PC.has(midi % 12)) {
      whiteX.set(midi, -half + whiteW / 2 + wi * whiteW);
      wi++;
    }
  }

  const whiteGeo = new THREE.BoxGeometry(whiteW * 0.92, 0.09, 1.02);
  const blackGeo = new THREE.BoxGeometry(whiteW * 0.56, 0.12, 0.64);
  const whiteFrontZ = 3.05; // key fronts overhang the case front edge
  const blackFrontZ = 2.56;

  for (const midi of allMidis) {
    const isBlack = BLACK_PC.has(midi % 12);
    let x;
    if (!isBlack) x = whiteX.get(midi);
    else {
      let prev = midi - 1;
      while (!whiteX.has(prev)) prev--;
      let next = midi + 1;
      while (!whiteX.has(next)) next++;
      x = (whiteX.get(prev) + whiteX.get(next)) / 2;
    }

    const key = new THREE.Mesh(
      isBlack ? blackGeo : whiteGeo,
      isBlack ? mats.ebony : mats.ivory,
    );
    const restY = isBlack ? DIM.blackKeyTopY : DIM.whiteKeyTopY;
    const z = isBlack ? blackFrontZ - 0.32 : whiteFrontZ - 0.51;
    key.position.set(x, restY, z);
    key.castShadow = key.receiveShadow = true;
    key.userData = {
      pianoKey: true,
      midi,
      isBlack,
      restY,
      pressed: false,
      partName: `${noteName(midi)} key`,
      partText:
        "Playable piano key. Click it or use the mapped computer keyboard.",
      partCategory: "Keyboard",
      inspectable: true,
    };
    group.add(key);
    keyMeshes.push(key);
    midiToKey.set(midi, key);
  }

  tag(
    group,
    "88-key keyboard",
    "Full 88-key geometry from A0 to C8. A central range maps to the computer keyboard; every visible key is mouse/touch playable.",
    "Interface",
  );

  return { group, keyMeshes, midiToKey, whiteW };
}
