import { DIM } from "../piano/geometry.js";
import {
  VELOCITY_LAYERS,
  createImpulseResponse,
  createPedalNoise,
  createSampleManifest,
  midiToFrequency,
  renderFallbackSample,
  validateSampleCoverage,
  velocityLayerWeights,
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
 *   voice -> voiceGain -> voiceFilter -> dry ----> master -> limiter -> ceiling
 *                                              +-> room send       -> convolver -+
 *                                              +-> resonance send  -> convolver -+
 */

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
function releaseSeconds(midi, velocity, age, reason) {
  const registerBase =
    midi < 40 ? 0.62 : midi < 60 ? 0.45 : midi < 84 ? 0.3 : 0.2;
  const energy = velocity * Math.exp(-age / (midi < 40 ? 5.5 : 3.2));
  // A forte bass string needs a little longer felt closure. Pedal-released
  // notes are normally older and therefore close with a quieter, softer tail.
  const ageShape = age < 0.18 ? 0.86 : age > 3 ? 0.9 : 1;
  const pedalShape = reason === "sustain-release" ? 1.14 : 1;
  return registerBase * (0.82 + 0.35 * energy) * ageShape * pedalShape;
}

const MAX_DECODED_BYTES = 56 * 1024 * 1024;
const CORE_ROOTS = new Set([51, 57, 63, 69, 75, 81]);

function bufferBytes(buffer) {
  return buffer.length * buffer.numberOfChannels * 4;
}

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let dry = null;
  let limiter = null;
  let roomGain = null;
  let resonanceGain = null;
  let resonanceExcitationGain = null;
  let resonanceInput = null;
  let pedalGain = null;
  let pedalBuffers = null;
  let analyser = null; // DEV-only output tap for headroom checks
  let disposed = false;

  // Entries retain only decoded working-set buffers. Active AudioBufferSource
  // nodes retain their own references, so eviction never interrupts a note.
  const recordedBuffers = new Map(); // `${rootMidi}:${layer}` -> cache entry
  const fallbackBuffers = new Map(); // generated PCM cache entries
  const pendingLoads = new Map();
  const failedLoads = new Set();
  let cacheEvictions = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  const manifest = createSampleManifest();
  const manifestByKey = new Map(
    manifest.map((entry) => [`${entry.rootMidi}:${entry.layer}`, entry]),
  );
  const coverage = validateSampleCoverage(manifest);
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
    // The close-miked recordings already carry a little natural space.
    roomGain.gain.value = 0.1;

    const resonance = ctx.createConvolver();
    resonance.buffer = createImpulseResponse(ctx, "resonance");
    resonanceGain = ctx.createGain();
    resonanceGain.gain.value = 0.105;
    resonanceInput = ctx.createGain();
    resonanceInput.gain.value = 1;
    resonanceExcitationGain = ctx.createGain();
    // Opening the pedal admits new string energy. Closing it stops new input
    // while the convolver's already-excited tail is allowed to decay.
    resonanceExcitationGain.gain.value = sustain ? 1 : 0;

    pedalGain = ctx.createGain();
    pedalGain.gain.value = 0.055;

    dry.connect(master);
    dry.connect(room);
    resonanceInput.connect(resonanceExcitationGain);
    resonanceExcitationGain.connect(resonance);
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
   * Decode the pinned C3-C6 working set off the realtime path. Outer registers
   * are requested only after they are played, leaving mobile memory for the
   * common keyboard range.
   */
  function loadSamples() {
    if (loading) return loading;
    const orderedRoots = [...CORE_ROOTS].sort(
      (a, b) => Math.abs(a - 63) - Math.abs(b - 63),
    );
    loading = (async () => {
      for (const rootMidi of orderedRoots) {
        if (disposed) return;
        await Promise.all(
          manifest
            .filter((entry) => entry.rootMidi === rootMidi)
            .map((entry) => queueRecordedLoad(entry)),
        );
        ready = recordedBuffers.size > 0;
      }
      ready = recordedBuffers.size > 0;
      if (import.meta.env.DEV && !ready)
        console.warn(
          "No recorded piano samples loaded; the engine stays on generated fallback PCM.",
        );
    })();
    return loading;
  }

  /** Vite resolves BASE_URL, so recorded assets keep working on GitHub Pages. */
  async function fetchSample(url) {
    const response = await fetch(`${import.meta.env.BASE_URL}${url}`);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  }

  function cacheBytes() {
    return [...recordedBuffers.values(), ...fallbackBuffers.values()].reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    );
  }

  function evictCache() {
    while (cacheBytes() > MAX_DECODED_BYTES) {
      const candidates = [
        ...[...recordedBuffers.entries()]
          .filter(([, entry]) => !entry.pinned)
          .map(([key, entry]) => ({ key, entry, cache: recordedBuffers })),
        ...[...fallbackBuffers.entries()].map(([key, entry]) => ({
          key,
          entry,
          cache: fallbackBuffers,
        })),
      ].sort((a, b) => a.entry.lastUsed - b.entry.lastUsed);
      const victim = candidates[0];
      if (!victim) return; // The pinned core is intentionally the floor.
      victim.cache.delete(victim.key);
      cacheEvictions++;
    }
  }

  function touch(entry) {
    entry.lastUsed = performance.now();
    return entry;
  }

  function queueRecordedLoad(entry) {
    const key = `${entry.rootMidi}:${entry.layer}`;
    const cached = recordedBuffers.get(key);
    if (cached) {
      cacheHits++;
      return Promise.resolve(touch(cached).buffer);
    }
    const pending = pendingLoads.get(key);
    if (pending) {
      cacheHits++;
      return pending;
    }
    if (failedLoads.has(key)) return Promise.resolve(null);
    cacheMisses++;
    const promise = fetchSample(entry.url)
      .then((buffer) => {
        if (disposed) return null;
        recordedBuffers.set(key, {
          buffer,
          bytes: bufferBytes(buffer),
          lastUsed: performance.now(),
          pinned: CORE_ROOTS.has(entry.rootMidi),
        });
        // A generated version is unnecessary once a real recording is warm.
        fallbackBuffers.delete(key);
        evictCache();
        return buffer;
      })
      .catch((error) => {
        failedLoads.add(key);
        if (import.meta.env.DEV)
          console.warn(
            "Recorded piano sample unavailable, using generated fallback.",
            entry,
            error,
          );
        return null;
      })
      .finally(() => pendingLoads.delete(key));
    pendingLoads.set(key, promise);
    return promise;
  }

  function renderFallbackBuffer(entry) {
    const pcm = renderFallbackSample(entry, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);
    return buffer;
  }

  function fallbackFor(entry) {
    const key = `${entry.rootMidi}:${entry.layer}`;
    const cached = fallbackBuffers.get(key);
    if (cached) return touch(cached).buffer;
    const buffer = renderFallbackBuffer(entry);
    fallbackBuffers.set(key, {
      buffer,
      bytes: bufferBytes(buffer),
      lastUsed: performance.now(),
    });
    evictCache();
    return buffer;
  }

  function bufferForLayer(root, layer) {
    const key = `${root}:${layer}`;
    const recorded = recordedBuffers.get(key);
    if (recorded)
      return {
        buffer: touch(recorded).buffer,
        root,
        layer,
        backend: "recorded",
      };
    const fallback = fallbackBuffers.get(key);
    if (fallback)
      return {
        buffer: touch(fallback).buffer,
        root,
        layer,
        backend: "fallback",
      };
    return null;
  }

  function sourcesFor(midi, velocity) {
    const root = rootForMidi.get(midi);
    if (root === undefined) return null;
    const weights = velocityLayerWeights(velocity);
    // Request all desired recorded layers, but never await them on noteOn.
    for (const { layer } of weights) {
      const entry = manifestByKey.get(`${root}:${layer}`);
      if (entry) queueRecordedLoad(entry);
    }
    const recorded = weights
      .map(({ layer, weight }) => ({ ...bufferForLayer(root, layer), weight }))
      .filter((sample) => sample.buffer && sample.backend === "recorded");
    const available = recorded.length
      ? recorded
      : weights
          .map(({ layer, weight }) => ({
            ...bufferForLayer(root, layer),
            weight,
          }))
          .filter((sample) => sample.buffer);
    if (!available.length) {
      const preferred = weights.at(-1).layer;
      const key = `${root}:${preferred}`;
      const entry = manifestByKey.get(key);
      const fallback = fallbackFor(entry);
      return [
        {
          buffer: fallback,
          root,
          layer: preferred,
          weight: 1,
          backend: "fallback",
        },
      ];
    }
    const energy = Math.hypot(...available.map((sample) => sample.weight));
    return available.map((sample) => ({
      ...sample,
      weight: sample.weight / energy,
    }));
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
      voice.filter.disconnect();
      voice.resonanceSend.disconnect();
      voice.layerGains.forEach((gain) => gain.disconnect());
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
    for (const source of voice.sources) {
      try {
        source.stop(now + seconds + 0.02);
      } catch {
        /* already stopped */
      }
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
      const victim =
        [...existing].find((voice) => voice.released) || [...existing][0];
      endVoice(victim, 0.08);
      unregister(victim);
    }
    while (voiceCount >= MAX_VOICES && stealVoice());

    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const resonanceSend = ctx.createGain();
    filter.type = "lowpass";
    // Continuous brightness across the whole velocity range, so the boundary
    // between two sample layers is never heard as a step.
    filter.frequency.value = Math.min(
      18000,
      900 + midiToFrequency(midi) * (3 + 9 * Math.pow(level, 1.3)),
    );
    filter.Q.value = 0.4;

    const samples = sourcesFor(midi, level);
    if (!samples?.length) return now;

    const peak = velocityGain(level) * 0.5;
    const recorded = samples.some((sample) => sample.backend === "recorded");
    output.gain.setValueAtTime(recorded ? peak : 0.0001, now);
    // Preserve real hammer transients; generated fallback can use a gentle ramp.
    if (!recorded)
      output.gain.exponentialRampToValueAtTime(
        peak,
        now + 0.004 + 0.008 * (1 - level),
      );

    const sources = [];
    const layerGains = [];
    for (const sample of samples) {
      const source = ctx.createBufferSource(); // one-shot: never reused
      const layerGain = ctx.createGain();
      source.buffer = sample.buffer;
      source.playbackRate.value = Math.pow(2, (midi - sample.root) / 12);
      layerGain.gain.setValueAtTime(sample.weight, now);
      source.connect(layerGain);
      layerGain.connect(filter);
      sources.push(source);
      layerGains.push(layerGain);
    }
    filter.connect(output);
    output.connect(dry);
    // The shared convolver remains bounded; each voice merely controls how
    // much of its own strike excites the undamped-string bed.
    resonanceSend.gain.setValueAtTime(
      0.012 + 0.052 * Math.pow(level, 1.35),
      now,
    );
    output.connect(resonanceSend);
    resonanceSend.connect(resonanceInput);

    const voice = {
      midi,
      sources,
      layerGains,
      output,
      filter,
      resonanceSend,
      startedAt: now,
      velocity: level,
      released: false,
      sampled: recorded,
      backends: samples.map((sample) => sample.backend),
      pendingSources: sources.length,
    };
    for (const source of sources) {
      source.onended = () => {
        voice.pendingSources--;
        if (voice.pendingSources === 0) removeVoice(voice);
      };
      source.start(now);
    }
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
    const now = ctx.currentTime;
    for (const voice of [...set]) {
      if (voice.released) continue;
      const seconds = undamped
        ? Math.max(release, 3.5)
        : Math.max(
            0.08,
            Math.min(
              release,
              releaseSeconds(
                midi,
                voice.velocity,
                now - voice.startedAt,
                reason,
              ),
            ),
          );
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
    const energy = voice.velocity * Math.exp(-age / (voice.midi < 40 ? 5 : 3));
    if (energy < 0.05) return;
    const source = ctx.createBufferSource();
    source.buffer = pedalBuffers.up;
    source.playbackRate.value = 1.28 + (voice.midi - 60) / 75;
    const gain = ctx.createGain();
    const heldShape = age < 0.18 ? 1.22 : age > 3 ? 0.55 : 1;
    const registerShape = voice.midi < 40 ? 1.25 : voice.midi < 72 ? 1 : 0.62;
    gain.gain.value = 0.014 * energy * heldShape * registerShape;
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
    resonanceExcitationGain.gain.cancelScheduledValues(now);
    resonanceExcitationGain.gain.setTargetAtTime(
      down ? 1 : 0,
      now,
      down ? 0.04 : 0.035,
    );
    // Guard against pedal spam building up noise voices.
    if (now - lastPedalAt < 0.06) return;
    lastPedalAt = now;
    const source = ctx.createBufferSource();
    source.buffer = down ? pedalBuffers.down : pedalBuffers.up;
    source.connect(pedalGain);
    source.start(now);
  }

  function dispose() {
    disposed = true;
    if (!ctx) return;
    for (const set of [...activeVoices.values()]) {
      for (const voice of [...set]) {
        try {
          voice.sources.forEach((source) => source.stop());
        } catch {
          /* already stopped */
        }
        removeVoice(voice);
      }
    }
    activeVoices.clear();
    voiceCount = 0;
    recordedBuffers.clear();
    fallbackBuffers.clear();
    pendingLoads.clear();
    failedLoads.clear();
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
      return recordedBuffers.size;
    },
    get maxVoices() {
      return MAX_VOICES;
    },
    sampleForMidi(midi, velocity = 0.75) {
      const rootMidi = rootForMidi.get(midi);
      if (rootMidi === undefined) return null;
      const desired = velocityLayerWeights(velocity);
      const recorded = desired
        .map(({ layer }) => recordedBuffers.get(`${rootMidi}:${layer}`))
        .filter(Boolean);
      const backend =
        recorded.length === desired.length
          ? "recorded"
          : recorded.length
            ? "recorded-single-layer"
            : "fallback";
      return {
        midi,
        rootMidi,
        desiredLayers: desired.map(({ layer, weight }) => ({
          layer: VELOCITY_LAYERS[layer].name,
          weight: +weight.toFixed(3),
        })),
        recordedReady: recorded.length === desired.length,
        backendIfPlayedNow: backend,
        urls: desired.map(
          ({ layer }) => manifestByKey.get(`${rootMidi}:${layer}`).url,
        ),
        semitoneShift: midi - rootMidi,
        playbackRate: Math.pow(2, (midi - rootMidi) / 12),
      };
    },
    cacheStats() {
      return {
        decodedBuffers: recordedBuffers.size + fallbackBuffers.size,
        decodedBytes: cacheBytes(),
        cacheLimitBytes: MAX_DECODED_BYTES,
        pendingLoads: pendingLoads.size,
        evictions: cacheEvictions,
        hits: cacheHits,
        misses: cacheMisses,
      };
    },
    resonanceStats() {
      return {
        sustain,
        targetGain: sustain ? 1 : 0,
        currentGain: resonanceExcitationGain
          ? +resonanceExcitationGain.gain.value.toFixed(3)
          : 0,
        excitationLevel: resonanceGain
          ? +resonanceGain.gain.value.toFixed(3)
          : 0,
      };
    },
    pedalStats() {
      return {
        sustain,
        rateLimited: Boolean(ctx && ctx.currentTime - lastPedalAt < 0.06),
        lastPedalAt,
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
        loadedSamples: recordedBuffers.size,
        fallbackSamples: fallbackBuffers.size,
        totalSamples: manifest.length,
        decodedMB: +(cacheBytes() / 1048576).toFixed(1),
        coverage,
        resonanceGain: resonanceExcitationGain
          ? +resonanceExcitationGain.gain.value.toFixed(3)
          : 0,
        dspSustain: Boolean(resonanceExcitationGain && sustain),
      };
    },
    whenReady: () => loading ?? Promise.resolve(),
  };
}
