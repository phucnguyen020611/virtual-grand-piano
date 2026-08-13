/** Routes every note source through one audio + visual-mechanics state model. */
export function createPerformanceController(audio, mechanics) {
  const physicallyHeldNotes = new Set();
  const sustainedReleasedNotes = new Set();
  const timers = new Map();
  let sustain = false;

  function noteOn(midi, velocity = 0.75, source = "performance") {
    if (!Number.isFinite(midi)) return;
    const oldTimer = timers.get(midi);
    if (oldTimer) clearTimeout(oldTimer);
    timers.delete(midi);
    sustainedReleasedNotes.delete(midi);
    physicallyHeldNotes.add(midi);
    mechanics.setNoteHeld(midi, true);
    mechanics.setDamperLifted(midi, true);
    mechanics.strike(midi, velocity);
    audio.noteOn(midi, velocity, source);
  }

  function noteOff(midi, source = "performance") {
    if (!Number.isFinite(midi)) return;
    physicallyHeldNotes.delete(midi);
    mechanics.setNoteHeld(midi, false);
    if (sustain && midi <= mechanics.damperCutoffMidi) {
      sustainedReleasedNotes.add(midi);
      mechanics.setDamperLifted(midi, true);
      return;
    }
    sustainedReleasedNotes.delete(midi);
    mechanics.setDamperLifted(midi, false);
    audio.noteOff(midi, 0.45, source);
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
    source = "playMidi",
  ) {
    noteOn(midi, velocity, source);
    const timer = setTimeout(() => {
      if (timers.get(midi) !== timer) return;
      timers.delete(midi);
      noteOff(midi, source);
    }, duration * 1000);
    timers.set(midi, timer);
  }

  function stopAll() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const midi of new Set([
      ...physicallyHeldNotes,
      ...sustainedReleasedNotes,
      ...audio.activeVoices.keys(),
    ])) {
      mechanics.setNoteHeld(midi, false);
      mechanics.setDamperLifted(midi, false);
      audio.noteOff(midi, 0.25, "stop");
    }
    physicallyHeldNotes.clear();
    sustainedReleasedNotes.clear();
    setSustain(false);
  }

  return {
    noteOn,
    noteOff,
    playMidi,
    setSustain,
    stopAll,
    update: (dt) => mechanics.update(dt),
    physicallyHeldNotes,
    sustainedReleasedNotes,
    get sustain() {
      return sustain;
    },
  };
}
