/**
 * Sample set for the piano engine.
 *
 * The default manifest names compact local derivatives of real Salamander
 * Grand Piano V3 recordings. The engine fetches and decodes those assets once.
 * `renderFallbackSample()` remains a generated additive PCM fallback for a
 * missing asset, a network failure, or a cold load before a recording arrives.
 */

// Every Salamander root (A, C, D#, F# per octave) bounds the shift to ±1
// semitone. A0 and C8 are pinned so the extremes are never extrapolated.
const ROOT_MIDI = [
  21,
  ...Array.from({ length: 28 }, (_, i) => 24 + i * 3),
  108,
];

const NOTE_STEMS = ["A", "C", "Ds", "Fs"];
const ROOT_FILE_STEMS = new Map(
  ROOT_MIDI.map((midi) => {
    const octave = Math.floor(midi / 12) - 1;
    const stem = midi === 108 ? "C" : NOTE_STEMS[((midi - 21) / 3) % 4];
    // Files spell sharps as a suffix: D#1 -> D1s.
    return [
      midi,
      stem.endsWith("s") ? `${stem[0]}${octave}s` : `${stem}${octave}`,
    ];
  }),
);

/**
 * Velocity layers. `threshold` is the lower bound of the layer's region; the
 * engine crossfades across the boundary so nearby velocities never sound like
 * two different instruments.
 */
export const VELOCITY_LAYERS = [
  {
    name: "soft",
    threshold: 0,
    sourceVelocity: 4,
    brightness: 0.42,
    partials: 14,
    noise: 0.1,
  },
  {
    name: "medium",
    threshold: 0.38,
    sourceVelocity: 9,
    brightness: 0.72,
    partials: 22,
    noise: 0.3,
  },
  {
    name: "forte",
    threshold: 0.72,
    sourceVelocity: 14,
    brightness: 1,
    partials: 30,
    noise: 0.62,
  },
];

export const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Equal-power gain weights for the soft/medium and medium/forte overlaps. */
export function velocityLayerWeights(velocity) {
  if (velocity <= 0.3) return [{ layer: 0, weight: 1 }];
  if (velocity < 0.46) {
    const t = (velocity - 0.3) / 0.16;
    return [
      { layer: 0, weight: Math.cos((Math.PI * t) / 2) },
      { layer: 1, weight: Math.sin((Math.PI * t) / 2) },
    ];
  }
  if (velocity <= 0.64) return [{ layer: 1, weight: 1 }];
  if (velocity < 0.8) {
    const t = (velocity - 0.64) / 0.16;
    return [
      { layer: 1, weight: Math.cos((Math.PI * t) / 2) },
      { layer: 2, weight: Math.sin((Math.PI * t) / 2) },
    ];
  }
  return [{ layer: 2, weight: 1 }];
}

/** Measure the actual nearest-root mapping instead of trusting root spacing. */
export function validateSampleCoverage(manifest = createSampleManifest()) {
  const roots = [...new Set(manifest.map((entry) => entry.rootMidi))].sort(
    (a, b) => a - b,
  );
  let maximumPositive = -Infinity;
  let maximumNegative = Infinity;
  const positiveMidi = [];
  const negativeMidi = [];
  for (let midi = 21; midi <= 108; midi++) {
    let root = roots[0];
    for (const candidate of roots) {
      if (Math.abs(candidate - midi) < Math.abs(root - midi)) root = candidate;
    }
    const shift = midi - root;
    if (shift > maximumPositive) {
      maximumPositive = shift;
      positiveMidi.length = 0;
    }
    if (shift === maximumPositive) positiveMidi.push(midi);
    if (shift < maximumNegative) {
      maximumNegative = shift;
      negativeMidi.length = 0;
    }
    if (shift === maximumNegative) negativeMidi.push(midi);
  }
  return { maximumPositive, maximumNegative, positiveMidi, negativeMidi };
}

