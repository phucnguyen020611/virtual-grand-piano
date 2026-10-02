/**
 * The autoplay repertoire: simplified performing editions of public-domain
 * pieces. One source of truth for the engraved score book, playback and the
 * note highlights. Positions and durations are in sixteenth notes.
 *
 * A note may carry `play` (an onset offset) and `hold` (a longer sounding
 * length) where the written notation is simplified, e.g. Bach's held bass.
 */
const n = (pos, pitch, dur = 1, extra = {}) => ({ pos, pitch, dur, ...extra });
const chord = (pos, pitches, dur) => pitches.map((p) => n(pos, p, dur));
const bar = (length, rh, lh = [], extra = {}) => ({ length, rh, lh, ...extra });

// --- Für Elise --------------------------------------------------------------
const fe = (rh, lh = [], extra) => bar(6, rh, lh, extra);
const arpeggio = (a, b, c) => [n(0, a), n(1, b), n(2, c)];
const feTheme = [
  fe([n(0, "E5"), n(1, "D#5"), n(2, "E5"), n(3, "B4"), n(4, "D5"), n(5, "C5")]),
  fe(
    [n(0, "A4", 2), n(3, "C4"), n(4, "E4"), n(5, "A4")],
    arpeggio("A2", "E3", "A3"),
  ),
  fe(
    [n(0, "B4", 2), n(3, "E4"), n(4, "G#4"), n(5, "B4")],
    arpeggio("E2", "E3", "G#3"),
  ),
  fe(
    [n(0, "C5", 2), n(3, "E4"), n(4, "E5"), n(5, "D#5")],
    arpeggio("A2", "E3", "A3"),
  ),
];
const feA = [
  feTheme[0],
  feTheme[1],
  feTheme[2],
  feTheme[3],
  feTheme[0],
  feTheme[1],
  fe(
    [n(0, "B4", 2), n(3, "E4"), n(4, "C5"), n(5, "B4")],
    arpeggio("E2", "E3", "G#3"),
  ),
];

const furElise = {
  id: "fur-elise",
  title: "Für Elise",
  subtitle: "Bagatelle in A minor · WoO 59",
  composer: "Ludwig van Beethoven",
  dates: "(1770–1827)",
  tempo: "Poco moto",
  dynamic: "pp",
  time: [3, 8],
  sharps: 0,
  beamEvery: 6,
  sixteenth: 0.22,
  pedal: 6,
  measures: [
    { length: 2, rh: [n(0, "E5"), n(1, "D#5")], lh: [], pickup: true },
    ...feA,
    fe([n(0, "A4", 2), n(4, "E5"), n(5, "D#5")], arpeggio("A2", "E3", "A3"), {
      volta: 1,
      repeatEnd: true,
    }),
    fe(
      [n(0, "A4", 2), n(3, "B4"), n(4, "C5"), n(5, "D5")],
      arpeggio("A2", "E3", "A3"),
      { volta: 2 },
    ),
    fe(
      [n(0, "E5", 3), n(3, "G4"), n(4, "F5"), n(5, "E5")],
      arpeggio("C3", "G3", "C4"),
    ),
    fe(
      [n(0, "D5", 3), n(3, "F4"), n(4, "E5"), n(5, "D5")],
      arpeggio("G2", "G3", "B3"),
    ),
    fe(
      [n(0, "C5", 3), n(3, "E4"), n(4, "D5"), n(5, "C5")],
      arpeggio("A2", "E3", "A3"),
    ),
    fe(
      [n(0, "B4", 2), n(3, "E4"), n(4, "E5"), n(5, "D#5")],
      arpeggio("E2", "E3", "G#3"),
    ),
    ...feA.map((measure) => ({ ...measure })),
    fe([n(0, "A4", 6)], [n(0, "A2"), n(1, "E3"), n(2, "A3", 4)], {
      final: true,
    }),
  ],
  // The repeat returns to bar 1, then takes the second ending.
  playOrder: [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21,
  ],
  pages: [
    [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
    ],
    [
      [17, 18, 19],
      [20, 21],
    ],
  ],
  notes: [
    "Composed in 1810 and published only in 1867, forty years after",
    "Beethoven’s death, from a manuscript that has since been lost.",
    "Poco moto — with a little motion. Keep the sixteenths even and",
    "let the broken chords of the left hand flow beneath the melody.",
  ],
};

