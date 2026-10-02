import * as THREE from "three";
import { makeCanvasTexture } from "./materials.js";
import { parsePitch, timeline } from "../performance/songs.js";

// --- Engraving -------------------------------------------------------------
// A small engraver for the repertoire: grand staff, key and time signatures,
// chords, beams, flags, dots, accidentals, rests, voltas and repeats, drawn
// onto canvas like a printed urtext page.

const PAGE_W = 1024;
const PAGE_H = 1366;
const PAPER = "#f4efe2";
const INK = "#1d1b18";
const TEXT_FONT = '"Cormorant Garamond", Georgia, serif';
const SCRIPT_FONT = '"Pinyon Script", "Cormorant Garamond", Georgia, serif';
const MUSIC_FONT = '"Noto Music", "Bravura", serif';
const SP = 8.5; // staff space
const MARGIN_X = 86;
const STAFF_GAP = 8.5 * SP; // treble bottom line to bass top line
const TREBLE_BOTTOM_STEP = parsePitch("E4").step;
const BASS_BOTTOM_STEP = parsePitch("G2").step;
// Key-signature sharps in order (F C G D A E B), as staff steps.
const SHARP_STEPS = {
  treble: ["F5", "C5", "G5", "D5", "A4", "E5", "B4"].map(
    (p) => parsePitch(p).step,
  ),
  bass: ["F3", "C3", "G3", "D3", "A2", "E3", "B2"].map(
    (p) => parsePitch(p).step,
  ),
};
const SHARP_ORDER = "FCGDAEB";

const GLYPH = {
  treble: "\u{1D11E}",
  bass: "\u{1D122}",
  wholeRest: "\u{1D13B}",
  halfRest: "\u{1D13C}",
  quarterRest: "\u{1D13D}",
  eighthRest: "\u{1D13E}",
  sixteenthRest: "\u{1D13F}",
  sharp: "♯",
  flat: "♭",
  natural: "♮",
};
const ACCIDENTAL = { "#": GLYPH.sharp, b: GLYPH.flat, "": GLYPH.natural };

function paper(g, w, h, seed) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  // Faint fibres and an aged edge, deterministic per page.
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "rgba(120,96,60,0.035)";
  for (let i = 0; i < 900; i++)
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 0.6 + rand());
  const edge = g.createRadialGradient(
    w / 2,
    h / 2,
    h * 0.35,
    w / 2,
    h / 2,
    h * 0.8,
  );
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(120,90,50,0.10)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}

function text(
  g,
  value,
  x,
  y,
  size,
  {
    weight = 500,
    italic = false,
    align = "center",
    spacing = 0,
    script = false,
  } = {},
) {
  g.font = script
    ? `400 ${size}px ${SCRIPT_FONT}`
    : `${italic ? "italic " : ""}${weight} ${size}px ${TEXT_FONT}`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  if ("letterSpacing" in g) g.letterSpacing = `${spacing}px`;
  g.fillText(value, x, y);
  if ("letterSpacing" in g) g.letterSpacing = "0px";
}