/** Longer, darker tails at the bottom; short and bright at the top. */
function sampleSeconds(midi) {
  if (midi < 40) return 3.6;
  if (midi < 60) return 3;
  if (midi < 84) return 2.2;
  return 1.2;
}

/**
 * String inharmonicity. Real piano partials sit above exact harmonics because
 * the string is stiff; the effect is strongest at both extremes of the
 * compass, which is a large part of why a piano does not sound like an organ.
 */
function inharmonicity(midi) {
  const fromMiddle = (midi - 60) / 30;
  return (
    0.00006 * Math.exp(1.5 * fromMiddle) +
    0.0004 * Math.exp((-2.2 * (midi - 21)) / 30)
  );
}

/** The recorded manifest: one local Ogg/Opus file per root and velocity layer. */
export function createSampleManifest() {
  const entries = [];
  for (const rootMidi of ROOT_MIDI) {
    for (let layer = 0; layer < VELOCITY_LAYERS.length; layer++) {
      entries.push({
        rootMidi,
        layer,
        seconds: sampleSeconds(rootMidi),
        url: `audio/salamander/${ROOT_FILE_STEMS.get(rootMidi)}-v${VELOCITY_LAYERS[layer].sourceVelocity}.ogg`,
      });
    }
  }
  return entries;
}

/**
 * Render one manifest entry to mono PCM.
 *
 * Additive: a stiff-string partial series, each partial with its own decay, a
 * secondary slow tail (the piano's double decay), three slightly detuned
 * unison strings for beating, and a short filtered hammer noise burst.
 */
export function renderFallbackSample(entry, sampleRate) {
  const layer = VELOCITY_LAYERS[entry.layer];
  const f0 = midiToFrequency(entry.rootMidi);
  const length = Math.floor(entry.seconds * sampleRate);
  const out = new Float32Array(length);
  const envelope = new Float32Array(length); // reused by every partial
  const B = inharmonicity(entry.rootMidi);
  const nyquist = sampleRate * 0.5;

  // Bass strings ring far longer than treble ones.
  const baseDecay = 0.55 + 5.5 * Math.exp(-(entry.rootMidi - 21) / 26);
  // Strings per course, matching the instrument: wound single bass strings,
  // tenor pairs, treble trichords.
  const strings = entry.rootMidi < 40 ? 1 : entry.rootMidi < 60 ? 2 : 3;
  // Detune is chosen for a fixed ~0.3 Hz beat rather than fixed cents, so the
  // beat period always outlasts the sample. Fixed cents made treble unisons
  // re-converge mid-sample and the envelope audibly swelled back up.
  // Halved for trichords: the outermost pair spans twice this, and it is that
  // widest pair that sets the slowest beat.
  const spread = Math.min(1.2, 1200 * Math.log2(1 + 0.3 / f0));
  const cents = strings > 2 ? spread / 2 : spread;
  const unison = [0, cents, -cents].slice(0, strings);

  for (let n = 1; n <= layer.partials; n++) {
    const ratio = n * Math.sqrt(1 + B * n * n);
    const frequency = f0 * ratio;
    if (frequency >= nyquist * 0.95) break;

    // Higher partials start quieter and die sooner; a harder strike keeps more
    // of them alive, which is the audible difference between p and f.
    const rolloff = Math.pow(n, -1.1 - 1.9 * (1 - layer.brightness));
    const amplitude = rolloff * (0.6 + 0.4 * layer.brightness);
    const fastDecay = baseDecay / (1 + 0.42 * (n - 1));
    const slowDecay = fastDecay * 2.8;

    // Double decay: a quick initial loss, then a long quiet tail. Both terms
    // are stepped multiplicatively rather than re-evaluating exp() per sample.
    const fastStep = Math.exp(-1 / (fastDecay * sampleRate));
    const slowStep = Math.exp(-1 / (slowDecay * sampleRate));
    let fast = 0.72;
    let slow = 0.28;
    let span = 0;
    for (let i = 0; i < length; i++) {
      const value = fast + slow;
      if (value < 1e-5) break;
      envelope[i] = value;
      fast *= fastStep;
      slow *= slowStep;
      span = i + 1;
    }

    for (const detune of unison) {
      const omega =
        (2 * Math.PI * frequency * Math.pow(2, detune / 1200)) / sampleRate;
      // Every string of the course starts in phase, so the course is at its
      // loudest at the strike and drifts apart from there.
      const phase = (n * 1.379) % (2 * Math.PI);
      const gain = amplitude / unison.length;
      // Rotate a unit vector by omega each sample instead of calling sin();
      // renormalised periodically so it cannot drift over a long sample.
      const cosOmega = Math.cos(omega);
      const sinOmega = Math.sin(omega);
      let re = Math.cos(phase);
      let im = Math.sin(phase);
      for (let i = 0; i < span; i++) {
        out[i] += gain * envelope[i] * im;
        const next = re * cosOmega - im * sinOmega;
        im = im * cosOmega + re * sinOmega;
        re = next;
        if ((i & 1023) === 1023) {
          const norm = 1 / Math.hypot(re, im);
          re *= norm;
          im *= norm;
        }
      }
    }
  }

  // Hammer contact: a short noise burst, low-passed by a one-pole so it reads
  // as felt on steel rather than as a click.
  const noiseSeconds = 0.045;
  const noiseLength = Math.floor(noiseSeconds * sampleRate);
  const cutoff = Math.min(0.65, 0.12 + 0.5 * layer.brightness);
  let lp = 0;
  let seed = entry.rootMidi * 9301 + entry.layer * 49297;
  for (let i = 0; i < noiseLength && i < length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const white = (seed / 233280) * 2 - 1;
    lp += cutoff * (white - lp);
    const decay = Math.exp(-i / (noiseSeconds * sampleRate * 0.22));
    out[i] += lp * decay * 0.5 * layer.noise;
  }

  // Normalise, then apply a short fade-out so a stolen or truncated voice can
  // never click at the buffer end.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? 0.92 / peak : 1;
  const fade = Math.min(length, Math.floor(0.05 * sampleRate));
  for (let i = 0; i < length; i++) {
    const tail = i > length - fade ? (length - i) / fade : 1;
    out[i] *= scale * tail;
  }
  return out;
}

