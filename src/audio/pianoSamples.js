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
 * Impulse responses, generated so no third-party IR file is required.
 * "room" is a small recital room; "resonance" is the darker, longer bloom used
 * for the undamped string bed when the sustain pedal is down.
 */
export function createImpulseResponse(context, kind) {
  const isRoom = kind === "room";
  const seconds = isRoom ? 1.15 : 2.2;
  const decay = isRoom ? 3.9 : 1.8;
  const length = Math.floor(seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = isRoom ? 12345 : 67890;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const white = (seed / 233280) * 2 - 1;
      // The resonance bus is darker and retains a low-level tail, which reads
      // as undamped strings rather than a second generic room.
      lp += (isRoom ? 0.48 : 0.105) * (white - lp);
      const progress = i / length;
      const envelope = isRoom
        ? Math.pow(1 - progress, decay)
        : 0.68 * Math.pow(1 - progress, 1.25) +
          0.32 * Math.pow(1 - progress, 4.6);
      data[i] = lp * envelope;
    }
    // A couple of early reflections stop the room sounding like a noise cloud.
    if (isRoom) {
      for (const [delay, gain] of [
        [0.009, 0.42],
        [0.019, 0.28],
        [0.031, 0.16],
      ]) {
        const offset = Math.floor(delay * context.sampleRate) + channel * 17;
        if (offset < length) data[offset] += gain;
      }
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