function glyph(g, value, x, y, size) {
  g.font = `${size}px ${MUSIC_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(value, x, y);
}

function staffLines(g, x0, x1, top) {
  g.lineWidth = 1.1;
  for (let l = 0; l < 5; l++) {
    const y = top + l * SP;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
  }
}

function brace(g, x, top, bottom) {
  const mid = (top + bottom) / 2;
  const w = 9;
  g.beginPath();
  g.moveTo(x, top);
  g.bezierCurveTo(
    x - w * 1.6,
    top + (mid - top) * 0.3,
    x + w * 0.6,
    mid - 14,
    x - w,
    mid,
  );
  g.bezierCurveTo(
    x + w * 0.6,
    mid + 14,
    x - w * 1.6,
    bottom - (bottom - mid) * 0.3,
    x,
    bottom,
  );
  g.bezierCurveTo(
    x - w * 0.9,
    bottom - (bottom - mid) * 0.3,
    x + w * 1.4,
    mid + 10,
    x - w - 1.5,
    mid,
  );
  g.bezierCurveTo(
    x + w * 1.4,
    mid - 10,
    x - w * 0.9,
    top + (mid - top) * 0.3,
    x,
    top,
  );
  g.fill();
}

const bottomStep = (staff) =>
  staff.clef === "treble" ? TREBLE_BOTTOM_STEP : BASS_BOTTOM_STEP;
const noteY = (step, staff) =>
  staff.top + 4 * SP - (step - bottomStep(staff)) * (SP / 2);

function ledgerLines(g, x, step, staff) {
  const bottom = bottomStep(staff);
  const top = bottom + 8;
  g.lineWidth = 1.2;
  const draw = (s) => {
    const y = noteY(s, staff);
    g.beginPath();
    g.moveTo(x - SP * 1.1, y);
    g.lineTo(x + SP * 1.1, y);
    g.stroke();
  };
  for (let s = bottom - 2; s >= step; s -= 2) draw(s);
  for (let s = top + 2; s <= step; s += 2) draw(s);
}

function notehead(g, x, y, hollow) {
  g.beginPath();
  g.ellipse(x, y, SP * 0.66, SP * 0.46, -0.36, 0, Math.PI * 2);
  g.fill();
  if (hollow) {
    // Open head: a tilted counter punched out of the oval.
    g.save();
    g.fillStyle = PAPER;
    g.beginPath();
    g.ellipse(x, y, SP * 0.46, SP * 0.2, -0.62, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function flag(g, stemX, tipY, up) {
  const d = up ? 1 : -1;
  g.beginPath();
  g.moveTo(stemX, tipY);
  g.bezierCurveTo(
    stemX + SP * 0.3,
    tipY + d * SP * 1.1,
    stemX + SP * 1.5,
    tipY + d * SP * 1.5,
    stemX + SP * 0.9,
    tipY + d * SP * 3,
  );
  g.bezierCurveTo(
    stemX + SP * 1.1,
    tipY + d * SP * 1.9,
    stemX + SP * 0.3,
    tipY + d * SP * 1.6,
    stemX,
    tipY + d * SP * 1.3,
  );
  g.fill();
}

// Rest glyphs and their baseline on the staff, by length in sixteenths.
const RESTS = [
  [8, GLYPH.halfRest, 2],
  [4, GLYPH.quarterRest, 2.9],
  [2, GLYPH.eighthRest, 3],
  [1, GLYPH.sixteenthRest, 3],
];

function drawRests(g, measure, chords, staff, slotX) {
  if (!chords.length && !measure.pickup) {
    // Whole-bar rest hangs from the fourth line, whatever the metre.
    glyph(
      g,
      GLYPH.wholeRest,
      slotX((measure.length - 1) / 2),
      staff.top + 1.25 * SP,
      SP * 4,
    );
    return;
  }
  const occupied = new Array(measure.length).fill(false);
  for (const c of chords)
    for (let p = c.pos; p < Math.min(measure.length, c.pos + c.dur); p++)
      occupied[p] = true;
  for (let p = 0; p < measure.length;) {
    if (occupied[p]) {
      p++;
      continue;
    }
    let free = 0;
    while (p + free < measure.length && !occupied[p + free]) free++;
    const [size, mark, line] = RESTS.find(([s]) => s <= free && p % s === 0);
    glyph(g, mark, slotX(p + (size - 1) / 2), staff.top + line * SP, SP * 4);
    p += size;
  }
}

/** Notes of one hand grouped into chords by onset. */
function chordsOf(notes, staff, keySharps) {
  const accidentals = new Map();
  const byPos = new Map();
  for (const note of notes) {
    const p = parsePitch(note.pitch);
    const key = p.letter + p.octave;
    const previous = accidentals.has(key)
      ? accidentals.get(key)
      : keySharps.has(p.letter)
        ? "#"
        : "";
    const mark = p.accidental !== previous ? ACCIDENTAL[p.accidental] : null;
    accidentals.set(key, p.accidental);
    if (!byPos.has(note.pos))
      byPos.set(note.pos, { pos: note.pos, dur: note.dur, heads: [] });
    byPos.get(note.pos).heads.push({ ...p, y: noteY(p.step, staff), mark });
  }
  return [...byPos.values()]
    .sort((a, b) => a.pos - b.pos)
    .map((c) => ({ ...c, heads: c.heads.sort((a, b) => a.step - b.step) }));
}

function drawStaffNotes(g, chords, staff, slotX, beamEvery) {
  const middle = bottomStep(staff) + 4;
  // Beam consecutive eighths (or sixteenths) of the same value within a beat.
  const groups = [];
  for (const c of chords) {
    const last = groups.at(-1);
    const beamable = c.dur <= 2;
    const joins =
      beamable &&
      last &&
      last[0].dur === c.dur &&
      last.at(-1).pos + last.at(-1).dur === c.pos &&
      Math.floor(last[0].pos / beamEvery) === Math.floor(c.pos / beamEvery);
    if (joins) last.push(c);
    else groups.push([c]);
  }

  for (const group of groups) {
    const steps = group.flatMap((c) => c.heads.map((h) => h.step));
    const up = steps.reduce((a, b) => a + b, 0) / steps.length < middle;
    const stemLength = SP * 3.4;
    for (const c of group) {
      c.x = slotX(c.pos);
      const hollow = c.dur >= 8;
      c.heads.forEach((head, i) => {
        // A second in a chord puts the upper head on the far side of the stem.
        const clash =
          i > 0 &&
          head.step - c.heads[i - 1].step === 1 &&
          !c.heads[i - 1].shifted;
        head.shifted = clash;
        const hx = c.x + (clash ? (up ? 1 : -1) * SP * 1.3 : 0);
        ledgerLines(g, hx, head.step, staff);
        notehead(g, hx, head.y, hollow);
        if (head.mark)
          glyph(g, head.mark, c.x - SP * 1.75, head.y + SP * 0.9, SP * 3);
        if ([3, 6, 12].includes(c.dur)) {
          g.beginPath();
          const dotY = head.step % 2 === 0 ? head.y - SP / 2 : head.y;
          g.arc(
            c.x + SP * (clash ? 2.5 : 1.25),
            dotY,
            SP * 0.22,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
      });
      // Stems run from the far head to beyond the near one.
      c.stemX = c.x + (up ? SP * 0.6 : -SP * 0.6);
      c.farY = up ? c.heads[0].y : c.heads.at(-1).y;
      c.nearY = up ? c.heads.at(-1).y : c.heads[0].y;
    }
    if (group[0].dur >= 16) continue; // whole notes have no stem
    const first = group[0];
    const last = group.at(-1);
    let tipA = first.nearY + (up ? -stemLength : stemLength);
    let tipB = last.nearY + (up ? -stemLength : stemLength);
    if (group.length > 1) {
      // Gentle beam slope, then push the beam clear of every notehead.
      const dx = last.stemX - first.stemX || 1;
      const slope = THREE.MathUtils.clamp((tipB - tipA) / dx, -0.12, 0.12);
      tipB = tipA + slope * dx;
      let shift = 0;
      for (const c of group) {
        const beamY = tipA + slope * (c.stemX - first.stemX);
        const need = up
          ? c.nearY - SP * 2.8 - beamY
          : beamY - (c.nearY + SP * 2.8);
        shift = Math.min(shift, need);
      }
      tipA += up ? shift : -shift;
      tipB += up ? shift : -shift;
    }
    const tipAt = (c) =>
      group.length > 1
        ? tipA +
          ((tipB - tipA) * (c.stemX - first.stemX)) /
            (last.stemX - first.stemX || 1)
        : tipA;
    g.lineWidth = 1.3;
    for (const c of group) {
      g.beginPath();
      g.moveTo(c.stemX, c.farY + (up ? -SP * 0.15 : SP * 0.15));
      g.lineTo(c.stemX, tipAt(c));
      g.stroke();
    }
    if (group.length > 1) {
      const beams = first.dur === 1 ? 2 : 1;
      for (let beam = 0; beam < beams; beam++) {
        const offset = beam * SP * 0.78 * (up ? 1 : -1);
        const thick = up ? SP * 0.48 : -SP * 0.48;
        g.beginPath();
        g.moveTo(first.stemX, tipA + offset);
        g.lineTo(last.stemX, tipB + offset);
        g.lineTo(last.stemX, tipB + offset + thick);
        g.lineTo(first.stemX, tipA + offset + thick);
        g.closePath();
        g.fill();
      }
    } else if (first.dur <= 3) {
      flag(g, first.stemX, tipA, up);
      if (first.dur === 1)
        flag(g, first.stemX, tipA + (up ? SP * 0.9 : -SP * 0.9), up);
    }
  }
}

// Where each printed bar landed, per song: { page, x0, x1, top, bottom,
// from, to } in page pixels (`from`/`to`: the first and last beat's x).
const layouts = new WeakMap();

function drawSystem(g, song, measures, top, first, record) {
  const treble = { clef: "treble", top };
  const bass = { clef: "bass", top: top + 4 * SP + STAFF_GAP };
  const bottom = bass.top + 4 * SP;
  const x0 = MARGIN_X;
  const x1 = PAGE_W - MARGIN_X;
  const barLength = (16 * song.time[0]) / song.time[1];
  const keySharps = new Set(SHARP_ORDER.slice(0, song.sharps));
  g.strokeStyle = g.fillStyle = INK;
  staffLines(g, x0, x1, treble.top);
  staffLines(g, x0, x1, bass.top);
  brace(g, x0 - 7, treble.top, bottom);
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x0, treble.top);
  g.lineTo(x0, bottom);
  g.stroke();

  glyph(g, GLYPH.treble, x0 + 22, treble.top + 3 * SP, SP * 4.1);
  glyph(g, GLYPH.bass, x0 + 22, bass.top + SP, SP * 4.1);
  let header = 46;
  for (const [staff, clef] of [
    [treble, "treble"],
    [bass, "bass"],
  ])
    for (let i = 0; i < song.sharps; i++)
      glyph(
        g,
        GLYPH.sharp,
        x0 + header + i * 9,
        noteY(SHARP_STEPS[clef][i], staff) + SP * 0.9,
        SP * 3,
      );
  header += song.sharps * 9 + 8;
  if (first) {
    for (const staff of [treble, bass]) {
      text(
        g,
        String(song.time[0]),
        x0 + header + 12,
        staff.top + 2 * SP - 1,
        SP * 2.9,
        { weight: 700 },
      );
      text(
        g,
        String(song.time[1]),
        x0 + header + 12,
        staff.top + 4 * SP - 1,
        SP * 2.9,
        { weight: 700 },
      );
    }
    header += 34;
  } else {
    text(g, String(measures[0]), x0 + 2, treble.top - SP * 1.4, 15, {
      italic: true,
      align: "left",
    });
  }

  const weights = measures.map((i) =>
    Math.max(0.5, song.measures[i].length / barLength),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = x0 + header;
  const width = x1 - cursor;
  measures.forEach((index, k) => {
    const measure = song.measures[index];
    const mx0 = cursor;
    const mx1 = cursor + (width * weights[k]) / total;
    cursor = mx1;
    const padL = SP * 2.4;
    const padR = SP * 1.2;
    const slot = (mx1 - mx0 - padL - padR) / measure.length;
    const slotX = (pos) => mx0 + padL + (pos + 0.5) * slot;
    record?.(index, {
      x0: mx0,
      x1: mx1,
      top: treble.top - SP * 2.2,
      bottom: bottom + SP * 2.2,
      from: slotX(0),
      to: slotX(measure.length),
    });
    for (const [staff, hand] of [
      [treble, "rh"],
      [bass, "lh"],
    ]) {
      const chords = chordsOf(measure[hand], staff, keySharps);
      drawStaffNotes(g, chords, staff, slotX, song.beamEvery);
      drawRests(g, measure, chords, staff, slotX);
    }

    // Barline, repeat or final double bar.
    g.lineWidth = 1.3;
    if (measure.repeatEnd || measure.final) {
      g.fillRect(mx1 - 4, treble.top, 4, bottom - treble.top);
      g.beginPath();
      g.moveTo(mx1 - 8, treble.top);
      g.lineTo(mx1 - 8, bottom);
      g.stroke();
      if (measure.repeatEnd)
        for (const staff of [treble, bass])
          for (const line of [1.5, 2.5]) {
            g.beginPath();
            g.arc(mx1 - 13, staff.top + line * SP, SP * 0.26, 0, Math.PI * 2);
            g.fill();
          }
    } else {
      g.beginPath();
      g.moveTo(mx1, treble.top);
      g.lineTo(mx1, bottom);
      g.stroke();
    }

    if (measure.volta) {
      const vy = treble.top - SP * 3.4;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(mx0 + 3, vy + SP * 1.6);
      g.lineTo(mx0 + 3, vy);
      g.lineTo(mx1 - 6, vy);
      if (measure.volta === 1) g.lineTo(mx1 - 6, vy + SP * 1.6);
      g.stroke();
      text(g, `${measure.volta}.`, mx0 + 8, vy + SP * 1.5, 16, {
        weight: 700,
        align: "left",
      });
    }
  });
  return { x0: x0 + header };
}

function drawMusicPage(g, w, h, song, pageIndex) {
  paper(g, w, h, 11 + pageIndex * 7);
  g.fillStyle = g.strokeStyle = INK;
  let top = 150;
  if (pageIndex === 0) {
    text(g, song.title, w / 2, 128, 64, { script: true });
    text(g, song.subtitle, w / 2, 166, 22, { italic: true });
    text(g, song.composer, w - MARGIN_X, 214, 21, { align: "right" });
    text(g, song.dates, w - MARGIN_X, 236, 15, {
      align: "right",
      italic: true,
    });
    text(g, song.tempo, MARGIN_X, 250, 21, { weight: 700, align: "left" });
    top = 300;
  }
  const layout = layouts.get(song);
  song.pages[pageIndex].forEach((system, s) => {
    const first = pageIndex === 0 && s === 0;
    const { x0 } = drawSystem(g, song, system, top, first, (index, rect) =>
      layout?.set(index, { ...rect, page: pageIndex }),
    );
    if (first && song.dynamic)
      text(g, song.dynamic, x0 + 110, top + 4 * SP + STAFF_GAP / 2 + 6, 22, {
        weight: 700,
        italic: true,
      });
    top += 232;
  });
  text(g, String(pageIndex + 2), w / 2, h - 58, 16);
}

function drawTitlePage(g, w, h, song) {
  paper(g, w, h, 3);
  g.fillStyle = g.strokeStyle = INK;
  text(g, song.composer.toUpperCase(), w / 2, 330, 26, {
    weight: 600,
    spacing: 6,
  });
  g.lineWidth = 1;
  for (const y of [372, 378]) {
    g.beginPath();
    g.moveTo(w / 2 - 170, y);
    g.lineTo(w / 2 + 170, y);
    g.stroke();
  }
  text(g, song.title, w / 2, 520, song.title.length > 12 ? 92 : 120, {
    script: true,
  });
  const [primary, secondary] = song.subtitle.split(" · ");
  text(g, primary, w / 2, 590, 30, { italic: true });
  if (secondary) text(g, secondary, w / 2, 632, 24);
  glyph(g, GLYPH.treble, w / 2, 790, 90);
  text(g, "Simplified performing edition", w / 2, 930, 22, { italic: true });
  text(g, "VIRTUAL GRAND PIANO EDITION", w / 2, h - 140, 16, {
    weight: 600,
    spacing: 4,
  });
  text(g, "Composition in the public domain", w / 2, h - 110, 14, {
    italic: true,
  });
}

function drawNotesPage(g, w, h, song, pageNumber) {
  paper(g, w, h, 29);
  g.fillStyle = g.strokeStyle = INK;
  text(g, "Performance notes", MARGIN_X, 150, 34, {
    weight: 600,
    align: "left",
  });
  song.notes.forEach((line, i) =>
    text(g, line, MARGIN_X, 214 + i * 34, 21, { align: "left" }),
  );
  for (let s = 0; s < 6; s++)
    staffLines(g, MARGIN_X, w - MARGIN_X, 470 + s * 130);
  text(g, String(pageNumber), w / 2, h - 58, 16);
}

function drawManuscriptPage(g, w, h, pageNumber) {
  paper(g, w, h, 41);
  g.fillStyle = g.strokeStyle = INK;
  for (let s = 0; s < 9; s++)
    staffLines(g, MARGIN_X, w - MARGIN_X, 150 + s * 125);
  text(g, String(pageNumber), w / 2, h - 58, 16);
}

/** The four printed pages for a song: title, music (1–2), notes, manuscript. */
function pageDrawers(song) {
  const pages = [
    (g, w, h) => drawTitlePage(g, w, h, song),
    ...song.pages.map((_, i) => (g, w, h) => drawMusicPage(g, w, h, song, i)),
  ];
  pages.push((g, w, h) => drawNotesPage(g, w, h, song, pages.length + 1));
  while (pages.length < 4) {
    const number = pages.length + 1;
    pages.push((g, w, h) => drawManuscriptPage(g, w, h, number));
  }
  return pages;
}

/**
 * A page texture; `mirrored` renders the verso so it reads correctly on a
 * BackSide face. The gutter darkens toward the spine like a bound book.
 */
function pageTexture(maxAniso, mirrored) {
  let draw = () => {};
  const paint = (g, w, h) => {
    g.save();
    if (mirrored) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    draw(g, w, h);
    g.restore();
    // Recto spine is on its left; a mirrored verso's spine lands there too.
    const gutter = g.createLinearGradient(0, 0, w * 0.09, 0);
    gutter.addColorStop(0, "rgba(70,52,30,0.28)");
    gutter.addColorStop(1, "rgba(70,52,30,0)");
    g.fillStyle = gutter;
    g.fillRect(0, 0, w * 0.09, h);
  };
  const texture = makeCanvasTexture(paint, PAGE_W, PAGE_H, maxAniso);
  texture.userData.paint = (next) => {
    if (next) draw = next;
    paint(texture.image.getContext("2d"), PAGE_W, PAGE_H);
    texture.needsUpdate = true;
  };
  return texture;
}

// --- Book --------------------------------------------------------------------

const PAGE_WIDTH = 0.98;
const PAGE_HEIGHT = 1.3;
const SEGMENTS = 24;
const TURN_SECONDS = 0.95;

/**
 * An open score on the music desk. Two leaves (title / music, music or notes
 * / notes or manuscript) turn about the spine with a travelling curl.
 * Opens at the music; `setSong` reprints the pages for another piece.
 */
export function createScoreBook(maxAniso, song) {
  const group = new THREE.Group();
  group.name = "score-book";

  const cloth = new THREE.MeshStandardMaterial({
    color: 0x1d2a45,
    roughness: 0.86,
  });
  const endpaper = new THREE.MeshStandardMaterial({
    color: 0xe6dcc4,
    roughness: 0.95,
  });
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(PAGE_WIDTH * 2 + 0.07, PAGE_HEIGHT + 0.05, 0.018),
    [cloth, cloth, cloth, cloth, endpaper, cloth],
  );
  cover.position.z = -0.011;
  cover.castShadow = cover.receiveShadow = true;
  group.add(cover);

  const textures = [];
  const leaves = [0, 1].map((index) => {
    const geometry = new THREE.PlaneGeometry(
      PAGE_WIDTH,
      PAGE_HEIGHT,
      SEGMENTS,
      1,
    );
    geometry.translate(PAGE_WIDTH / 2, 0, 0);
    const base = geometry.attributes.position.array.slice();
    const frontTex = pageTexture(maxAniso, false);
    const backTex = pageTexture(maxAniso, true);
    textures.push(frontTex, backTex);
    const material = (map, side) =>
      new THREE.MeshStandardMaterial({
        map,
        side,
        roughness: 0.92,
        color: 0xffffff,
      });
    const recto = new THREE.Mesh(geometry, material(frontTex, THREE.FrontSide));
    const verso = new THREE.Mesh(geometry, material(backTex, THREE.BackSide));
    for (const mesh of [recto, verso])
      mesh.castShadow = mesh.receiveShadow = true;
    const leaf = new THREE.Group();
    leaf.add(recto, verso);
    group.add(leaf);
    return {
      index,
      geometry,
      base,
      angle: 0,
      from: 0,
      to: 0,
      t: 1,
      direction: 1,
    };
  });

  let current = song;
  let bars = [];
  function setSong(next) {
    current = next;
    layouts.set(next, new Map());
    pageDrawers(next).forEach((draw, i) => textures[i].userData.paint(draw));
    bars = timeline(next).map(({ index, start, unit, measure }) => ({
      index,
      start,
      end: start + measure.length * unit,
    }));
  }
  setSong(song);

  let turned = 1; // leaves lying on the left: opens at the music spread
  const restAngle = (leaf) => {
    // Stacks fan slightly off the cover; the top sheet of each stack is nearest.
    const onLeft = leaf.index < turned;
    const depth = onLeft ? leaf.index : leaves.length - 1 - leaf.index;
    const lift = 0.03 + 0.014 * depth;
    return onLeft ? Math.PI - lift : lift;
  };

  function shape(leaf) {
    const position = leaf.geometry.attributes.position;
    const theta = leaf.angle;
    const moving = leaf.t < 1;
    // The free edge lags the spine while turning: a travelling curl.
    const curl = moving ? -leaf.direction * 1.25 * Math.sin(theta) : 0;
    for (let i = 0; i < position.count; i++) {
      const x = leaf.base[i * 3];
      const s = x / PAGE_WIDTH;
      let px;
      let pz;
      if (Math.abs(curl) < 1e-4) {
        px = x * Math.cos(theta);
        pz = x * Math.sin(theta);
      } else {
        px =
          (PAGE_WIDTH * (Math.sin(theta + curl * s) - Math.sin(theta))) / curl;
        pz =
          (PAGE_WIDTH * (Math.cos(theta) - Math.cos(theta + curl * s))) / curl;
      }
      position.setXYZ(i, px, leaf.base[i * 3 + 1], pz);
    }
    position.needsUpdate = true;
    leaf.geometry.computeVertexNormals();
    leaf.geometry.computeBoundingSphere();
  }

  for (const leaf of leaves) {
    leaf.angle = leaf.from = leaf.to = restAngle(leaf);
    shape(leaf);
  }

  function turnTo(spread) {
    const next = THREE.MathUtils.clamp(spread, 0, leaves.length);
    if (next === turned) return false;
    const direction = next > turned ? 1 : -1;
    turned = next;
    for (const leaf of leaves) {
      const target = restAngle(leaf);
      if (Math.abs(target - leaf.angle) < 1e-4) continue;
      const crossing = Math.abs(target - leaf.angle) > 1;
      leaf.from = leaf.angle;
      leaf.to = target;
      leaf.t = crossing ? 0 : 1;
      leaf.direction = direction;
      if (!crossing) {
        leaf.angle = target;
        shape(leaf);
      }
    }
    return true;
  }

  function update(dt, instant = false) {
    for (const leaf of leaves) {
      if (leaf.t >= 1) continue;
      leaf.t = instant ? 1 : Math.min(1, leaf.t + dt / TURN_SECONDS);
      const e =
        leaf.t < 0.5 ? 2 * leaf.t * leaf.t : 1 - (-2 * leaf.t + 2) ** 2 / 2;
      leaf.angle = THREE.MathUtils.lerp(leaf.from, leaf.to, e);
      shape(leaf);
    }
  }

  // Following the music: a soft gilt wash over the bar being played and a
  // fine line sweeping through it, on whichever open page holds it.
  const overlay = (material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    m.visible = false;
    group.add(m);
    return m;
  };
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const glow = glowCanvas.getContext("2d");
  glow.shadowColor = glow.fillStyle = "#fff";
  glow.shadowBlur = 18;
  glow.fillRect(22, 22, 84, 84);
  const wash = overlay(
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      color: 0xe0a83c,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const line = overlay(
    new THREE.MeshBasicMaterial({
      color: 0xa4441f,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const LIFT = 0.03; // the open pages' rest angle off the cover (restAngle)
  /** Place `mesh` over page pixels [x0, x1] × [top, bottom] of an open page. */
  function lay(mesh, page, x0, x1, top, bottom) {
    const side = page === 0 ? -1 : 1; // music starts on the left-hand page
    const u = (x0 + x1) / 2 / PAGE_W;
    const d = (side > 0 ? u : 1 - u) * PAGE_WIDTH; // distance from the spine
    mesh.position.set(
      side * d * Math.cos(LIFT),
      PAGE_HEIGHT / 2 - ((top + bottom) / 2 / PAGE_H) * PAGE_HEIGHT,
      d * Math.sin(LIFT) + 0.004,
    );
    mesh.rotation.y = -side * LIFT;
    mesh.scale.set(
      ((x1 - x0) / PAGE_W) * PAGE_WIDTH,
      ((bottom - top) / PAGE_H) * PAGE_HEIGHT,
      1,
    );
  }
  /** Mark the bar sounding at `t` seconds into the piece (null: none);
   *  returns the marked bar's index, or null. */
  function follow(t) {
    const settled = turned === 1 && leaves.every((leaf) => leaf.t >= 1);
    const bar = t !== null && t >= 0 && settled && bars.find((b) => t < b.end);
    const rect = bar && layouts.get(current)?.get(bar.index);
    wash.visible = line.visible = Boolean(rect) && rect.page < 2;
    if (!wash.visible) return null;
    const x = THREE.MathUtils.lerp(
      rect.from,
      rect.to,
      (t - bar.start) / (bar.end - bar.start),
    );
    lay(wash, rect.page, rect.x0, rect.x1, rect.top, rect.bottom);
    lay(line, rect.page, x - 2, x + 2, rect.top + 6, rect.bottom - 6);
    return bar.index;
  }

  // Click the right-hand page to turn forward, the left-hand page to go back.
  const local = new THREE.Vector3();
  group.userData.onPick = (hit) => {
    group.worldToLocal(local.copy(hit.point));
    turnTo(turned + (local.x >= 0 ? 1 : -1));
  };

  // Web fonts arrive after first paint; reprint once they are ready.
  if (typeof document !== "undefined" && document.fonts?.load) {
    Promise.all([
      document.fonts.load(`600 40px ${TEXT_FONT}`),
      document.fonts.load(`italic 500 40px ${TEXT_FONT}`),
      document.fonts.load(`40px ${SCRIPT_FONT}`),
      document.fonts.load(
        `40px ${MUSIC_FONT}`,
        GLYPH.treble + GLYPH.bass + GLYPH.eighthRest + GLYPH.flat + GLYPH.sharp,
      ),
    ])
      .then(() => setSong(current))
      .catch(() => {});
  }

  return {
    group,
    turnTo,
    update,
    setSong,
    follow,
    get spread() {
      return turned;
    },
    get turning() {
      return leaves.some((leaf) => leaf.t < 1);
    },
    width: PAGE_WIDTH * 2,
    height: PAGE_HEIGHT,
  };
}
