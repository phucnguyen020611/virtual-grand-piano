import { DIM } from "../piano/geometry.js";
import {
  VELOCITY_LAYERS,
  createImpulseResponse,
  createPedalNoise,
  createSampleManifest,
  midiToFrequency,
  renderSample,
} from "./pianoSamples.js";

/**
 * Sampled grand piano engine.
 *
 * The performance controller remains the sole owner of note state: this module
 * only reacts to events. noteOff is called by the controller exactly once a
 * MIDI note is fully released by every source, so releasing every voice for
 * that note here is correct rather than a shortcut.
 *
 * Signal path (one shared tail for the whole instrument, never per voice):
 *
 *   voice -> voiceGain -> voiceFilter -> dry --+-> master -> limiter -> ceiling
 *                                              +-> room send   -> convolver -+
 *                                              +-> resonance   -> convolver -+
 */

/**
 * Yield to the event loop without the ~1s clamp browsers apply to timers in a
 * background tab, so the sample set finishes rendering even if the player
 * switches away mid-load.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/**
 * Final safety ceiling. Linear below the knee, so ordinary playing and even a
 * nine-note chord pass through untouched; only an extreme cluster reaches the
 * soft region, where it bends instead of wrapping into digital distortion.
 */
function createCeilingCurve(knee = 0.7) {
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped =
      magnitude <= knee
        ? magnitude
        : knee + (1 - knee) * Math.tanh((magnitude - knee) / (1 - knee));
    curve[i] = Math.sign(x) * shaped;
  }
  return curve;
}

const MAX_VOICES = 64;
const MAX_VOICES_PER_NOTE = 4;

/** Perceptual velocity curve: soft notes stay audible, loud ones keep headroom. */
const velocityGain = (velocity) => 0.06 + 0.94 * Math.pow(velocity, 1.7);