/**
 * The rooms the piano is heard in, in metres (a scene unit is ~0.208 m):
 * the concert hall of hall.js (stalls floor to ceiling, organ wall to the
 * back doors) and the music salon of salon.js, each with the piano where it
 * stands, a listener (mid-stalls; at the keys) and a reverberation time for
 * below and above ~2 kHz (Sabine's estimate for their size, a
 * gilded hall and a panelled room). [x, y, z]: across, up, along.
 */
const ROOMS = {
  hall: {
    size: [14.1, 16, 26.2],
    source: [7.05, 2.1, 5.4],
    listener: [5.6, 2.4, 16.8],
    rt: [2.0, 1.3],
  },
  salon: {
    size: [7.1, 4.6, 5.8],
    source: [3.3, 1.1, 2.9],
    listener: [1.5, 1.6, 2.9],
    rt: [0.85, 0.55],
  },
};

/**
 * A room's reverberation as heard from its listener: the six first
 * reflections off its walls, floor and ceiling (image sources, each from its
 * own side), then a diffuse tail that sets in after them and dies away at
 * the room's rate, the treble sooner than the bass; left and right ears
 * hear different tails, which is what makes it wide.
 */
function roomResponse(context, { size, source, listener, rt }) {
  const rate = context.sampleRate;
  const length = Math.floor((rt[0] + 0.15) * rate);
  const buffer = context.createBuffer(2, length, rate);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = (a) => Math.hypot(...a);
  const ahead = sub(source, listener);
  ahead[1] = 0;
  const forward = ahead.map((v) => v / norm(ahead));
  const right = [-forward[2], 0, forward[0]]; // forward × up
  const direct = norm(sub(source, listener));
  const reflections = [];
  for (let axis = 0; axis < 3; axis++)
    for (const wall of [0, size[axis]]) {
      const image = [...source];
      image[axis] = 2 * wall - source[axis];
      const path = sub(image, listener);
      const distance = norm(path);
      const side = path.reduce((sum, v, i) => sum + v * right[i], 0) / distance;
      reflections.push({
        at: (distance - direct) / 343,
        gain: (0.8 * direct) / distance,
        side,
      });
    }
  const onset = Math.min(...reflections.map((r) => r.at));
  const lowCut = 1 - Math.exp((-2 * Math.PI * 2000) / rate); // mids decay as lows
  const airCut = 1 - Math.exp((-2 * Math.PI * 7000) / rate);
  const decay = rt.map((seconds) => -6.91 / seconds); // to -60 dB
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = channel ? 67890 : 12345;
    let low = 0;
    let air = 0;
    let early = 0;
    let late = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const white = (seed / 233280) * 2 - 1;
      low += lowCut * (white - low);
      const t = i / rate;
      const grown = t < onset ? 0 : 1 - Math.exp(-(t - onset) / 0.025);
      const tail =
        grown *
        (low * Math.exp(decay[0] * t) + (white - low) * Math.exp(decay[1] * t));
      air += airCut * (tail - air);
      data[i] = air;
      if (t < 0.08) early += air * air;
      else late += air * air;
    }
    // Clear, not muddy: the late sound carries ~1.5 times the early energy
    // (a concert hall's clarity, C80 of about -2 dB), reflections included.
    const taps = reflections.map((r) => ({
      offset: Math.floor(r.at * rate),
      gain: r.gain * Math.sqrt((1 + (channel ? r.side : -r.side)) / 2),
    }));
    const tapEnergy = taps.reduce((sum, tap) => sum + tap.gain ** 2, 0);
    const scale = Math.sqrt((1.5 * (tapEnergy + early)) / late);
    for (let i = 0; i < length; i++) if (i / rate >= 0.08) data[i] *= scale;
    for (const { offset, gain } of taps)
      if (offset < length) data[offset] += gain;
    for (let i = length - Math.floor(0.05 * rate); i < length; i++)
      data[i] *= (length - i) / (0.05 * rate); // no cut-off at the end
  }
  return buffer;
}

