import * as THREE from "three";
import { DIM } from "./geometry.js";

const HAMMER_ATTACK = 0.036;
const HAMMER_REBOUND = 0.095;

/** Visual mechanism state only: keys, hammers, dampers, and pedal pivots. */
export function createMechanics({
  midiToMechanism,
  actionMechanisms,
  pedalPivots,
}) {
  const notes = new Map();
  let sustain = false;
  const pedalState = new Map([
    ["soft", false],
    ["sostenuto", false],
    ["sustain", false],
  ]);

  for (const [midi, key] of midiToMechanism) {
    notes.set(midi, {
      key,
      action: actionMechanisms.get(midi),
      pressed: false,
      damperLifted: false,
      hammerAge: Infinity,
      velocity: 0.75,
    });
  }

  function get(midi) {
    return notes.get(midi);
  }

  function setNoteHeld(midi, held) {
    const note = get(midi);
    if (!note) return;
    note.pressed = held;
    note.key.key.userData.pressed = held;
  }

  function strike(midi, velocity = 0.75) {
    const note = get(midi);
    if (!note) return;
    note.hammerAge = 0;
    note.velocity = THREE.MathUtils.clamp(velocity, 0.1, 1);
  }

  function setDamperLifted(midi, lifted) {
    const note = get(midi);
    if (note && note.action?.damperPivot) note.damperLifted = lifted;
  }

  function setSustain(down) {
    sustain = down;
    pedalState.set("sustain", down);
  }

  function setPedal(type, down) {
    if (!pedalState.has(type)) return;
    pedalState.set(type, down);
  }

  /** Development-oriented direct lookup for an action/string relationship. */
  function inspectMidi(midi) {
    const note = get(midi);
    if (!note) return null;
    return {
      midi,
      pressed: note.pressed,
      action: note.action,
      stringRoute: note.action?.stringRoute || null,
      strikePoint: note.action?.strikePoint || null,
      damperPoint: note.action?.damperPoint || null,
    };
  }

  function update(dt) {
    for (const note of notes.values()) {
      // Keys rotate around the rear pivot; positive X rotation lowers the
      // player-facing (+Z) front while the rear of the lever rises.
      const keyTarget = note.pressed ? note.key.travelRotation : 0;
      note.key.pivot.rotation.x = THREE.MathUtils.damp(
        note.key.pivot.rotation.x,
        keyTarget,
        25,
        dt,
      );

      if (note.hammerAge !== Infinity) note.hammerAge += dt;
      const attack = HAMMER_ATTACK - note.velocity * 0.009;
      let strikeAmount = 0;
      if (note.hammerAge < attack) {
        strikeAmount = note.hammerAge / attack;
      } else if (note.hammerAge < attack + HAMMER_REBOUND) {
        strikeAmount = 1 - (note.hammerAge - attack) / HAMMER_REBOUND;
      } else {
        note.hammerAge = Infinity;
      }
      if (note.action?.hammerPivot) {
        const hammerTarget = THREE.MathUtils.lerp(
          DIM.hammerRestAngle,
          DIM.hammerStrikeAngle,
          strikeAmount,
        );
        note.action.hammerPivot.rotation.x = THREE.MathUtils.damp(
          note.action.hammerPivot.rotation.x,
          hammerTarget,
          48,
          dt,
        );
      }
      if (note.action?.wippen) {
        note.action.wippen.rotation.x = THREE.MathUtils.damp(
          note.action.wippen.rotation.x,
          note.pressed ? -0.43 : -0.28,
          24,
          dt,
        );
      }
      if (note.action?.capstan) {
        note.action.capstan.position.y = THREE.MathUtils.damp(
          note.action.capstan.position.y,
          DIM.caseTopY - 0.025 + (note.pressed ? 0.035 : 0),
          24,
          dt,
        );
      }
      if (note.action?.damperPivot) {
        const target = sustain || note.damperLifted ? DIM.damperLiftAngle : 0;
        note.action.damperPivot.rotation.x = THREE.MathUtils.damp(
          note.action.damperPivot.rotation.x,
          target,
          18,
          dt,
        );
      }
    }

    for (const [type, pivot] of pedalPivots) {
      const target = pedalState.get(type) ? DIM.pedalTravelAngle : 0;
      pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x, target, 16, dt);
    }
  }

  return {
    damperCutoffMidi: DIM.damperCutoffMidi,
    setNoteHeld,
    setDamperLifted,
    strike,
    setSustain,
    setPedal,
    inspectMidi,
    update,
    get sustain() {
      return sustain;
    },
  };
}
