import { DIM } from "../piano/geometry.js";
import {
  VELOCITY_LAYERS,
  createCrowdMurmur,
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
const ROOMS = ["hall", "salon"]; // see createImpulseResponse
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

// ponytail: pointer type stands in for device memory; phones keep 56 MB.
const COARSE_POINTER =
  globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
const MAX_DECODED_BYTES = (COARSE_POINTER ? 56 : 160) * 1024 * 1024;
const CORE_ROOTS = new Set([45, 51, 57, 63, 69, 75, 81]);
// Denser C/F# roots across the default keyboard range. Desktop decodes them
// after the pinned core; they stay evictable, and a warm neighbour root covers
// any that is cold, so they only ever improve on the core's ±3 coverage.
const DETAIL_ROOTS = COARSE_POINTER ? [] : [60, 66, 54, 72, 48, 78];
// Then the medium capture of every root outside the core, treble first (it is
// short, ~8.5 MiB for all nine) and the long bass after (~34 MiB): one real
// recording per root, so neither end of the keyboard opens on generated PCM.
const OUTER_ROOTS = COARSE_POINTER
  ? []
  : [84, 87, 90, 93, 96, 99, 102, 105, 108, 42, 39, 36, 33, 30, 27, 24, 21];

const clampUnit = (v, lo = 0) => Math.min(1, Math.max(lo, v));

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
  let finalStage = null; // what reaches the speakers
  let capture = null; // a tap of it for saving takes
  const effects = new Map(); // url -> decoded hall sound
  // Where the listener sits: tone and level of the direct sound, and where
  // the piano's two ends are, as heard (see setListener).
  let seatTone = null;
  let seatGain = null;
  let ends = null; // [bass, treble] PannerNodes
  let room = null; // the convolver of the room the piano is in…
  let roomInput = null; // …and what feeds it (the piano and the house)
  // The house: its murmur and its applause, from where the audience sits.
  let crowdInput = null;
  let crowdTone = null; // closed doors muffle it
  let crowdEnds = null; // [left, right] PannerNodes
  let murmurGain = null;
  const crowdState = { murmur: -1, muffled: -1 };
  let roomName = "hall"; // …and its name
  const rooms = {}; // name -> impulse response
  const heard = { bass: [0, 0, 0], treble: [0, 0, 0] }; // as last given
  const seat = {
    distance: 0,
    bass: [-1, 0, -1],
    treble: [1, 0, -1],
    gain: 1,
    cutoff: 20000,
    room: 0.1,
    crowd: [
      [-1, 0, -1],
      [1, 0, -1],
    ],
  };
  let disposed = false;

  // Entries retain only decoded working-set buffers. Active AudioBufferSource
  // nodes retain their own references, so eviction never interrupts a note.
  const recordedBuffers = new Map(); // `${rootMidi}:${layer}` -> cache entry
  const fallbackBuffers = new Map(); // generated PCM cache entries
  const pendingLoads = new Map();
  const failedLoads = new Map();
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
  /** midi -> the three nearest roots (nearest first), resolved once. */
  const rootCandidates = new Map();
  const rootForMidi = new Map();
  for (let midi = 21; midi <= 108; midi++) {
    const nearest = [...roots]
      .sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi) || a - b)
      .slice(0, 3);
    rootCandidates.set(midi, nearest);
    rootForMidi.set(midi, nearest[0]);
  }

  const activeVoices = new Map(); // midi -> Set<voice>, consumed by the controller
  let voiceCount = 0;
  let physicalSourceCount = 0;
  let sustain = false;
  let soft = false; // una corda: new notes strike two strings of three
  let ready = false;
  let loading = null;
  let lastPedalAt = -1;
  let lastDamperAt = -1;
  let fallbackWarmup = null;

  function ensureAudio() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
      sampleRate: 48000,
    });

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

    for (const name of ROOMS) rooms[name] = createImpulseResponse(ctx, name);
    room = ctx.createConvolver();
    room.buffer = rooms[roomName];
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

    // The direct sound (and the strings' own resonance) reaches the seat
    // through the air: duller, quieter and narrower with distance, while the
    // room's reverberation stays and so takes over toward the back.
    seatTone = ctx.createBiquadFilter();
    seatTone.type = "lowpass";
    seatTone.Q.value = 0.5;
    seatGain = ctx.createGain();
    // The recordings' left and right (bass and treble, from the player's
    // bench) come from the two ends of the piano, placed in 3D round the
    // listener's head (HRTF): on headphones, in front or behind, above or
    // below, and turning with the camera. Mono fallback samples feed both.
    seatGain.channelCount = 2;
    seatGain.channelCountMode = "explicit";
    // A stereo source's left and right, each from its own place round the
    // head (distance is the gains' and filters' job, not the panners').
    const placed = (stereo) => {
      const split = ctx.createChannelSplitter(2);
      stereo.connect(split);
      return [0, 1].map((channel) => {
        const panner = new PannerNode(ctx, {
          panningModel: "HRTF",
          rolloffFactor: 0,
          channelCount: 1,
          channelCountMode: "explicit",
        });
        split.connect(panner, channel);
        panner.connect(master);
        return panner;
      });
    };
    dry.connect(seatTone);
    seatTone.connect(seatGain);
    ends = placed(seatGain);
    roomInput = ctx.createGain();
    dry.connect(roomInput);
    roomInput.connect(room);

    // The house: the left and right halves of the stalls, and the room.
    crowdInput = ctx.createGain();
    crowdInput.channelCount = 2;
    crowdInput.channelCountMode = "explicit";
    crowdTone = ctx.createBiquadFilter();
    crowdTone.type = "lowpass";
    crowdTone.frequency.value = 20000;
    crowdInput.connect(crowdTone);
    crowdEnds = placed(crowdTone);
    const crowdRoom = ctx.createGain();
    crowdRoom.gain.value = 0.5;
    crowdTone.connect(crowdRoom);
    crowdRoom.connect(roomInput);
    murmurGain = ctx.createGain();
    murmurGain.gain.value = 0;
    const murmur = ctx.createBufferSource();
    murmur.buffer = createCrowdMurmur(ctx);
    murmur.loop = true;
    murmur.connect(murmurGain);
    murmurGain.connect(crowdInput);
    murmur.start();
    resonanceInput.connect(resonanceExcitationGain);
    resonanceExcitationGain.connect(resonance);
    room.connect(roomGain);
    roomGain.connect(master);
    resonance.connect(resonanceGain);
    resonanceGain.connect(seatTone);
    pedalGain.connect(dry);
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = createCeilingCurve();
    ceiling.oversample = "2x";

    master.connect(limiter);
    limiter.connect(ceiling);
    ceiling.connect(ctx.destination);
    finalStage = ceiling;
    if (import.meta.env.DEV) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ceiling.connect(analyser);
    }

    pedalBuffers = {
      down: createPedalNoise(ctx, "down"),
      up: createPedalNoise(ctx, "up"),
    };

    applySeat(true);
    loadSamples();
    return ctx;
  }

  function applySeat(instant = false) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [param, value, lag = 0.12] of [
      [seatGain.gain, seat.gain],
      [seatTone.frequency, seat.cutoff],
      [roomGain.gain, seat.room],
      ...[
        [ends[0], seat.bass],
        [ends[1], seat.treble],
        [crowdEnds[0], seat.crowd[0]],
        [crowdEnds[1], seat.crowd[1]],
      ].flatMap(([panner, at]) =>
        ["positionX", "positionY", "positionZ"].map((axis, i) => [
          panner[axis],
          at[i],
          0.04, // the image keeps up with a turning head
        ]),
      ),
    ])
      if (instant) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, lag);
  }

  /**
   * The listener's place: `distance` from the piano in scene units (~0.21 m),
   * and the piano's `bass` and `treble` ends as [x, y, z] seen from the
   * listener's head (x right, y up, looking along -z). At the keyboard the
   * sound is close and dry; at the back of the stalls ~45% as loud, rolled
   * off above ~5 kHz, with three to four times the room; and the two ends
   * close together, as a piano far off sounds narrow. `crowd`: the left and
   * right halves of the audience, seen the same way.
   */
  function setListener(distance, bass, treble, crowd = seat.crowd) {
    const moved = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) > 0.05;
    if (
      Math.abs(distance - seat.distance) < 0.5 &&
      !moved(bass, heard.bass) &&
      !moved(treble, heard.treble) &&
      !moved(crowd[0], seat.crowd[0]) &&
      !moved(crowd[1], seat.crowd[1])
    )
      return;
    seat.crowd = crowd.map((at) => [...at]);
    heard.bass = [...bass];
    heard.treble = [...treble];
    const t = clampUnit((distance - 10) / 90);
    seat.distance = distance;
    // Seen end-on the piano's two ends line up; but a piano close by sounds
    // wide. So they keep at least ±25° apart near it, ±5° far off, each on
    // its own side, about the direction between them.
    const azimuth = (p) => Math.atan2(p[0], -p[2]);
    // (The difference taken the short way round, should it be behind.)
    const turn = azimuth(treble) - azimuth(bass);
    const half = Math.atan2(Math.sin(turn), Math.cos(turn)) / 2;
    const mid = azimuth(bass) + half;
    const spread = Math.max(Math.abs(half), (Math.PI / 180) * (25 - 20 * t));
    const place = (p, angle) => {
      const across = Math.hypot(p[0], p[2]);
      return [across * Math.sin(angle), p[1], -across * Math.cos(angle)];
    };
    const side = Math.sign(half) || 1;
    seat.bass = place(bass, mid - side * spread);
    seat.treble = place(treble, mid + side * spread);
    seat.gain = 1 - 0.55 * t ** 0.8;
    seat.cutoff = 20000 * 0.25 ** t;
    seat.room = 0.1 + 0.26 * t;
    applySeat();
  }

  /**
   * The room the piano is heard in: "hall" or "salon". The change is
   * immediate (the games make it while the screen is dark).
   */
  function setRoom(name) {
    if (name === roomName || !ROOMS.includes(name)) return;
    roomName = name;
    if (!ctx) return;
    const next = ctx.createConvolver();
    next.buffer = rooms[name];
    roomInput.disconnect(room);
    room.disconnect();
    roomInput.connect(next);
    next.connect(roomGain);
    room = next;
  }

  /**
   * The house's murmur, 0 (hushed) to 1, and how `muffled` it is, 0 (in the
   * hall) to 1 (behind closed doors). It hushes in a moment and returns
   * slowly, as an audience does.
   */
  function setCrowd(murmur, muffled = 0) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (murmur !== crowdState.murmur) {
      murmurGain.gain.setTargetAtTime(
        0.12 * murmur,
        now,
        murmur > crowdState.murmur ? 2 : 0.5,
      );
      crowdState.murmur = murmur;
    }
    if (muffled !== crowdState.muffled) {
      crowdTone.frequency.setTargetAtTime(20000 * 0.03 ** muffled, now, 0.3);
      crowdState.muffled = muffled;
    }
  }

  /**
   * Decode the pinned C3-C6 working set off the realtime path. Outer registers
   * are requested only after they are played, leaving mobile memory for the
   * common keyboard range.
   */
  function loadRoots(rootMidis, layer = null) {
    return (async () => {
      for (const rootMidi of rootMidis) {
        if (disposed) return;
        await Promise.all(
          manifest
            .filter(
              (entry) =>
                entry.rootMidi === rootMidi &&
                (layer === null || entry.layer === layer),
            )
            .map((entry) => queueRecordedLoad(entry)),
        );
        ready = recordedBuffers.size > 0;
      }
    })();
  }

  function loadSamples() {
    if (loading) return loading;
    loading = loadRoots(
      [...CORE_ROOTS].sort((a, b) => Math.abs(a - 63) - Math.abs(b - 63)),
    ).then(() => {
      ready = recordedBuffers.size > 0;
      if (import.meta.env.DEV && !ready)
        console.warn(
          "No recorded piano samples loaded; the engine stays on generated fallback PCM.",
        );
      // Background pass: readiness never waits on the detail roots.
      if (ready) loadRoots(DETAIL_ROOTS).then(() => loadRoots(OUTER_ROOTS, 1));
    });
    return loading;
  }

  /** Vite resolves BASE_URL, so recorded assets keep working on GitHub Pages. */
  async function fetchSample(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${url}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
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
    const failedAt = failedLoads.get(key);
    if (failedAt !== undefined && performance.now() - failedAt < 30000)
      return Promise.resolve(null);
    cacheMisses++;
    const promise = fetchSample(entry.url)
      .then((buffer) => {
        if (disposed) return null;
        failedLoads.delete(key);
        recordedBuffers.set(key, {
          buffer,
          bytes: bufferBytes(buffer),
          lastUsed: performance.now(),
          // Keep the default keyboard blend resident; soft captures remain
          // evictable so A0 and C8 can coexist without evicting each other.
          pinned: CORE_ROOTS.has(entry.rootMidi) && entry.layer > 0,
        });
        // A generated version is unnecessary once a real recording is warm.
        fallbackBuffers.delete(key);
        evictCache();
        return buffer;
      })
      .catch((error) => {
        failedLoads.set(key, performance.now());
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

  // Pay for the default first key and extreme-register fallbacks during entry,
  // not a musical attack. Yield between buffers so the loading UI can paint.
  function warmFallbacks() {
    if (fallbackWarmup) return fallbackWarmup;
    fallbackWarmup = (async () => {
      for (const root of [45, 21, 108]) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (disposed || !ctx) return;
        const key = `${root}:2`;
        if (!recordedBuffers.has(key)) fallbackFor(manifestByKey.get(key));
      }
    })();
    return fallbackWarmup;
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
    // Nearest warm recording wins; a neighbour root beats a synthetic attack
    // while the nearest one is still loading or has been evicted.
    let recorded = [];
    for (const candidate of rootCandidates.get(midi)) {
      recorded = weights
        .map(({ layer, weight }) => ({
          ...bufferForLayer(candidate, layer),
          weight,
        }))
        .filter((sample) => sample.buffer && sample.backend === "recorded");
      if (recorded.length) break;
    }
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
    if (!rootForMidi.has(midi) || !Number.isFinite(velocity)) return null;
    try {
      ensureAudio();
    } catch {
      return null;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const level = Math.max(0, Math.min(1, velocity)) * (soft ? 0.8 : 1);
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

    const samples = sourcesFor(midi, level);
    if (!samples?.length) return now;

    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const resonanceSend = ctx.createGain();
    filter.type = "lowpass";
    // Continuous brightness across the whole velocity range, so the boundary
    // between two sample layers is never heard as a step.
    filter.frequency.value =
      Math.min(
        18000,
        900 + midiToFrequency(midi) * (3 + 9 * Math.pow(level, 1.3)),
      ) * (soft ? 0.62 : 1);
    filter.Q.value = 0.4;

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
      physicalSourceCount++;
      source.onended = () => {
        physicalSourceCount--;
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
   * `quiet`: no damper sound (autoplay's pedal lifting off the strings).
   */
  function noteOff(midi, release = 0.45, reason = "release", quiet = false) {
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
      if (!undamped && !quiet) damperContact(voice, reason);
    }
  }

  /**
   * A damper landing on a live string, not a click: a very quiet filtered
   * burst that scales with register and with how hard the note was struck.
   * Dampers landing together (a chord let go, the pedal lifted off a
   * sustained run) make one sound: summed, dozens of them were a clack.
   */
  function damperContact(voice, reason) {
    if (!pedalBuffers || reason === "source-stop") return;
    if (ctx.currentTime - lastDamperAt < 0.04) return;
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
    lastDamperAt = ctx.currentTime;
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
  function setSustain(down, quiet = false) {
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
    if (quiet || now - lastPedalAt < 0.06) return;
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
    warmFallbacks,
    setListener,
    setRoom,
    setCrowd,
    /**
     * A sound of the hall itself (the chime, the applause), played into the
     * mix after `delay` seconds at `rate` (pitch) and `gain`; with `crowd`,
     * from where the audience sits (the applause). Decoded once.
     */
    playEffect(url, { delay = 0, rate = 1, gain = 1, crowd = false } = {}) {
      ensureAudio();
      if (!effects.has(url))
        effects.set(
          url,
          fetchSample(url).catch(() => null), // a missing sound stays silent
        );
      effects.get(url).then((buffer) => {
        if (!buffer || disposed) return;
        const source = ctx.createBufferSource();
        const level = ctx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        level.gain.value = gain;
        source.connect(level);
        level.connect(crowd ? crowdInput : master);
        source.start(ctx.currentTime + delay);
      });
    },
    /** Everything heard, as a MediaStream to record. */
    captureStream() {
      ensureAudio();
      if (!capture) {
        capture = ctx.createMediaStreamDestination();
        finalStage.connect(capture);
      }
      return capture.stream;
    },
    setSoft(down) {
      soft = down;
    },
    get soft() {
      return soft;
    },
    /** DEV: the seat's current mix. */
    get seat() {
      return { ...seat };
    },
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
      const warmNeighbour = rootCandidates
        .get(midi)
        .slice(1)
        .some((root) =>
          desired.some(({ layer }) => recordedBuffers.has(`${root}:${layer}`)),
        );
      const backend =
        recorded.length === desired.length
          ? "recorded"
          : recorded.length
            ? "recorded-single-layer"
            : warmNeighbour
              ? "recorded-neighbour"
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
        failedLoads: failedLoads.size,
        sampleRate: ctx?.sampleRate ?? null,
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
        physicalSources: physicalSourceCount,
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