// --- Ode to Joy -------------------------------------------------------------
const q = (pos, pitch) => n(pos, pitch, 4);
const h = (pos, pitch) => n(pos, pitch, 8);
const halves = (a, b) => [h(0, a), h(8, b)];
const ode = (rh, lh, extra) => bar(16, rh, lh, extra);
// Left-hand textures, one per phrase: open fifths, Alberti eighths, block
// chords on the beat.
const ODE_CHORDS = {
  C: ["C3", "G3", "E3"],
  G: ["G2", "D3", "B2"],
  G7: ["G2", "F3", "B2"],
};
const fifths = (a, b) => [
  ...chord(0, ODE_CHORDS[a].slice(0, 2), 8),
  ...chord(8, ODE_CHORDS[b].slice(0, 2), 8),
];
const alberti = (a, b) =>
  [a, b].flatMap((name, half) => {
    const [root, fifth, third] = ODE_CHORDS[name];
    return [root, fifth, third, fifth].map((p, i) => n(half * 8 + i * 2, p, 2));
  });
const blocks = (...names) =>
  names.flatMap((name, beat) => chord(beat * 4, ODE_CHORDS[name], 4));
// The last verse is harmonised in thirds (sixth under C).
const BELOW = { E5: "C5", F5: "D5", G5: "E5", D5: "B4", C5: "E4" };
const thirds = (notes) =>
  notes.flatMap((note) =>
    BELOW[note.pitch] ? [note, { ...note, pitch: BELOW[note.pitch] }] : [note],
  );
const odeLine = [
  [q(0, "E5"), q(4, "E5"), q(8, "F5"), q(12, "G5")],
  [q(0, "G5"), q(4, "F5"), q(8, "E5"), q(12, "D5")],
  [q(0, "C5"), q(4, "C5"), q(8, "D5"), q(12, "E5")],
];
const cadenceHalf = [n(0, "E5", 6), n(6, "D5", 2), h(8, "D5")];
const cadenceFull = [n(0, "D5", 6), n(6, "C5", 2), h(8, "C5")];
const odeToJoy = {
  id: "ode-to-joy",
  title: "Ode to Joy",
  subtitle: "Theme from Symphony No. 9 in D minor · Op. 125",
  composer: "Ludwig van Beethoven",
  dates: "(1770–1827)",
  tempo: "Allegro moderato",
  dynamic: "p",
  time: [4, 4],
  sharps: 0,
  beamEvery: 4,
  sixteenth: 0.16,
  pedal: 8,
  measures: [
    ode(odeLine[0], fifths("C", "C")),
    ode(odeLine[1], fifths("G", "G")),
    ode(odeLine[2], fifths("C", "C")),
    ode(cadenceHalf, fifths("G", "G")),
    ode(odeLine[0], alberti("C", "C")),
    ode(odeLine[1], alberti("G", "G")),
    ode(odeLine[2], alberti("C", "C")),
    ode(cadenceFull, alberti("G", "C")),
    ode(
      [q(0, "D5"), q(4, "D5"), q(8, "E5"), q(12, "C5")],
      blocks("G", "G", "C", "C"),
    ),
    ode(
      [q(0, "D5"), n(4, "E5", 2), n(6, "F5", 2), q(8, "E5"), q(12, "C5")],
      blocks("G", "G", "C", "C"),
    ),
    ode(
      [q(0, "D5"), n(4, "E5", 2), n(6, "F5", 2), q(8, "E5"), q(12, "D5")],
      blocks("G7", "G7", "C", "C"),
    ),
    ode([q(0, "C5"), q(4, "D5"), h(8, "G4")], blocks("C", "G", "G", "G")),
    ode(thirds(odeLine[0]), alberti("C", "C")),
    ode(thirds(odeLine[1]), alberti("G", "G")),
    ode(thirds(odeLine[2]), alberti("C", "C")),
    ode(
      thirds(cadenceFull),
      [...alberti("G", "C").slice(0, 4), ...chord(8, ["C3", "E3", "G3"], 8)],
      { final: true },
    ),
  ],
  pages: [
    [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ],
  ],
  notes: [
    "The melody of the choral finale of the Ninth Symphony, first",
    "performed in Vienna in 1824. Each verse adds a new texture:",
    "open fifths, flowing Alberti eighths, chords on the beat, and",
    "a last verse sung in thirds over a warm, pedalled bass.",
  ],
};

