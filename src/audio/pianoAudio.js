/**
 * Lightweight Web Audio piano synthesizer. No external samples: each note is a
 * small additive voice with a hammer transient, low-pass tone shaping, a
 * compressor and a short delay bus. Visual state is owned by piano mechanics.
 */
export function createAudioEngine() {
  let audioCtx = null,
    master = null,
    compressor = null,
    delay = null,
    feedback = null;
  const activeVoices = new Map();

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0.34;
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 4;
    delay = audioCtx.createDelay(0.8);
    delay.delayTime.value = 0.19;
    feedback = audioCtx.createGain();
    feedback.gain.value = 0.18;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.16;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(compressor);
    master.connect(compressor);
    master.connect(delay);
    compressor.connect(audioCtx.destination);
  }

  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function noteOn(midi, velocity = 0.75) {
    ensureAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();
    noteOff(midi);
    const now = audioCtx.currentTime,
      f = freq(midi),
      bus = audioCtx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(
      Math.max(0.025, velocity),
      now + 0.012,
    );
    bus.gain.exponentialRampToValueAtTime(
      Math.max(0.012, velocity * 0.33),
      now + 0.36,
    );
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(7600, 2200 + f * 6);
    filter.Q.value = 0.7;
    bus.connect(filter);
    filter.connect(master);
    const oscs = [];
    [
      [1, "triangle", 0.34],
      [2, "sine", 0.09],
      [3, "sine", 0.035],
    ].forEach(([mul, type, level]) => {
      const o = audioCtx.createOscillator(),
        g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = (Math.random() - 0.5) * 3;
      g.gain.value = level;
      o.connect(g);
      g.connect(bus);
      o.start(now);
      oscs.push(o);
    });
    // Short hammer transient.
    const transient = audioCtx.createOscillator(),
      tg = audioCtx.createGain();
    transient.type = "sine";
    transient.frequency.value = Math.min(5000, f * 7);
    tg.gain.setValueAtTime(0.045 * velocity, now);
    tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    transient.connect(tg);
    tg.connect(master);
    transient.start(now);
    transient.stop(now + 0.04);
    activeVoices.set(midi, { oscs, bus });
    return now;
  }

  function noteOff(midi, release = 0.8) {
    const v = activeVoices.get(midi);
    if (!v) return;
    const now = audioCtx.currentTime;
    v.bus.gain.cancelScheduledValues(now);
    v.bus.gain.setTargetAtTime(0.0001, now, release * 0.16);
    v.oscs.forEach((o) => o.stop(now + Math.max(0.18, release)));
    activeVoices.delete(midi);
  }

  return { ensureAudio, noteOn, noteOff, freq, activeVoices };
}
