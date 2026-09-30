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
  sixteenth: 0.2,
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
const odeLine = [
  [q(0, "E5"), q(4, "E5"), q(8, "F5"), q(12, "G5")],
  [q(0, "G5"), q(4, "F5"), q(8, "E5"), q(12, "D5")],
  [q(0, "C5"), q(4, "C5"), q(8, "D5"), q(12, "E5")],
];
const odePhrase = (cadence) => [
  ode(odeLine[0], halves("C3", "G3")),
  ode(odeLine[1], halves("G2", "D3")),
  ode(odeLine[2], halves("C3", "G3")),
  cadence,
];
const odeToJoy = {
  id: "ode-to-joy",
  title: "Ode to Joy",
  subtitle: "Theme from Symphony No. 9 in D minor · Op. 125",
  composer: "Ludwig van Beethoven",
  dates: "(1770–1827)",
  tempo: "Allegro assai",
  dynamic: "p",
  time: [4, 4],
  sharps: 0,
  beamEvery: 4,
  sixteenth: 0.13,
  measures: [
    ...odePhrase(
      ode([n(0, "E5", 6), n(6, "D5", 2), h(8, "D5")], halves("G2", "D3")),
    ),
    ...odePhrase(
      ode([n(0, "D5", 6), n(6, "C5", 2), h(8, "C5")], halves("G2", "C3")),
    ),
    ode([q(0, "D5"), q(4, "D5"), q(8, "E5"), q(12, "C5")], halves("G2", "C3")),
    ode(
      [q(0, "D5"), n(4, "E5", 2), n(6, "F5", 2), q(8, "E5"), q(12, "C5")],
      halves("G2", "C3"),
    ),
    ode(
      [q(0, "D5"), n(4, "E5", 2), n(6, "F5", 2), q(8, "E5"), q(12, "D5")],
      halves("G2", "B2"),
    ),
    ode([q(0, "C5"), q(4, "D5"), h(8, "G4")], halves("C3", "G2")),
    ...odePhrase(
      ode(
        [n(0, "D5", 6), n(6, "C5", 2), h(8, "C5")],
        [h(0, "G2"), ...chord(8, ["C3", "E3", "G3"], 8)],
        { final: true },
      ),
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
    "performed in Vienna in 1824. Keep it smooth and singing, with",
    "the left hand quietly marking the harmony on each half bar.",
  ],
};

// --- Canon in D -------------------------------------------------------------
const canonBass = [
  halves("D3", "A2"),
  halves("B2", "F#2"),
  halves("G2", "D2"),
  halves("G2", "A2"),
];
const canonBar = (rh, i) => bar(16, rh, canonBass[i % 4]);
const dyads = (a, b) => [...chord(0, a, 8), ...chord(8, b, 8)];
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
  sixteenth: 0.16,
  measures: [
    halves("F#5", "E5"),
    halves("D5", "C#5"),
    halves("B4", "A4"),
    halves("B4", "C#5"),
    halves("D5", "C#5"),
    halves("B4", "A4"),
    halves("G4", "F#4"),
    halves("G4", "E4"),
    [q(0, "D5"), q(4, "F#5"), q(8, "A5"), q(12, "G5")],
    [q(0, "F#5"), q(4, "D5"), q(8, "F#5"), q(12, "E5")],
    [q(0, "D5"), q(4, "B4"), q(8, "D5"), q(12, "A4")],
    [q(0, "G4"), q(4, "B4"), q(8, "A4"), q(12, "G4")],
    dyads(["A4", "F#5"], ["A4", "E5"]),
    dyads(["F#4", "D5"], ["A4", "C#5"]),
    dyads(["D4", "B4"], ["F#4", "A4"]),
    dyads(["G4", "B4"], ["A4", "C#5"]),
  ]
    .map(canonBar)
    .concat(
      bar(16, chord(0, ["F#4", "A4", "D5"], 16), chord(0, ["D2", "D3"], 16), {
        final: true,
      }),
    ),
  pages: [
    [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15, 16],
    ],
  ],
  notes: [
    "A ground bass of eight notes repeats beneath the whole piece",
    "while the upper voice unfolds ever more elaborate variations.",
    "Let each half note ring into the next; the canon should breathe.",
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
  sixteenth: 0.14,
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
    prelude("C4", "E4", "G4", "C5", "E5"),
    bar(16, chord(0, ["E4", "G4", "C5"], 16), chord(0, ["C3", "C4"], 16), {
      final: true,
    }),
  ],
  pages: [
    [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11, 12],
    ],
  ],
  notes: [
    "The first prelude of The Well-Tempered Clavier (1722). Every bar",
    "is a single harmony, broken into the same flowing figure.",
    "This edition gives the opening bars and an abridged cadence.",
  ],
};