// --- Canon in D -------------------------------------------------------------
const CANON_BASS = ["D3", "A2", "B2", "F#2", "G2", "D2", "G2", "A2"];
// Root, fifth, octave, fifth: the ground bass broken into eighths.
const BROKEN = {
  D3: ["D3", "A3", "D4", "A3"],
  A2: ["A2", "E3", "A3", "E3"],
  B2: ["B2", "F#3", "B3", "F#3"],
  "F#2": ["F#2", "C#3", "F#3", "C#3"],
  G2: ["G2", "D3", "G3", "D3"],
  D2: ["D2", "A2", "D3", "A2"],
};
const groundHalves = (i) =>
  halves(CANON_BASS[(i % 4) * 2], CANON_BASS[(i % 4) * 2 + 1]);
const groundEighths = (i) =>
  [0, 1].flatMap((half) =>
    BROKEN[CANON_BASS[(i % 4) * 2 + half]].map((p, k) =>
      n(half * 8 + k * 2, p, 2),
    ),
  );
const dyads = (a, b) => [...chord(0, a, 8), ...chord(8, b, 8)];
const eighths = (...pitches) => pitches.map((p, i) => n(i * 2, p, 2));
const canonVoice = [
  // I. The canon enters in half notes over the bare ground.
  halves("F#5", "E5"),
  halves("D5", "C#5"),
  halves("B4", "A4"),
  halves("B4", "C#5"),
  // II. Same line lower, the bass now rippling in eighths.
  halves("D5", "C#5"),
  halves("B4", "A4"),
  halves("G4", "F#4"),
  halves("G4", "E4"),
  // III. Quarter-note variation.
  [q(0, "D5"), q(4, "F#5"), q(8, "A5"), q(12, "G5")],
  [q(0, "F#5"), q(4, "D5"), q(8, "F#5"), q(12, "E5")],
  [q(0, "D5"), q(4, "B4"), q(8, "D5"), q(12, "A4")],
  [q(0, "G4"), q(4, "B4"), q(8, "A4"), q(12, "G4")],
  // IV. Broken-chord eighths over a plain ground.
  eighths("D5", "F#5", "A5", "F#5", "C#5", "E5", "A5", "E5"),
  eighths("B4", "D5", "F#5", "D5", "A4", "C#5", "F#5", "C#5"),
  eighths("B4", "D5", "G5", "D5", "A4", "D5", "F#5", "D5"),
  eighths("B4", "D5", "G5", "D5", "C#5", "E5", "A5", "E5"),
  // V. Two voices in sixths and thirds.
  dyads(["A4", "F#5"], ["A4", "E5"]),
  dyads(["F#4", "D5"], ["A4", "C#5"]),
  dyads(["D4", "B4"], ["F#4", "A4"]),
  dyads(["G4", "B4"], ["A4", "C#5"]),
];
const canon = {
  id: "canon-in-d",
  title: "Canon in D",
  subtitle: "from Canon and Gigue in D major · P. 37",
  composer: "Johann Pachelbel",
  dates: "(1653–1706)",
  tempo: "Andante",
  dynamic: "p",
  time: [4, 4],
  sharps: 2,
  beamEvery: 4,
  sixteenth: 0.2,
  pedal: 8,
  measures: canonVoice
    .map((rh, i) =>
      bar(
        16,
        rh,
        i < 4 || (i >= 12 && i < 16) ? groundHalves(i) : groundEighths(i),
      ),
    )
    .concat(
      bar(16, chord(0, ["F#4", "A4", "D5"], 16), chord(0, ["D2", "D3"], 16), {
        final: true,
      }),
    ),
  pages: [
    [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
    ],
    [
      [12, 13, 14],
      [15, 16, 17],
      [18, 19, 20],
    ],
  ],
  notes: [
    "A ground bass of eight notes repeats beneath the whole piece",
    "while the upper voice unfolds ever more elaborate variations:",
    "half notes, quarters, rippling eighths, then two voices in",
    "sixths. Change the pedal with every bass note so it can breathe.",
  ],
};

