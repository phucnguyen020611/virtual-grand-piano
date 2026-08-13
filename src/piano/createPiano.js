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
import { createKeyboardLayout } from "./keyboardLayout.js";
import { buildStringSystem, createStringLayout } from "./strings.js";

/**
 * Assemble the full procedural grand piano and expose component metadata for
 * the separate exploded-view controller.
 *
 * @returns API consumed by main.js and the interaction/audio layers.
 */
export function createPiano(mats, stageTopY) {
  const group = new THREE.Group();
  const stringLayout = createStringLayout();
  const keyboardLayout = createKeyboardLayout();

  const caseRim = buildCaseRim(mats);
  const soundboard = buildSoundboard(mats, stringLayout);
  const plate = buildPlate(mats);
  const strings = buildStringSystem(mats, stringLayout);
  const { group: action, midiToMechanism: actionMechanisms } = buildAction(
    mats,
    keyboardLayout,
    stringLayout.routes,
  );
  const legs = buildLegs(mats, stageTopY);
  const { group: pedals, pedalPivots } = buildPedals(mats);
  const musicDesk = buildMusicDesk(mats);
  const { group: lid, pivot: lidPivot, prop } = buildLid(mats);
  const {
    group: keyboard,
    keyMeshes,
    midiToKey,
    midiToMechanism,
  } = buildKeyboard(mats, keyboardLayout);

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

  const explodedComponents = [
    {
      id: "rim",
      label: "Rim & case",
      object: caseRim,
      priority: 10,
      anchor: "top",
    },
    { id: "soundboard", label: "Soundboard", object: soundboard, priority: 7 },
    { id: "plate", label: "Cast plate", object: plate, priority: 8 },
    { id: "strings", label: "Strings", object: strings, priority: 9 },
    { id: "action", label: "Action", object: action, priority: 6 },
    { id: "musicDesk", label: "Music desk", object: musicDesk, priority: 3 },
    { id: "lid", label: "Lid", object: lid, priority: 4 },
    { id: "keyboard", label: "Keyboard", object: keyboard, priority: 5 },
    { id: "pedals", label: "Pedal lyre", object: pedals, priority: 2 },
    { id: "legs", label: "Legs & casters", object: legs, priority: 1 },
  ];

  return {
    group,
    keyMeshes,
    midiToKey,
    keyboardLayout,
    midiToMechanism,
    actionMechanisms,
    pedalPivots,
    lidPivot,
    prop,
    explodedComponents,
    // Static reference for raycasting the whole instrument.
    parts: group,
  };
}
