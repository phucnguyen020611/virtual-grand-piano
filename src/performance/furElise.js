/**
 * Für Elise (Beethoven, Bagatelle in A minor, WoO 59) — public domain.
 * Simplified performing edition: the A section with its repeat and first /
 * second endings, a shortened B section, then A again. Positions and
 * durations are in sixteenth notes (3/8 time: six per bar).
 *
 * One source of truth for the engraved score, autoplay and note highlights.
 */
const n = (pos, pitch, dur = 1) => ({ pos, pitch, dur });
const arpeggio = (a, b, c) => [n(0, a), n(1, b), n(2, c)];
const bar = (rh, lh = [], extra = {}) => ({ length: 6, rh, lh, ...extra });

const theme1 = bar([
  n(0, "E5"),
  n(1, "D#5"),
  n(2, "E5"),
  n(3, "B4"),
  n(4, "D5"),
  n(5, "C5"),
]);
const theme2 = bar(
  [n(0, "A4", 2), n(3, "C4"), n(4, "E4"), n(5, "A4")],
  arpeggio("A2", "E3", "A3"),
);
const theme3 = bar(
  [n(0, "B4", 2), n(3, "E4"), n(4, "G#4"), n(5, "B4")],
  arpeggio("E2", "E3", "G#3"),
);
const theme4 = bar(
  [n(0, "C5", 2), n(3, "E4"), n(4, "E5"), n(5, "D#5")],
  arpeggio("A2", "E3", "A3"),
);
const theme7 = bar(
  [n(0, "B4", 2), n(3, "E4"), n(4, "C5"), n(5, "B4")],
  arpeggio("E2", "E3", "G#3"),
);
const firstA = [theme1, theme2, theme3, theme4, theme1, theme2, theme7];
const secondA = firstA.map((measure) => ({ ...measure }));

/** Visual measures, in engraved order. Index 0 is the pickup. */
export const MEASURES = [
  { length: 2, rh: [n(0, "E5"), n(1, "D#5")], lh: [], pickup: true },
  ...firstA,
  bar([n(0, "A4", 2), n(4, "E5"), n(5, "D#5")], arpeggio("A2", "E3", "A3"), {
    volta: 1,
    repeatEnd: true,
  }),
  bar(
    [n(0, "A4", 2), n(3, "B4"), n(4, "C5"), n(5, "D5")],
    arpeggio("A2", "E3", "A3"),
    { volta: 2 },
  ),
  bar(
    [n(0, "E5", 3), n(3, "G4"), n(4, "F5"), n(5, "E5")],
    arpeggio("C3", "G3", "C4"),
  ),
  bar(
    [n(0, "D5", 3), n(3, "F4"), n(4, "E5"), n(5, "D5")],
    arpeggio("G2", "G3", "B3"),
  ),
  bar(
    [n(0, "C5", 3), n(3, "E4"), n(4, "D5"), n(5, "C5")],
    arpeggio("A2", "E3", "A3"),
  ),
  bar(
    [n(0, "B4", 2), n(3, "E4"), n(4, "E5"), n(5, "D#5")],
    arpeggio("E2", "E3", "G#3"),
  ),
  ...secondA,
  bar([n(0, "A4", 6)], [n(0, "A2"), n(1, "E3"), n(2, "A3", 4)], {
    final: true,
  }),
];

/** Performance order: the repeat returns to bar 1, then takes the 2nd ending. */
export const PLAY_ORDER = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21,
];

/** Measures per system, per music page. */
export const MUSIC_PAGES = [
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
];

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
export function scoreEvents(sixteenth = 0.2) {
  const events = [];
  let start = 0;
  for (const index of PLAY_ORDER) {
    const measure = MEASURES[index];
    for (const hand of ["rh", "lh"]) {
      for (const note of measure[hand]) {
        events.push({
          time: (start + note.pos) * sixteenth,
          duration: note.dur * sixteenth,
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