// --- Prelude in C, BWV 846 --------------------------------------------------
// Each bar is one chord broken as A B | C D E C D E, twice. The two bass
// notes are written as a held dyad; `play`/`hold` restore Bach's ripple.
const prelude = (a, b, u1, u2, u3) => {
  const half = (o) => [
    ...[u1, u2, u3, u1, u2, u3].map((p, i) => n(o + 2 + i, p)),
  ];
  const bass = (o) => [n(o, a, 8), n(o, b, 8, { play: 1, hold: 7 })];
  return bar(16, [...half(0), ...half(8)], [...bass(0), ...bass(8)]);
};
const bach = {
  id: "prelude-in-c",
  title: "Prelude in C major",
  subtitle: "The Well-Tempered Clavier, Book I · BWV 846",
  composer: "Johann Sebastian Bach",
  dates: "(1685–1750)",
  tempo: "Moderato",
  dynamic: "p",
  time: [4, 4],
  sharps: 0,
  beamEvery: 4,
  sixteenth: 0.2,
  pedal: 16,
  measures: [
    prelude("C4", "E4", "G4", "C5", "E5"),
    prelude("C4", "D4", "A4", "D5", "F5"),
    prelude("B3", "D4", "G4", "D5", "F5"),
    prelude("C4", "E4", "G4", "C5", "E5"),
    prelude("C4", "E4", "A4", "E5", "A5"),
    prelude("C4", "D4", "F#4", "A4", "D5"),
    prelude("B3", "D4", "G4", "D5", "G5"),
    prelude("B3", "C4", "E4", "G4", "C5"),
    prelude("A3", "C4", "E4", "G4", "C5"),
    prelude("D3", "A3", "D4", "F#4", "C5"),
    prelude("G3", "B3", "D4", "G4", "B4"),
    prelude("G3", "Bb3", "E4", "G4", "C#5"),
    prelude("F3", "A3", "D4", "A4", "D5"),
    prelude("F3", "Ab3", "D4", "F4", "B4"),
    prelude("E3", "G3", "C4", "G4", "C5"),
    prelude("E3", "F3", "A3", "C4", "F4"),
    prelude("D3", "F3", "A3", "C4", "F4"),
    prelude("G2", "D3", "G3", "B3", "F4"),
    prelude("C3", "E3", "G3", "C4", "E4"),
    prelude("C3", "G3", "Bb3", "C4", "E4"),
    prelude("F2", "F3", "A3", "C4", "E4"),
    prelude("F#2", "C3", "A3", "C4", "Eb4"),
    prelude("Ab2", "F3", "B3", "C4", "D4"),
    prelude("G2", "F3", "G3", "B3", "D4"),
    prelude("G2", "E3", "G3", "C4", "E4"),
    prelude("G2", "D3", "G3", "C4", "F4"),
    prelude("G2", "D3", "G3", "B3", "F4"),
    bar(16, chord(0, ["E4", "G4", "C5"], 16), chord(0, ["C2", "C3"], 16), {
      final: true,
    }),
  ],
  pages: [
    [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
    ],
    [
      [12, 13, 14],
      [15, 16, 17],
      [18, 19, 20],
      [21, 22, 23],
      [24, 25, 26, 27],
    ],
  ],
  notes: [
    "The first prelude of The Well-Tempered Clavier (1722). Every bar",
    "is a single harmony broken into the same flowing figure, moving",
    "through chromatic colours over a long dominant pedal before the",
    "final C. Change the pedal cleanly on each new bar.",
  ],
};