/**
 * Impulse responses, generated so no third-party IR file is required:
 * "hall" and "salon" (see ROOMS), and "resonance", the darker, longer bloom
 * used for the undamped string bed when the sustain pedal is down.
 */
export function createImpulseResponse(context, kind) {
  if (ROOMS[kind]) return roomResponse(context, ROOMS[kind]);
  const seconds = 2.2;
  const length = Math.floor(seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 67890;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const white = (seed / 233280) * 2 - 1;
      // Darker, with a low-level tail, which reads as undamped strings
      // rather than a second generic room.
      lp += 0.105 * (white - lp);
      const progress = i / length;
      data[i] =
        lp *
        (0.68 * Math.pow(1 - progress, 1.25) +
          0.32 * Math.pow(1 - progress, 4.6));
    }
  }
  return buffer;
}

/**
 * The sustain pedal's felt and linkage: a soft, low thud, not a click. Noise
 * through two low passes (a few hundred hertz), swelling over ~10 ms and
 * dying away; pedal up (the dampers settling back) is a touch shorter and
 * brighter than pedal down. Both sit well beneath a medium piano note.
 */
export function createPedalNoise(context, kind) {
  const down = kind === "down";
  const seconds = down ? 0.16 : 0.12;
  const length = Math.floor(seconds * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const cutoff = down ? 220 : 320; // hertz
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / context.sampleRate);
  const rise = 0.01; // seconds
  const fall = down ? 0.045 : 0.03;
  let seed = down ? 4242 : 2424;
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const white = (seed / 233280) * 2 - 1;
    lp1 += k * (white - lp1);
    lp2 += k * (lp1 - lp2);
    const t = i / context.sampleRate;
    const envelope = (1 - Math.exp(-t / rise)) ** 2 * Math.exp(-t / fall);
    data[i] = lp2 * envelope * 1.6;
  }
  return buffer;
}

