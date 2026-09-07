/**
 * Routes every performance source through one audio + visual-mechanics model.
 * Tokens belong to the input that created them; sustain has the same ownership
 * rule so a hardware pedal cannot lift a computer keyboard's held Space key.
 */
export function createPerformanceController(audio, mechanics, resonance) {
  const activeSourceTokensByMidi = new Map();
  const physicallyHeldNotes = new Set();
  const sustainedReleasedNotes = new Set();
  const sourceGroups = new Map();
  const timedNotes = new Map();
  const sustainOwners = new Set();
  const sustainSourceGroups = new Map();
  const observers = new Set();
  let sustain = false;
  let timedSequence = 0;

  function emit(event) {
    for (const observer of observers) observer(event);
  }

  function ownersFor(midi) {
    let owners = activeSourceTokensByMidi.get(midi);
    if (!owners) {
      owners = new Set();
      activeSourceTokensByMidi.set(midi, owners);
    }
    return owners;
  }

  function releaseToken(midi, sourceToken, { force = false } = {}) {
    const owners = activeSourceTokensByMidi.get(midi);
    if (!owners?.has(sourceToken)) return;
    const sourceGroup = sourceGroups.get(sourceToken);
    owners.delete(sourceToken);
    sourceGroups.delete(sourceToken);
    emit({ type: "noteOff", midi, sourceToken, sourceGroup });
    if (owners.size) return;

    activeSourceTokensByMidi.delete(midi);
    physicallyHeldNotes.delete(midi);
    mechanics.setNoteHeld(midi, false);
    if (sustain && midi <= mechanics.damperCutoffMidi && !force) {
      sustainedReleasedNotes.add(midi);
      mechanics.setDamperLifted(midi, true);
      resonance.setDamperOpen(midi, true);
      return;
    }
    sustainedReleasedNotes.delete(midi);
    mechanics.setDamperLifted(midi, false);
    resonance.setDamperOpen(midi, false);
    audio.noteOff(
      midi,
      force ? 0.25 : 0.45,
      force ? "source-stop" : sourceToken,
    );
  }

  /** A new source may retrigger an already-owned MIDI without affecting others. */
  function noteOn(
    midi,
    velocity = 0.75,
    sourceToken = "performance",
    sourceGroup = sourceToken,
  ) {
    if (!Number.isFinite(midi)) return;
    const owners = ownersFor(midi);
    owners.add(sourceToken);
    sourceGroups.set(sourceToken, sourceGroup);
    sustainedReleasedNotes.delete(midi);
    physicallyHeldNotes.add(midi);
    mechanics.setNoteHeld(midi, true);
    mechanics.setDamperLifted(midi, true);
    mechanics.strike(midi, velocity);
    resonance.setDamperOpen(midi, true);
    resonance.strike(midi, velocity);
    audio.noteOn(midi, velocity);
    emit({ type: "noteOn", midi, velocity, sourceToken, sourceGroup });
  }

  function noteOff(midi, sourceToken = "performance") {
    if (!Number.isFinite(midi)) return;
    releaseToken(midi, sourceToken);
  }

  function applySustain(down) {
    if (sustain === down) return;
    sustain = down;
    mechanics.setSustain(down);
    resonance.setSustain(down);
    audio.setSustain(down);
    if (down) return;
    for (const midi of [...sustainedReleasedNotes]) {
      if (physicallyHeldNotes.has(midi)) continue;
      sustainedReleasedNotes.delete(midi);
      mechanics.setDamperLifted(midi, false);
      resonance.setDamperOpen(midi, false);
      audio.noteOff(midi, 0.65, "sustain-release");
    }
  }

  function setSustainForSource(sourceToken, down, sourceGroup = sourceToken) {
    const wasDown = sustainOwners.has(sourceToken);
    if (down === wasDown) return;
    if (down) {
      sustainOwners.add(sourceToken);
      sustainSourceGroups.set(sourceToken, sourceGroup);
    } else {
      sustainOwners.delete(sourceToken);
      sustainSourceGroups.delete(sourceToken);
    }
    emit({ type: "sustain", down, sourceToken, sourceGroup });
    applySustain(sustainOwners.size > 0);
  }

  /** Backward-compatible default source for existing callers. */
  function setSustain(down) {
    setSustainForSource("performance:pedal", down, "performance");
  }

  function playMidi(
    midi,
    duration = 0.55,
    velocity = 0.7,
    sourceGroup = "playMidi",
  ) {
    const sourceToken = `${sourceGroup}:timed-${++timedSequence}`;
    noteOn(midi, velocity, sourceToken, sourceGroup);
    const timer = setTimeout(() => {
      timedNotes.delete(sourceToken);
      noteOff(midi, sourceToken);
    }, duration * 1000);
    timedNotes.set(sourceToken, { timer, midi, sourceGroup });
    return sourceToken;
  }

  /** Stop only one input family, preserving unrelated held notes and pedals. */
  function stopSource(sourceGroup) {
    for (const [token, timed] of [...timedNotes]) {
      if (timed.sourceGroup !== sourceGroup) continue;
      clearTimeout(timed.timer);
      timedNotes.delete(token);
    }
    for (const [midi, owners] of [...activeSourceTokensByMidi]) {
      for (const token of [...owners]) {
        if (sourceGroups.get(token) === sourceGroup)
          releaseToken(midi, token, { force: true });
      }
    }
    for (const [token, group] of [...sustainSourceGroups]) {
      if (group === sourceGroup) setSustainForSource(token, false, group);
    }
  }

  function stopAll() {
    for (const { timer } of timedNotes.values()) clearTimeout(timer);
    timedNotes.clear();
    for (const [midi, owners] of [...activeSourceTokensByMidi]) {
      for (const token of [...owners])
        releaseToken(midi, token, { force: true });
    }
    for (const token of [...sustainOwners]) setSustainForSource(token, false);
    for (const midi of [...sustainedReleasedNotes]) {
      sustainedReleasedNotes.delete(midi);
      mechanics.setDamperLifted(midi, false);
      resonance.setDamperOpen(midi, false);
      audio.noteOff(midi, 0.25, "stop");
    }
    for (const midi of [...audio.activeVoices.keys()]) {
      mechanics.setNoteHeld(midi, false);
      mechanics.setDamperLifted(midi, false);
      resonance.setDamperOpen(midi, false);
      audio.noteOff(midi, 0.25, "stop");
    }
    physicallyHeldNotes.clear();
    activeSourceTokensByMidi.clear();
    sourceGroups.clear();
    sustainOwners.clear();
    sustainSourceGroups.clear();
    applySustain(false);
  }

  return {
    noteOn,
    noteOff,
    playMidi,
    setSustain,
    setSustainForSource,
    stopSource,
    stopAll,
    addObserver(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    update: (dt) => {
      mechanics.update(dt);
      resonance.update(dt);
    },
    activeSourceTokensByMidi,
    physicallyHeldNotes,
    sustainedReleasedNotes,
    sustainOwners,
    get sustain() {
      return sustain;
    },
  };
}