// --- Amazing Grace ----------------------------------------------------------
const waltz = (root, pair) => [q(0, root), ...chord(4, pair, 8)];
// Root, fifth, third, fifth, octave, fifth: a rocking eighth-note bass.
const rocking = (root, fifth, third, octave) =>
  [root, fifth, third, fifth, octave, fifth].map((p, i) => n(i * 2, p, 2));
const HYMN = {
  G: [waltz("G2", ["B2", "D3"]), rocking("G2", "D3", "B2", "G3")],
  C: [waltz("C3", ["E3", "G3"]), rocking("C3", "G3", "E3", "C4")],
  D: [waltz("D3", ["F#3", "A3"]), rocking("D3", "A3", "F#3", "D4")],
};
const hymn = (rh, lh, extra) => bar(12, rh, lh, extra);
const long = (a, b, c) => [h(0, a), n(8, b, 2), n(10, c, 2)];
const step = (a, b) => [h(0, a), q(8, b)];
// The second verse gives each long melody note an alto below it.
const ALTO = { G4: "D4", B4: "G4", D5: "B4", A4: "F#4", E4: "C4" };
const alto = (notes) =>
  notes.flatMap((note) =>
    note.dur >= 8 && ALTO[note.pitch]
      ? [note, { ...note, pitch: ALTO[note.pitch] }]
      : [note],
  );
const verse = [
  [long("G4", "B4", "G4"), "G"],
  [step("B4", "A4"), "G"],
  [step("G4", "E4"), "C"],
  [step("D4", "D4"), "G"],
  [long("G4", "B4", "G4"), "G"],
  [[h(0, "B4"), n(8, "A4", 2), n(10, "B4", 2)], "G"],
  [[n(0, "D5", 12)], "D"],
  [step("D5", "B4"), "D"],
  [long("D5", "B4", "G4"), "G"],
  [step("B4", "A4"), "G"],
  [step("G4", "E4"), "C"],
  [step("D4", "D4"), "G"],
  [long("G4", "B4", "G4"), "G"],
  [step("B4", "A4"), "D"],
];
const amazingGrace = {
  id: "amazing-grace",
  title: "Amazing Grace",
  subtitle: "Hymn · tune “New Britain”",
  composer: "Traditional American melody",
  dates: "words by John Newton (1779)",
  tempo: "Andante",
  dynamic: "mp",
  time: [3, 4],
  sharps: 1,
  beamEvery: 4,
  sixteenth: 0.19,
  pedal: 12,
  measures: [
    { length: 4, rh: [q(0, "D4")], lh: [], pickup: true },
    // The first half keeps a soft waltz; the second rocks in eighths.
    ...verse.map(([rh, harmony], i) =>
      i < 8 ? hymn(rh, HYMN[harmony][0]) : hymn(alto(rh), HYMN[harmony][1]),
    ),
    hymn(chord(0, ["B3", "D4", "G4"], 12), chord(0, ["G2", "D3"], 12), {
      final: true,
    }),
  ],
  pages: [
    [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15],
    ],
  ],
  notes: [
    "John Newton’s words were published in Olney Hymns (1779); the",
    "tune “New Britain” appeared in 1829. Play it like a singer:",
    "a soft waltz for the first half, then an alto joins the long",
    "notes while the left hand rocks gently in eighths.",
  ],
};

