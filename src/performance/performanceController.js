/**
 * Routes every note source through one audio + visual-mechanics state model.
 * A MIDI remains physically held until its final source token releases it.
 */
export function createPerformanceController(audio, mechanics) {
  const activeSourceTokensByMidi = new Map();
  const physicallyHeldNotes = new Set();
  const sustainedReleasedNotes = new Set();
  const sourceGroups = new Map();
  const timedNotes = new Map();
  let sustain = false;
  let timedSequence = 0;

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
    owners.delete(sourceToken);
    sourceGroups.delete(sourceToken);
    if (owners.size) return;

    activeSourceTokensByMidi.delete(midi);
    physicallyHeldNotes.delete(midi);
    mechanics.setNoteHeld(midi, false);
    if (sustain && midi <= mechanics.damperCutoffMidi && !force) {
      sustainedReleasedNotes.add(midi);
      mechanics.setDamperLifted(midi, true);
      return;
    }
    sustainedReleasedNotes.delete(midi);
    mechanics.setDamperLifted(midi, false);
    audio.noteOff(
      midi,
      force ? 0.25 : 0.45,
      force ? "source-stop" : sourceToken,
    );
  }

  /**
   * A new source may retrigger an already-owned MIDI attack, but its later
   * release cannot affect another source that still owns the same key.
   */
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
    audio.noteOn(midi, velocity);
  }

  function noteOff(midi, sourceToken = "performance") {
    if (!Number.isFinite(midi)) return;
    releaseToken(midi, sourceToken);
  }

  function setSustain(down) {
    if (sustain === down) return;
    sustain = down;
    mechanics.setSustain(down);
    if (down) return;
    for (const midi of [...sustainedReleasedNotes]) {
      if (physicallyHeldNotes.has(midi)) continue;
      sustainedReleasedNotes.delete(midi);
      mechanics.setDamperLifted(midi, false);
      audio.noteOff(midi, 0.65, "sustain-release");
    }
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

  /** Stop only one input family, preserving manual notes owned elsewhere. */
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
  }

  function stopAll() {
    for (const { timer } of timedNotes.values()) clearTimeout(timer);
    timedNotes.clear();
    for (const [midi, owners] of [...activeSourceTokensByMidi]) {
      for (const token of [...owners])
        releaseToken(midi, token, { force: true });
    }
    for (const midi of [...sustainedReleasedNotes]) {
      sustainedReleasedNotes.delete(midi);
      mechanics.setDamperLifted(midi, false);
      audio.noteOff(midi, 0.25, "stop");
    }
    for (const midi of [...audio.activeVoices.keys()]) {
      mechanics.setNoteHeld(midi, false);
      mechanics.setDamperLifted(midi, false);
      audio.noteOff(midi, 0.25, "stop");
    }
    physicallyHeldNotes.clear();
    activeSourceTokensByMidi.clear();
    sourceGroups.clear();
    sustain = false;
    mechanics.setSustain(false);
  }

  return {
    noteOn,
    noteOff,
    playMidi,
    setSustain,
    stopSource,
    stopAll,
    update: (dt) => mechanics.update(dt),
    activeSourceTokensByMidi,
    physicallyHeldNotes,
    sustainedReleasedNotes,
    get sustain() {
      return sustain;
    },
  };
}
