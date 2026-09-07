const NOTE_CODES = new Map([
  ["KeyZ", 0],
  ["KeyS", 1],
  ["KeyX", 2],
  ["KeyD", 3],
  ["KeyC", 4],
  ["KeyV", 5],
  ["KeyG", 6],
  ["KeyB", 7],
  ["KeyH", 8],
  ["KeyN", 9],
  ["KeyJ", 10],
  ["KeyM", 11],
  ["Comma", 12],
  ["KeyL", 13],
  ["Period", 14],
  ["Semicolon", 15],
  ["Slash", 16],
  ["KeyQ", 12],
  ["Digit2", 13],
  ["KeyW", 14],
  ["Digit3", 15],
  ["KeyE", 16],
  ["KeyR", 17],
  ["Digit5", 18],
  ["KeyT", 19],
  ["Digit6", 20],
  ["KeyY", 21],
  ["Digit7", 22],
  ["KeyU", 23],
  ["KeyI", 24],
  ["Digit9", 25],
  ["KeyO", 26],
  ["Digit0", 27],
  ["KeyP", 28],
  ["BracketLeft", 29],
]);

const MIN_MIDI = 21;
const MAX_MIDI = 108;
const MAX_OFFSET = Math.max(...NOTE_CODES.values());

export function isPerformanceTextTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable=''], [contenteditable='true']",
    ),
  );
}

/** Data-driven physical-key input with source tokens stable across octave shifts. */
export function createComputerKeyboard({
  controller,
  onRangeChange = () => {},
}) {
  const activeCodes = new Map();
  let baseMidi = 48; // C3, spans roughly C3–F5 before octave shifting.
  let spaceHeld = false;

  function notifyRange() {
    onRangeChange({
      baseMidi,
      minMidi: baseMidi,
      maxMidi: baseMidi + MAX_OFFSET,
      octave: Math.floor(baseMidi / 12) - 1,
      canShiftDown: baseMidi - 12 >= MIN_MIDI,
      canShiftUp: baseMidi + 12 + MAX_OFFSET <= MAX_MIDI,
    });
  }

  function shiftOctave(direction) {
    const next = baseMidi + direction * 12;
    if (next < MIN_MIDI || next + MAX_OFFSET > MAX_MIDI) return false;
    baseMidi = next;
    notifyRange();
    return true;
  }

  function releaseAll() {
    activeCodes.clear();
    spaceHeld = false;
    controller.releaseSource("computer");
  }

  function onKeyDown(event) {
    if (isPerformanceTextTarget(event.target)) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat || spaceHeld) return;
      spaceHeld = true;
      controller.setSustainForSource("computer:space", true, "computer");
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      if (!event.repeat) shiftOctave(event.code === "ArrowLeft" ? -1 : 1);
      return;
    }
    const offset = NOTE_CODES.get(event.code);
    if (offset === undefined || event.repeat || activeCodes.has(event.code))
      return;
    const midi = baseMidi + offset;
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    event.preventDefault();
    const token = `computer:${event.code}`;
    activeCodes.set(event.code, { midi, token });
    controller.noteOn(midi, 0.72, token, "computer");
  }

  function onKeyUp(event) {
    if (event.code === "Space" && spaceHeld) {
      event.preventDefault();
      spaceHeld = false;
      controller.setSustainForSource("computer:space", false, "computer");
      return;
    }
    const active = activeCodes.get(event.code);
    if (!active) return;
    event.preventDefault();
    activeCodes.delete(event.code);
    controller.noteOff(active.midi, active.token);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
  notifyRange();

  return {
    shiftOctave,
    releaseAll,
    activeTokens: () => [...activeCodes.values()].map(({ token }) => token),
    get range() {
      return { minMidi: baseMidi, maxMidi: baseMidi + MAX_OFFSET };
    },
    get canShiftDown() {
      return baseMidi - 12 >= MIN_MIDI;
    },
    get canShiftUp() {
      return baseMidi + 12 + MAX_OFFSET <= MAX_MIDI;
    },
  };
}