export const SONGS = [furElise, odeToJoy, canon, bach, amazingGrace];

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parsePitch(pitch) {
  const [, letter, accidental, octave] = pitch.match(/^([A-G])([#b]?)(\d)$/);
  return {
    letter,
    accidental,
    octave: Number(octave),
    midi:
      12 * (Number(octave) + 1) +
      LETTERS[letter] +
      (accidental === "#" ? 1 : accidental === "b" ? -1 : 0),
    // Diatonic step, for staff placement: C4 = 28.
    step: "CDEFGAB".indexOf(letter) + 7 * Number(octave),
  };
}

const DYNAMIC = { pp: 0.42, p: 0.5, mp: 0.56, mf: 0.64 };

/**
 * The performed timeline: bar starts in seconds, easing into a closing
 * ritardando over the last two bars.
 */
export function timeline(song) {
  const order = song.playOrder ?? song.measures.map((_, i) => i);
  let seconds = 0;
  return order.map((index, k) => {
    const fromEnd = order.length - k;
    const unit = song.sixteenth * (fromEnd <= 2 ? 1 + 0.2 * (3 - fromEnd) : 1);
    const start = seconds;
    seconds += song.measures[index].length * unit;
    return { index, k, start, unit, measure: song.measures[index] };
  });
}

/**
 * Timed note events for playback, in seconds from the first note. Velocity
 * is shaped like a player would: melody over accompaniment, the top of a
 * chord over its inner notes, downbeats leaned on, four-bar phrases that
 * swell and relax, and a little deterministic unevenness.
 */
export function scoreEvents(song) {
  const base = DYNAMIC[song.dynamic] ?? 0.52;
  const events = [];
  for (const { index, k, start, unit, measure } of timeline(song)) {
    const arch = 0.9 + 0.16 * Math.sin((Math.PI * ((k % 4) + 0.5)) / 4);
    for (const hand of ["rh", "lh"]) {
      const top = new Map();
      for (const note of measure[hand])
        top.set(
          note.pos,
          Math.max(top.get(note.pos) ?? 0, parsePitch(note.pitch).midi),
        );
      for (const note of measure[hand]) {
        const midi = parsePitch(note.pitch).midi;
        const accent =
          note.pos === 0 ? 0.06 : note.pos % song.beamEvery === 0 ? 0.025 : 0;
        const voice =
          hand === "lh" ? 0.78 : midi === top.get(note.pos) ? 1.14 : 0.9;
        const wobble =
          (((midi * 7919 + k * 131 + note.pos * 17) % 23) / 23 - 0.5) * 0.05;
        events.push({
          time: start + (note.pos + (note.play ?? 0)) * unit,
          duration: (note.hold ?? note.dur) * unit,
          midi,
          hand: hand === "rh" ? "right" : "left",
          velocity: Math.min(
            0.92,
            Math.max(0.18, base * voice * arch + accent + wobble),
          ),
          measure: index,
        });
      }
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

/**
 * Sustain pedal changes, `{ time, down }` in seconds: legato ("syncopated")
 * pedalling, lifted as each new harmony sounds and caught again just after,
 * only where the left hand carries the harmony. Held through the last chord.
 */
export function scorePedal(song, catchAfter = 0.09) {
  const changes = [];
  if (!song.pedal) return changes;
  const bars = timeline(song);
  for (const { start, unit, measure } of bars) {
    if (!measure.lh.length) continue;
    for (let pos = 0; pos < measure.length; pos += song.pedal) {
      const at = start + pos * unit;
      changes.push(
        { time: at, down: false },
        { time: at + catchAfter, down: true },
      );
    }
  }
  const last = bars.at(-1);
  changes.push({
    time: last.start + last.measure.length * last.unit + 1.4,
    down: false,
  });
  return changes;
}
