import * as THREE from "three";
import {
  buildCaseRim,
  buildSoundboard,
  buildPlate,
  buildAction,
  buildLegs,
  buildPedals,
  buildLid,
  buildMusicDesk,
} from "./anatomy.js";
import { buildKeyboard } from "./keyboard.js";
import { buildStringSystem, createStringLayout } from "./strings.js";

/**
 * Assemble the full procedural grand piano from its anatomy modules and wire
 * up the exploded-view layout, labels, lid pivot and keyboard lookups.
 *
 * @returns API consumed by main.js and the interaction/audio layers.
 */
export function createPiano(mats, stageTopY) {
  const group = new THREE.Group();
  const stringLayout = createStringLayout();

  const caseRim = buildCaseRim(mats);
  const soundboard = buildSoundboard(mats, stringLayout);
  const plate = buildPlate(mats);
  const strings = buildStringSystem(mats, stringLayout);
  const action = buildAction(mats);
  const legs = buildLegs(mats, stageTopY);
  const pedals = buildPedals(mats);
  const musicDesk = buildMusicDesk(mats);
  const { group: lid, pivot: lidPivot, prop } = buildLid(mats);
  const { group: keyboard, keyMeshes, midiToKey } = buildKeyboard(mats);

  group.add(
    caseRim,
    soundboard,
    plate,
    strings,
    action,
    legs,
    pedals,
    musicDesk,
    lid,
    keyboard,
  );

  // Exploded-view layout: each system separates along its own offset vector.
  const explodeItems = [
    [lid, new THREE.Vector3(-4.6, 3.4, -0.4), "Lid"],
    [strings, new THREE.Vector3(4.2, 2.8, -0.2), "Strings"],
    [plate, new THREE.Vector3(4.0, 1.55, -0.2), "Cast plate"],
    [soundboard, new THREE.Vector3(-4.4, 0.5, -0.2), "Soundboard"],
    [action, new THREE.Vector3(-0.2, 1.9, 3.2), "Action"],
    [keyboard, new THREE.Vector3(0, 0.3, 4.3), "Keyboard"],
    [pedals, new THREE.Vector3(2.4, -0.1, 3.4), "Pedals"],
    [musicDesk, new THREE.Vector3(-2.6, 2.5, 2.4), "Music desk"],
    [legs, new THREE.Vector3(-3.9, 0.1, 2.0), "Legs"],
  ];
  for (const [g, v] of explodeItems) {
    g.userData.base = g.position.clone();
    g.userData.offset = v;
  }

  return {
    group,
    keyMeshes,
    midiToKey,
    lidPivot,
    prop,
    explodeItems,
    // Static reference for raycasting the whole instrument.
    parts: group,
  };
}