/** Damper closure is quicker in the treble than in the bass. */
function releaseSeconds(midi) {
  if (midi < 40) return 0.55;
  if (midi < 60) return 0.4;
  if (midi < 84) return 0.28;
  return 0.22;
}

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let dry = null;
  let limiter = null;
  let roomGain = null;
  let resonanceGain = null;
  let pedalGain = null;
  let pedalBuffers = null;
  let analyser = null; // DEV-only output tap for headroom checks
  let disposed = false;

  const buffers = new Map(); // `${rootMidi}:${layer}` -> AudioBuffer
  const manifest = createSampleManifest();
  const roots = [...new Set(manifest.map((entry) => entry.rootMidi))].sort(
    (a, b) => a - b,
  );
  /** midi -> nearest root, resolved once. */
  const rootForMidi = new Map();
  for (let midi = 21; midi <= 108; midi++) {
    let best = roots[0];
    for (const root of roots) {
      if (Math.abs(root - midi) < Math.abs(best - midi)) best = root;
    }
    rootForMidi.set(midi, best);
  }

  const activeVoices = new Map(); // midi -> Set<voice>, consumed by the controller
  let voiceCount = 0;
  let sustain = false;
  let ready = false;
  let loading = null;
  let lastPedalAt = -1;

  function ensureAudio() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    // Staged so even a 64-voice fortissimo cluster stays under full scale; the
    // compressor below is a safety net, not the thing holding the level down.
    master.gain.value = 0.34;
    dry = ctx.createGain();
    dry.gain.value = 1;

    // Conservative safety limiter only: a high threshold and a low ratio keep
    // chords out of the clipper without flattening piano dynamics.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    const room = ctx.createConvolver();
    room.buffer = createImpulseResponse(ctx, "room");
    roomGain = ctx.createGain();
    roomGain.gain.value = 0.19; // restrained: attacks stay dry and precise

    const resonance = ctx.createConvolver();
    resonance.buffer = createImpulseResponse(ctx, "resonance");
    resonanceGain = ctx.createGain();
    resonanceGain.gain.value = 0;

    pedalGain = ctx.createGain();
    pedalGain.gain.value = 0.055;

    dry.connect(master);
    dry.connect(room);
    dry.connect(resonance);
    room.connect(roomGain);
    roomGain.connect(master);
    resonance.connect(resonanceGain);
    resonanceGain.connect(master);
    pedalGain.connect(dry);
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = createCeilingCurve();
    ceiling.oversample = "2x";

    master.connect(limiter);
    limiter.connect(ceiling);
    ceiling.connect(ctx.destination);
    if (import.meta.env.DEV) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ceiling.connect(analyser);
    }

    pedalBuffers = {
      down: createPedalNoise(ctx, "down"),
      up: createPedalNoise(ctx, "up"),
    };

    loadSamples();
    return ctx;
  }

  /**
   * Render the sample set off the realtime path. The exposed midrange is built
   * first so the first note a player reaches for is ready soonest; the work is
   * yielded between entries so the render loop keeps running. Until an entry
   * exists the fallback voice covers it, so no keypress is ever silent.
   */
  function loadSamples() {
    if (loading) return loading;
    const ordered = [...manifest].sort(
      (a, b) => Math.abs(a.rootMidi - 64) - Math.abs(b.rootMidi - 64),
    );
    loading = (async () => {
      let sliceStart = performance.now();
      for (const entry of ordered) {
        if (disposed) return;
        try {
          const pcm = entry.url
            ? await fetchSample(entry.url)
            : renderSample(entry, ctx.sampleRate);
          const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
          buffer.getChannelData(0).set(pcm);
          buffers.set(`${entry.rootMidi}:${entry.layer}`, buffer);
        } catch (error) {
          if (import.meta.env.DEV)
            console.warn(
              "Piano sample unavailable, using fallback voice.",
              entry,
              error,
            );
        }
        // Yield on a time budget rather than per entry: background tabs clamp
        // timers to ~1s, and one yield per sample stretched the render out.
        if (performance.now() - sliceStart > 50) {
          await yieldToEventLoop();
          sliceStart = performance.now();
        }
        ready = buffers.size > 0;
      }
      ready = buffers.size > 0;
      if (import.meta.env.DEV && !ready)
        console.warn(
          "No piano samples rendered; the engine stays on fallback voices.",
        );
    })();
    return loading;
  }

  /** Vite resolves BASE_URL, so recorded assets keep working on GitHub Pages. */
  async function fetchSample(url) {
    const response = await fetch(new URL(url, import.meta.env.BASE_URL).href);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
    return decoded.getChannelData(0);
  }

  function layerFor(velocity) {
    let layer = 0;
    for (let i = 0; i < VELOCITY_LAYERS.length; i++) {
      if (velocity >= VELOCITY_LAYERS[i].threshold) layer = i;
    }
    return layer;
  }

  function bufferFor(midi, velocity) {
    const root = rootForMidi.get(midi);
    if (root === undefined) return null;
    const wanted = layerFor(velocity);
    // Fall back through neighbouring layers so a partially rendered set still
    // plays the right pitch rather than dropping to the synth.
    for (const layer of [wanted, wanted - 1, wanted + 1, 0]) {
      const buffer = buffers.get(`${root}:${layer}`);
      if (buffer) return { buffer, root, layer };
    }
    return null;
  }

  /** Free the voice's slot. Idempotent; leaves the nodes alone. */
  function unregister(voice) {
    const set = activeVoices.get(voice.midi);
    if (!set?.delete(voice)) return;
    voiceCount--;
    if (!set.size) activeVoices.delete(voice.midi);
  }

  function removeVoice(voice) {
    unregister(voice);
    try {
      voice.output.disconnect();
    } catch {
      /* already torn down */
    }
  }

  /**
   * Prefer the quietest already-released voice, then the oldest released one,
   * and only take a held voice as a last resort.
   */
  function stealVoice() {
    let victim = null;
    for (const set of activeVoices.values()) {
      for (const voice of set) {
        if (!victim) {
          victim = voice;
          continue;
        }
        const better =
          voice.released !== victim.released
            ? voice.released
            : voice.released
              ? voice.velocity < victim.velocity
              : voice.startedAt < victim.startedAt;
        if (better) victim = voice;
      }
    }
    if (!victim) return false;
    endVoice(victim, 0.06);
    unregister(victim);
    return true;
  }

  function endVoice(voice, seconds) {
    const now = ctx.currentTime;
    voice.output.gain.cancelScheduledValues(now);
    voice.output.gain.setValueAtTime(
      Math.max(voice.output.gain.value, 1e-4),
      now,
    );
    voice.output.gain.exponentialRampToValueAtTime(1e-4, now + seconds);
    try {
      voice.source.stop(now + seconds + 0.02);
    } catch {
      /* already stopped */
    }
    voice.released = true;
  }

  function noteOn(midi, velocity = 0.75) {
    ensureAudio();
    if (ctx.state === "suspended") ctx.resume();
    if (!Number.isFinite(midi)) return ctx.currentTime;
    const level = Math.max(0, Math.min(1, velocity));
    const now = ctx.currentTime;

    // A restruck string keeps ringing; only trim the stack if one note is
    // hogging voices.
    const existing = activeVoices.get(midi);
    if (existing && existing.size >= MAX_VOICES_PER_NOTE) {
      endVoice([...existing][0], 0.12);
    }
    while (voiceCount >= MAX_VOICES && stealVoice());

    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // Continuous brightness across the whole velocity range, so the boundary
    // between two sample layers is never heard as a step.
    filter.frequency.value = Math.min(
      18000,
      900 + midiToFrequency(midi) * (3 + 9 * Math.pow(level, 1.3)),
    );
    filter.Q.value = 0.4;

    const sample = bufferFor(midi, level);
    let source;
    if (sample) {
      source = ctx.createBufferSource(); // one-shot: never reused
      source.buffer = sample.buffer;
      source.playbackRate.value = Math.pow(2, (midi - sample.root) / 12);
    } else {
      source = createFallbackSource(midi, level, now);
    }

    const peak = velocityGain(level) * 0.5;
    output.gain.setValueAtTime(0.0001, now);
    // Harder strikes reach peak marginally faster, softer ones bloom in.
    output.gain.exponentialRampToValueAtTime(
      peak,
      now + 0.004 + 0.008 * (1 - level),
    );

    source.connect(filter);
    filter.connect(output);
    output.connect(dry);
    source.start(now);

    const voice = {
      midi,
      source,
      output,
      filter,
      startedAt: now,
      velocity: level,
      released: false,
      sampled: Boolean(sample),
    };
    source.onended = () => removeVoice(voice);
    let set = activeVoices.get(midi);
    if (!set) activeVoices.set(midi, (set = new Set()));
    set.add(voice);
    voiceCount++;
    return now;
  }

  /**
   * Called by the controller only once every source has released the note, so
   * every voice for this MIDI belongs to a note that is genuinely finished.
   */
  function noteOff(midi, release = 0.45, reason = "release") {
    if (!ctx) return;
    const set = activeVoices.get(midi);
    if (!set?.size) return;
    // C7-C8 carry no dampers, so a key release must not mute them; they simply
    // keep decaying. DIM is the same cutoff the mechanics use.
    const undamped = midi > DIM.damperCutoffMidi;
    const seconds = undamped
      ? Math.max(release, 3.5)
      : Math.max(0.08, Math.min(release, releaseSeconds(midi)));
    for (const voice of [...set]) {
      if (voice.released) continue;
      endVoice(voice, seconds);
      if (!undamped) damperContact(voice, reason);
    }
  }

  /**
   * A damper landing on a live string, not a click: a very quiet filtered
   * burst that scales with register and with how hard the note was struck.
   */
  function damperContact(voice, reason) {
    if (!pedalBuffers || reason === "source-stop") return;
    const age = ctx.currentTime - voice.startedAt;
    const energy = voice.velocity * Math.exp(-age / 3);
    if (energy < 0.05) return;
    const source = ctx.createBufferSource();
    source.buffer = pedalBuffers.up;
    source.playbackRate.value = 1.4 + (voice.midi - 60) / 60;
    const gain = ctx.createGain();
    gain.gain.value = 0.02 * energy * (voice.midi < 60 ? 1.4 : 0.8);
    source.connect(gain);
    gain.connect(dry);
    source.start(ctx.currentTime);
    source.onended = () => gain.disconnect();
  }

  /**
   * Mirrors the controller's pedal state. It never gates the note lifecycle —
   * the controller already decides when a note reaches noteOff — it only opens
   * the undamped string bed and plays the pedal's own mechanical noise.
   */
  function setSustain(down) {
    if (sustain === down) return;
    sustain = down;
    if (!ctx) return;
    const now = ctx.currentTime;
    resonanceGain.gain.cancelScheduledValues(now);
    resonanceGain.gain.setTargetAtTime(
      down ? 0.14 : 0,
      now,
      down ? 0.08 : 0.25,
    );
    // Guard against pedal spam building up noise voices.
    if (now - lastPedalAt < 0.06) return;
    lastPedalAt = now;
    const source = ctx.createBufferSource();
    source.buffer = down ? pedalBuffers.down : pedalBuffers.up;
    source.connect(pedalGain);
    source.start(now);
  }

  /** Compact oscillator voice, used only until a sample exists for the note. */
  function createFallbackSource(midi, velocity, now) {
    const merger = ctx.createGain();
    const f = midiToFrequency(midi);
    for (const [mul, type, level] of [
      [1, "triangle", 0.34],
      [2, "sine", 0.08],
      [3, "sine", 0.03],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f * mul;
      gain.gain.setValueAtTime(level, now);
      gain.gain.setTargetAtTime(level * 0.25, now, 0.9);
      osc.connect(gain);
      gain.connect(merger);
      osc.start(now);
      merger._oscillators = (merger._oscillators || []).concat(osc);
    }
    merger.start = () => {};
    merger.stop = (when) =>
      merger._oscillators.forEach((osc) => osc.stop(when));
    Object.defineProperty(merger, "onended", {
      set(handler) {
        merger._oscillators.at(-1).onended = handler;
      },
      configurable: true,
    });
    return merger;
  }

  function dispose() {
    disposed = true;
    if (!ctx) return;
    for (const set of [...activeVoices.values()]) {
      for (const voice of [...set]) {
        try {
          voice.source.stop();
        } catch {
          /* already stopped */
        }
        removeVoice(voice);
      }
    }
    activeVoices.clear();
    voiceCount = 0;
    buffers.clear();
    ctx.close();
    ctx = null;
  }

  return {
    ensureAudio,
    resume: () => ctx?.resume(),
    noteOn,
    noteOff,
    setSustain,
    dispose,
    freq: midiToFrequency,
    activeVoices,
    get ready() {
      return ready;
    },
    get sustain() {
      return sustain;
    },
    get activeVoiceCount() {
      return voiceCount;
    },
    get loadedSampleCount() {
      return buffers.size;
    },
    get maxVoices() {
      return MAX_VOICES;
    },
    sampleForMidi(midi, velocity = 0.75) {
      const sample = bufferFor(midi, velocity);
      if (!sample) return null;
      return {
        midi,
        rootMidi: sample.root,
        layer: VELOCITY_LAYERS[sample.layer].name,
        semitoneShift: midi - sample.root,
        playbackRate: Math.pow(2, (midi - sample.root) / 12),
        seconds: +sample.buffer.duration.toFixed(2),
      };
    },
    /** DEV only: absolute peak of the current output block, 1.0 = full scale. */
    peakLevel() {
      if (!analyser) return null;
      const block = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(block);
      let peak = 0;
      for (const value of block) peak = Math.max(peak, Math.abs(value));
      return +peak.toFixed(3);
    },
    voiceStats() {
      let released = 0;
      let sampled = 0;
      for (const set of activeVoices.values()) {
        for (const voice of set) {
          if (voice.released) released++;
          if (voice.sampled) sampled++;
        }
      }
      return {
        active: voiceCount,
        released,
        sampled,
        fallback: voiceCount - sampled,
        notes: activeVoices.size,
        maxVoices: MAX_VOICES,
        sustain,
        loadedSamples: buffers.size,
        totalSamples: manifest.length,
        decodedMB: +(
          [...buffers.values()].reduce((sum, b) => sum + b.length * 4, 0) /
          1048576
        ).toFixed(1),
      };
    },
    whenReady: () => loading ?? Promise.resolve(),
  };
}
