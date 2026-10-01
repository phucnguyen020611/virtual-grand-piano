import * as THREE from "three";
import { SONGS } from "../performance/songs.js";

/**
 * The closing credits, rolled up through the lantern's disc like the end of
 * a film, and coming to rest on the developer's card.
 */

const SCRIPT = '"Pinyon Script", "Cormorant Garamond", Georgia, cursive';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Jost", system-ui, sans-serif';
const SIZE = 1024; // the disc's slide, as in composerProjection.js
const SPEED = 80; // px a second: about thirteen seconds a disc
const WIDTH = 700; // kept inside the disc's chord
const GOLD = "#f6d98f";
const HAND = ["400", SCRIPT];
const ROMAN = ["500", SERIF];
const ITALIC = ["italic 500", SERIF];

const DEVELOPER = { name: "Phuc Nguyen Hoang", role: "Developer" };

/** Each section: a heading, then lines as "name" or ["name", "aside"]. */
const CREDITS = [
  [
    "Piano samples",
    ["Salamander Grand Piano V3", "Alexander Holm · CC BY 3.0"],
  ],
  ["Repertoire", ...SONGS.map((song) => [song.title, song.composer])],
  ["Above the organ", ["Parnassus, 1761", "Anton Raphael Mengs"]],
  [
    "Portraits in the hall",
    ["Johann Sebastian Bach", "Elias Gottlob Haussmann"],
    ["Joseph Haydn", "Thomas Hardy"],
    ["Wolfgang Amadeus Mozart", "Barbara Krafft"],
    ["Ludwig van Beethoven", "Joseph Karl Stieler"],
    ["Franz Schubert", "Wilhelm August Rieder"],
    ["Frédéric Chopin", "Ary Scheffer"],
    ["Franz Liszt", "Henri Lehmann"],
    ["Claude Debussy", "Marcel Baschet"],
  ],
  ["Typefaces", "Cormorant Garamond", "Pinyon Script", "Jost", "Noto Music"],
  ["Built with", "Three.js", "Vite", "Web Audio API", "Web MIDI API"],
];

/** Lay out (and, given a context, draw) the roll; returns its parts' ends. */
function layout(g, avatar) {
  let y = 40; // headroom for the script's tall capitals
  const text = (string, [style, family], size, gap, glow = 0) => {
    y += gap + size;
    if (!g) return;
    g.font = `${style} ${size}px ${family}`;
    g.shadowBlur = glow;
    g.fillText(string, SIZE / 2, y, WIDTH);
  };
  const caps = (string, size, gap) => {
    y += gap + size;
    if (!g) return;
    g.font = `600 ${size}px ${SANS}`;
    g.letterSpacing = "0.32em";
    g.shadowBlur = 6;
    // Letter spacing trails the last letter; nudge it back to centre.
    g.fillText(string.toUpperCase(), SIZE / 2 + size * 0.16, y, WIDTH);
    g.letterSpacing = "0px";
  };
  text("Virtual Grand Piano", HAND, 124, 0, 24);
  text("An interactive concert grand in a Viennese hall", ITALIC, 40, 30);
  for (const [heading, ...lines] of CREDITS) {
    y += 150;
    caps(heading, 28, 0);
    for (const line of lines) {
      const [name, aside] = Array.isArray(line) ? line : [line];
      text(name, ROMAN, 50, 34, 8);
      if (aside) text(aside, ITALIC, 34, 8);
    }
  }
  // The card: a large round portrait over the name, held at the end.
  y += 340;
  const radius = 270;
  const centre = y + radius;
  if (g && avatar) {
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, centre, radius, 0, 2 * Math.PI);
    g.clip();
    const side = Math.min(avatar.width, avatar.height);
    g.drawImage(
      avatar,
      (avatar.width - side) / 2,
      (avatar.height - side) / 2,
      side,
      side,
      SIZE / 2 - radius,
      centre - radius,
      2 * radius,
      2 * radius,
    );
    g.restore();
    g.strokeStyle = "#c99a45";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(SIZE / 2, centre, radius + 10, 0, 2 * Math.PI);
    g.stroke();
  }
  y = centre + radius;
  text(DEVELOPER.name, HAND, 100, 34, 26);
  caps(DEVELOPER.role, 32, 26);
  // Come to rest with the card in the middle of the disc.
  const cardMiddle = (centre - radius + y + 24) / 2;
  return { height: y + 24, end: cardMiddle + SIZE / 2 };
}

/** A slide (see composerProjection.js) that rolls the credits as it ticks. */
export function creditsSlide() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const { height, end } = layout(null);
  const roll = document.createElement("canvas");
  roll.width = SIZE;
  roll.height = height;
  let scroll = 0;

  const paint = () => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(roll, 0, SIZE - scroll);
    // Lines melt into the dark as they enter and leave the beam.
    for (const [from, to] of [
      [0, 200],
      [SIZE, SIZE - 200],
    ]) {
      const fade = g.createLinearGradient(0, from, 0, to);
      fade.addColorStop(0, "#000");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = fade;
      g.fillRect(0, Math.min(from, to), SIZE, 200);
    }
    texture.needsUpdate = true;
  };

  const avatar = new Image();
  avatar.src = `${import.meta.env.BASE_URL}art/developer.jpg`;
  Promise.all([
    avatar.decode().catch(() => {}),
    document.fonts?.load(`100px ${SCRIPT}`),
    document.fonts?.load(`600 28px ${SANS}`),
    document.fonts?.load(`italic 500 40px ${SERIF}`),
  ])
    .catch(() => {})
    .then(() => {
      const r = roll.getContext("2d");
      r.textAlign = "center";
      r.fillStyle = GOLD;
      r.shadowColor = "rgba(255, 200, 110, 0.9)";
      layout(r, avatar.naturalWidth ? avatar : null);
      paint();
      texture.userData.ready = true;
    });

  texture.userData.restart = () => (scroll = 0);
  texture.userData.tick = (dt) => {
    if (scroll >= end) return;
    scroll = Math.min(end, scroll + SPEED * Math.min(dt, 0.1));
    paint();
  };
  return texture;
}