/**
 * The house before the music: some 40 people talking at once, too far off
 * and too many to make out a word. Each talker is a voice (a sawtooth at
 * their own pitch, falling through a phrase) shaped by two formants that
 * glide from vowel to vowel, syllable by syllable, with pauses between
 * phrases; half the room on each side, softened by distance. Made at 16 kHz
 * (the room's air takes off the rest) and looped seamlessly.
 */
export function createCrowdMurmur(context, seconds = 10) {
  const rate = 16000;
  const fade = Math.floor(0.6 * rate); // the loop's crossfade
  const length = Math.floor(seconds * rate);
  const total = length + fade;
  const buffer = context.createBuffer(2, length, rate);
  const mix = [new Float32Array(total), new Float32Array(total)];
  const VOWELS = [
    [800, 1200], // a
    [500, 1900], // e
    [320, 2300], // i
    [500, 900], // o
    [340, 800], // u
  ];
  let seed = 97531;
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const resonator = () => ({ y1: 0, y2: 0, a1: 0, a2: 0, b0: 0 });
  const tune = (r, frequency, bandwidth) => {
    const radius = Math.exp((-Math.PI * bandwidth) / rate);
    r.a1 = 2 * radius * Math.cos((2 * Math.PI * frequency) / rate);
    r.a2 = -radius * radius;
    r.b0 = 1 - radius;
  };
  const ring = (r, x) => {
    const y = r.b0 * x + r.a1 * r.y1 + r.a2 * r.y2;
    r.y2 = r.y1;
    r.y1 = y;
    return y;
  };
  for (let talker = 0; talker < 40; talker++) {
    const side = talker % 2;
    const pitch = 95 + random() * 135;
    const level = 0.4 + random() * 0.6;
    const formants = [resonator(), resonator()];
    let phase = 0;
    let i = Math.floor(random() * rate); // each starts in their own time
    while (i < total) {
      const syllables = 3 + Math.floor(random() * 6);
      for (let s = 0; s < syllables && i < total; s++) {
        const [f1, f2] = VOWELS[Math.floor(random() * VOWELS.length)];
        const span = Math.floor((0.12 + random() * 0.16) * rate);
        const start = i;
        for (; i < start + span && i < total; i++) {
          const t = (i - start) / span;
          if ((i - start) % 32 === 0) {
            // Glide toward this vowel; the pitch sags through the phrase.
            tune(formants[0], f1 * (0.9 + 0.1 * t), 90);
            tune(formants[1], f2 * (0.92 + 0.08 * t), 130);
          }
          const f0 = pitch * (1.08 - (0.14 * s) / syllables) * (1 - 0.04 * t);
          phase = (phase + f0 / rate) % 1;
          const voice = 1 - 2 * phase + (random() - 0.5) * 0.3;
          const envelope = Math.min(1, t / 0.15, (1 - t) / 0.25);
          mix[side][i] +=
            level *
            envelope *
            (ring(formants[0], voice) + 0.6 * ring(formants[1], voice));
        }
      }
      i += Math.floor((0.25 + random() * 1.1) * rate); // a breath, a listen
    }
  }
  const cut = 1 - Math.exp((-2 * Math.PI * 2500) / rate); // distance
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const source = mix[channel];
    let low = 0;
    let peak = 0;
    for (let i = 0; i < total; i++) {
      low += cut * (source[i] - low);
      source[i] = low;
    }
    for (let i = 0; i < length; i++) {
      // The tail past the end fades into the start: no seam when looping.
      const over = i < fade ? source[length + i] * (1 - i / fade) : 0;
      data[i] = source[i] * (i < fade ? i / fade : 1) + over;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    for (let i = 0; i < length; i++) data[i] *= 0.5 / peak;
  }
  return buffer;
}
