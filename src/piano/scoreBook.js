import * as THREE from "three";
import { makeCanvasTexture } from "./materials.js";
import { MEASURES, MUSIC_PAGES, parsePitch } from "../performance/furElise.js";

// --- Engraving -------------------------------------------------------------
// A small engraver for this one score: grand staff, beams, accidentals, rests,
// voltas and repeats, drawn onto canvas like a printed urtext page.

const PAGE_W = 1024;
const PAGE_H = 1366;
const PAPER = "#f4efe2";
const INK = "#1d1b18";
const TEXT_FONT = '"Cormorant Garamond", Georgia, serif';
const MUSIC_FONT = '"Noto Music", "Bravura", serif';
const SP = 8.5; // staff space
const MARGIN_X = 86;
const STAFF_GAP = 8.5 * SP; // treble bottom line to bass top line
const TREBLE_BOTTOM_STEP = parsePitch("E4").step;
const BASS_BOTTOM_STEP = parsePitch("G2").step;

const GLYPH = {
  treble: "\u{1D11E}",
  bass: "\u{1D122}",
  wholeRest: "\u{1D13B}",
  eighthRest: "\u{1D13E}",
  sixteenthRest: "\u{1D13F}",
  sharp: "♯",
  natural: "♮",
};

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
  { weight = 500, italic = false, align = "center", spacing = 0 } = {},
) {
  g.font = `${italic ? "italic " : ""}${weight} ${size}px ${TEXT_FONT}`;
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

function noteY(step, staff) {
  return staff.clef === "treble"
    ? staff.top + 4 * SP - (step - TREBLE_BOTTOM_STEP) * (SP / 2)
    : staff.top + 4 * SP - (step - BASS_BOTTOM_STEP) * (SP / 2);
}

function ledgerLines(g, x, step, staff) {
  const bottom =
    staff.clef === "treble" ? TREBLE_BOTTOM_STEP : BASS_BOTTOM_STEP;
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

function notehead(g, x, y) {
  g.beginPath();
  g.ellipse(x, y, SP * 0.66, SP * 0.46, -0.36, 0, Math.PI * 2);
  g.fill();
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

function drawRests(g, measure, notes, staff, slotX) {
  if (!notes.length) {
    if (measure.pickup) {
      glyph(g, GLYPH.eighthRest, slotX(0.5), staff.top + 3 * SP, SP * 4);
      return;
    }
    // Whole-bar rest hangs from the fourth line.
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
  for (const note of notes)
    for (let p = note.pos; p < note.pos + note.dur; p++) occupied[p] = true;
  for (let p = 0; p < measure.length;) {
    if (occupied[p]) {
      p++;
      continue;
    }
    if (p % 2 === 0 && p + 1 < measure.length && !occupied[p + 1]) {
      glyph(g, GLYPH.eighthRest, slotX(p + 0.5), staff.top + 3 * SP, SP * 4);
      p += 2;
    } else {
      glyph(g, GLYPH.sixteenthRest, slotX(p), staff.top + 3 * SP, SP * 4);
      p++;
    }
  }
}

function drawStaffNotes(g, measure, notes, staff, slotX) {
  const accidentals = new Map();
  const placed = notes.map((note) => {
    const p = parsePitch(note.pitch);
    const x = slotX(note.pos);
    const y = noteY(p.step, staff);
    const key = p.letter + p.octave;
    const previous = accidentals.get(key) ?? "";
    let mark = null;
    if (p.accidental !== previous)
      mark = p.accidental ? GLYPH.sharp : GLYPH.natural;
    accidentals.set(key, p.accidental);
    return { ...note, ...p, x, y, mark };
  });

  // Beam maximal runs of consecutive sixteenths.
  const groups = [];
  for (const note of placed) {
    const last = groups.at(-1);
    if (
      note.dur === 1 &&
      last &&
      last[0].dur === 1 &&
      last.at(-1).pos + 1 === note.pos &&
      last.length < 6
    )
      last.push(note);
    else groups.push([note]);
  }
  const middle =
    staff.clef === "treble" ? TREBLE_BOTTOM_STEP + 4 : BASS_BOTTOM_STEP + 4;

  for (const group of groups) {
    const avg = group.reduce((sum, n) => sum + n.step, 0) / group.length;
    const up = avg < middle;
    const stemLength = SP * 3.4;
    for (const note of group) {
      ledgerLines(g, note.x, note.step, staff);
      notehead(g, note.x, note.y);
      if (note.mark)
        glyph(g, note.mark, note.x - SP * 1.75, note.y + SP * 0.9, SP * 3);
      if (note.dur === 3 || note.dur === 6) {
        g.beginPath();
        const dotY = note.step % 2 === 0 ? note.y - SP / 2 : note.y;
        g.arc(note.x + SP * 1.25, dotY, SP * 0.22, 0, Math.PI * 2);
        g.fill();
      }
    }
    const stemX = (note) => note.x + (up ? SP * 0.6 : -SP * 0.6);
    const first = group[0];
    const last = group.at(-1);
    let tipA = first.y + (up ? -stemLength : stemLength);
    let tipB = last.y + (up ? -stemLength : stemLength);
    if (group.length > 1) {
      // Gentle beam slope, then push the beam clear of every notehead.
      const dx = stemX(last) - stemX(first) || 1;
      const slope = THREE.MathUtils.clamp((tipB - tipA) / dx, -0.12, 0.12);
      tipB = tipA + slope * dx;
      let shift = 0;
      for (const note of group) {
        const beamY = tipA + slope * (stemX(note) - stemX(first));
        const need = up
          ? note.y - SP * 2.8 - beamY
          : beamY - (note.y + SP * 2.8);
        shift = Math.min(shift, need);
      }
      tipA += up ? shift : -shift;
      tipB += up ? shift : -shift;
    }
    const tipAt = (note) =>
      group.length > 1
        ? tipA +
          ((tipB - tipA) * (stemX(note) - stemX(first))) /
            (stemX(last) - stemX(first) || 1)
        : tipA;
    g.lineWidth = 1.3;
    for (const note of group) {
      g.beginPath();
      g.moveTo(stemX(note), note.y + (up ? -SP * 0.15 : SP * 0.15));
      g.lineTo(stemX(note), tipAt(note));
      g.stroke();
    }
    if (group.length > 1) {
      for (let beam = 0; beam < 2; beam++) {
        const offset = beam * SP * 0.78 * (up ? 1 : -1);
        g.beginPath();
        g.moveTo(stemX(first), tipA + offset);
        g.lineTo(stemX(last), tipB + offset);
        g.lineTo(stemX(last), tipB + offset + (up ? SP * 0.48 : -SP * 0.48));
        g.lineTo(stemX(first), tipA + offset + (up ? SP * 0.48 : -SP * 0.48));
        g.closePath();
        g.fill();
      }
    } else if (first.dur === 1 || first.dur === 2 || first.dur === 3) {
      flag(g, stemX(first), tipA, up);
      if (first.dur === 1)
        flag(g, stemX(first), tipA + (up ? SP * 0.9 : -SP * 0.9), up);
    }
  }
}

function drawSystem(g, measures, top, first, { finalPage = false } = {}) {
  const treble = { clef: "treble", top };
  const bass = { clef: "bass", top: top + 4 * SP + STAFF_GAP };
  const bottom = bass.top + 4 * SP;
  const x0 = MARGIN_X;
  const x1 = PAGE_W - MARGIN_X;
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
  let header = 54;
  if (first) {
    for (const staff of [treble, bass]) {
      text(g, "3", x0 + 66, staff.top + 2 * SP - 1, SP * 2.9, { weight: 700 });
      text(g, "8", x0 + 66, staff.top + 4 * SP - 1, SP * 2.9, { weight: 700 });
    }
    header = 88;
  } else {
    text(g, String(measures[0]), x0 + 2, treble.top - SP * 1.4, 15, {
      italic: true,
      align: "left",
    });
  }

  const weights = measures.map((i) => (MEASURES[i].pickup ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = x0 + header;
  const width = x1 - cursor;
  measures.forEach((index, k) => {
    const measure = MEASURES[index];
    const mx0 = cursor;
    const mx1 = cursor + (width * weights[k]) / total;
    cursor = mx1;
    const padL = SP * 2.4;
    const padR = SP * 1.2;
    const slot = (mx1 - mx0 - padL - padR) / measure.length;
    const slotX = (pos) => mx0 + padL + (pos + 0.5) * slot;
    for (const [staff, hand] of [
      [treble, "rh"],
      [bass, "lh"],
    ]) {
      drawStaffNotes(g, measure, measure[hand], staff, slotX);
      drawRests(g, measure, measure[hand], staff, slotX);
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
  if (finalPage) return bottom;
  return bottom;
}

function drawMusicPage(g, w, h, pageIndex) {
  paper(g, w, h, 11 + pageIndex * 7);
  g.fillStyle = g.strokeStyle = INK;
  let top = 150;
  if (pageIndex === 0) {
    text(g, "Für Elise", w / 2, 128, 60, { weight: 600 });
    text(g, "Bagatelle in A minor · WoO 59", w / 2, 166, 22, { italic: true });
    text(g, "Ludwig van Beethoven", w - MARGIN_X, 214, 21, { align: "right" });
    text(g, "(1770–1827)", w - MARGIN_X, 236, 15, {
      align: "right",
      italic: true,
    });
    text(g, "Poco moto", MARGIN_X, 250, 21, { weight: 700, align: "left" });
    top = 300;
  }
  MUSIC_PAGES[pageIndex].forEach((system, s) => {
    const first = pageIndex === 0 && s === 0;
    drawSystem(g, system, top, first);
    if (first)
      text(g, "pp", MARGIN_X + 205, top + 4 * SP + STAFF_GAP / 2 + 6, 22, {
        weight: 700,
        italic: true,
      });
    top += 232;
  });
  text(g, String(pageIndex + 2), w / 2, h - 58, 16);
}

function drawTitlePage(g, w, h) {
  paper(g, w, h, 3);
  g.fillStyle = g.strokeStyle = INK;
  text(g, "LUDWIG VAN BEETHOVEN", w / 2, 330, 26, { weight: 600, spacing: 6 });
  g.lineWidth = 1;
  for (const y of [372, 378]) {
    g.beginPath();
    g.moveTo(w / 2 - 170, y);
    g.lineTo(w / 2 + 170, y);
    g.stroke();
  }
  text(g, "Für Elise", w / 2, 520, 104, { weight: 600 });
  text(g, "Bagatelle in A minor", w / 2, 590, 32, { italic: true });
  text(g, "WoO 59", w / 2, 632, 24);
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

function drawNotesPage(g, w, h) {
  paper(g, w, h, 29);
  g.fillStyle = g.strokeStyle = INK;
  text(g, "Performance notes", MARGIN_X, 150, 34, {
    weight: 600,
    align: "left",
  });
  const lines = [
    "Composed in 1810 and published only in 1867, forty years after",
    "Beethoven’s death, from a manuscript that has since been lost.",
    "Poco moto — with a little motion. Keep the sixteenths even and",
    "let the broken chords of the left hand flow beneath the melody.",
    "Pedal lightly, changing with each new harmony.",
  ];
  lines.forEach((line, i) =>
    text(g, line, MARGIN_X, 214 + i * 34, 21, { align: "left" }),
  );
  for (let s = 0; s < 6; s++)
    staffLines(g, MARGIN_X, w - MARGIN_X, 470 + s * 130);
  text(g, "5", w / 2, h - 58, 16);
}

/**
 * Draw a page; `mirrored` renders the verso so it reads correctly on a
 * BackSide face. The gutter darkens toward the spine like a bound book.
 */
function pageTexture(draw, maxAniso, mirrored) {
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
  texture.userData.repaint = () => {
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
 * An open score on the music desk. Two leaves (title / page 2, page 3 /
 * notes) turn about the spine with a travelling curl. Opens at the music.
 */
export function createScoreBook(maxAniso) {
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

  const faces = [
    [
      (g, w, h) => drawTitlePage(g, w, h),
      (g, w, h) => drawMusicPage(g, w, h, 0),
    ],
    [
      (g, w, h) => drawMusicPage(g, w, h, 1),
      (g, w, h) => drawNotesPage(g, w, h),
    ],
  ];
  const textures = [];
  const leaves = faces.map(([front, back], index) => {
    const geometry = new THREE.PlaneGeometry(
      PAGE_WIDTH,
      PAGE_HEIGHT,
      SEGMENTS,
      1,
    );
    geometry.translate(PAGE_WIDTH / 2, 0, 0);
    const base = geometry.attributes.position.array.slice();
    const frontTex = pageTexture(front, maxAniso, false);
    const backTex = pageTexture(back, maxAniso, true);
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

  // Click the right-hand page to turn forward, the left-hand page to go back.
  const local = new THREE.Vector3();
  group.userData.onPick = (hit) => {
    group.worldToLocal(local.copy(hit.point));
    turnTo(turned + (local.x >= 0 ? 1 : -1));
  };

  // Web fonts arrive after first paint; repaint once they are ready.
  if (typeof document !== "undefined" && document.fonts?.load) {
    Promise.all([
      document.fonts.load(`600 40px ${TEXT_FONT}`),
      document.fonts.load(`italic 500 40px ${TEXT_FONT}`),
      document.fonts.load(
        `40px ${MUSIC_FONT}`,
        GLYPH.treble + GLYPH.bass + GLYPH.eighthRest,
      ),
    ])
      .then(() => textures.forEach((texture) => texture.userData.repaint()))
      .catch(() => {});
  }

  return {
    group,
    turnTo,
    update,
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