// --- Amazing Grace ----------------------------------------------------------
const waltz = (root, pair) => [q(0, root), ...chord(4, pair, 8)];
const G = waltz("G2", ["B2", "D3"]);
const C = waltz("C3", ["E3", "G3"]);
const D = waltz("D3", ["F#3", "A3"]);
const hymn = (rh, lh, extra) => bar(12, rh, lh, extra);
const long = (a, b, c) => [h(0, a), n(8, b, 2), n(10, c, 2)];
const step = (a, b) => [h(0, a), q(8, b)];
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
  sixteenth: 0.14,
  measures: [
    { length: 4, rh: [q(0, "D4")], lh: [], pickup: true },
    hymn(long("G4", "B4", "G4"), G),
    hymn(step("B4", "A4"), G),
    hymn(step("G4", "E4"), C),
    hymn(step("D4", "D4"), G),
    hymn(long("G4", "B4", "G4"), G),
    hymn([h(0, "B4"), n(8, "A4", 2), n(10, "B4", 2)], G),
    hymn([n(0, "D5", 12)], D),
    hymn(step("D5", "B4"), D),
    hymn(long("D5", "B4", "G4"), G),
    hymn(step("B4", "A4"), G),
    hymn(step("G4", "E4"), C),
    hymn(step("D4", "D4"), G),
    hymn(long("G4", "B4", "G4"), G),
    hymn(step("B4", "A4"), D),
    hymn([n(0, "G4", 12)], chord(0, ["G2", "D3"], 12), { final: true }),
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
    "lean on the long notes and let the left hand’s waltz stay soft.",
  ],
};

export const SONGS = [furElise, odeToJoy, canon, bach, amazingGrace];

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parsePitch(pitch) {
  const [, letter, accidental, octave] = pitch.match(/^([A-G])(#?)(\d)$/);
  return {
    letter,
    accidental,
    octave: Number(octave),
    midi:
      12 * (Number(octave) + 1) +
      LETTERS[letter] +
      (accidental === "#" ? 1 : 0),
    // Diatonic step, for staff placement: C4 = 28.
    step: "CDEFGAB".indexOf(letter) + 7 * Number(octave),
  };
}

/** Timed note events for playback, in seconds from the first note. */
export function scoreEvents(song) {
  const order = song.playOrder ?? song.measures.map((_, i) => i);
  const events = [];
  let start = 0;
  for (const index of order) {
    const measure = song.measures[index];
    for (const hand of ["rh", "lh"]) {
      for (const note of measure[hand]) {
        events.push({
          time: (start + note.pos + (note.play ?? 0)) * song.sixteenth,
          duration: (note.hold ?? note.dur) * song.sixteenth,
          midi: parsePitch(note.pitch).midi,
          hand: hand === "rh" ? "right" : "left",
          velocity: hand === "rh" ? 0.66 : 0.5,
          measure: index,
        });
      }
    }
    start += measure.length;
  }
  return events.sort((a, b) => a.time - b.time);
}
