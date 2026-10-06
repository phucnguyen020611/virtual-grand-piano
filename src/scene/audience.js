import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * A court audience in about seven seats of ten, dressed as for an evening at
 * a palace in the 1770s, in true seated proportions (1 unit ≈ 20 cm).
 *
 * Gentlemen: the habit à la française. A velvet coat cut away over the hips,
 * its fronts and cuffs edged in gold or silver, over a brocade waistcoat; a
 * linen stock and lace jabot, lace at the wrists; breeches buckled at the
 * knee, silk stockings, buckled shoes, many on the red heels of the court. A
 * few wear the blue sash and star of an order, a few an officer's
 * epaulettes. Most wear a powdered bag wig (a raised toupee, two rolls over
 * each ear, the queue in a black silk bag); the rest their own hair, tied.
 *
 * Ladies: the robe à la française. A silk gown open over a brocade
 * petticoat and stomacher, the stomacher laced with a ladder of bows, wide
 * neckline edged in lace, elbow sleeves ending in a silk flounce and two
 * tiers of lace; bare arms or long gloves; a choker ribbon or pearls, pearl
 * drops at the ears. Hair raised in a pouf with curls at the sides, some
 * plumed, some strung with pearls, or dressed lower with a long ringlet over
 * the shoulder and flowers. Some hold an open fan on the lap.
 *
 * Faces are painted (eyes, lids, brows, lips, the rouge of the period) on a
 * sculpted head with jaw, cheekbones and chin; hair is combed in strands.
 *
 * Each part is an instanced mesh in one of eight frames: the body; the head,
 * turning on the neck; and on each side the upper arm (at the shoulder), the
 * forearm (at the elbow) and the hand (at the wrist), so that applause lifts
 * the elbows, brings the hands together palm to palm and beats them. A part
 * may be worn by only some of a group (the `who` test).
 *
 * Built in seat space (+y up, −z toward the stage, floor at y = 0, the seat
 * cushion's top at 2.35).
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const UP = V(0, 1, 0);
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const bell = (d, w) => Math.exp(-(d * d) / (w * w));
const lerp = THREE.MathUtils.lerp;
const mix3 = (a, b, t) => a.map((v, k) => lerp(v, b[k], t));

const soup = (parts) =>
  mergeGeometries(
    parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute("uv"); // only the textured parts keep their own
      return flat;
    }),
  );
const soupUv = (parts) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

/** Turn a part built along −y from the origin to run from `from` along `dir`. */
const aim = (g, from, dir) =>
  g
    .applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(DOWN, dir.clone().normalize()),
    )
    .translate(from.x, from.y, from.z);

/** A limb from a to b, its radius running through `radii`, ends rounded. */
function tube(a, b, radii, seg = 10, scale) {
  const from = V(...a);
  const dir = V(...b).sub(from);
  const L = dir.length();
  const last = radii.length - 1;
  const [r0, r1] = [radii[0], radii[last]];
  const pts = [
    [0, -L - r1],
    [r1 * 0.8, -L - r1 * 0.6],
  ];
  for (let k = last; k >= 0; k--) pts.push([radii[k], (-L * k) / last]);
  pts.push([r0 * 0.8, r0 * 0.6], [0, r0]);
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
  if (scale) g.scale(...scale);
  return aim(g, from, dir);
}

/** Rolled hair: turn the strands to wind round the roll, not along it. */
function rolled(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 2, uv.getX(i));
  return g;
}

const ball = (r, [x, y, z], scale = [1, 1, 1], rot = [0, 0, 0], detail) =>
  new THREE.SphereGeometry(r, ...(detail ?? [10, 7]))
    .scale(...scale)
    .rotateX(rot[0])
    .rotateY(rot[1])
    .rotateZ(rot[2])
    .translate(x, y, z);
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/**
 * Lofted cloth. A ring is [y, rx, rz, cz, { gap, n, folds, waves, tilt }]: an
 * ellipse (a squarer superellipse for n > 2) about x = 0, z = cz; `gap`
 * leaves the front open by that angle either side (0 = front, toward −z);
 * `folds` ripples it in `waves` round; `tilt` drops the back below the front.
 */
function onRing([y, rx, rz, cz, o = {}], a, grow = 0) {
  const { n = 2, folds = 0, tilt = 0, waves = 13 } = o;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const e = 2 / n;
  const f = 1 + folds * Math.sin(a * waves);
  return V(
    (rx + grow) * f * Math.sign(s) * Math.abs(s) ** e,
    y + tilt * c,
    cz - (rz + grow) * f * Math.sign(c) * Math.abs(c) ** e,
  );
}
/** Rings bottom to top. */
function loft(rings, seg = 24, [us, vs] = [1, 1]) {
  const pos = [];
  const uv = [];
  const index = [];
  const row = seg + 1;
  rings.forEach((ring, k) => {
    const gap = ring[4]?.gap ?? 0;
    for (let j = 0; j <= seg; j++) {
      const t = j / seg;
      const a = gap
        ? gap + t * (2 * Math.PI - 2 * gap)
        : Math.PI + t * 2 * Math.PI;
      pos.push(...onRing(ring, a).toArray());
      uv.push(t * us, (k / (rings.length - 1)) * vs);
    }
    if (k)
      for (let j = 0; j < seg; j++) {
        const A = (k - 1) * row + j;
        const C = A + row;
        index.push(A, C, A + 1, A + 1, C, C + 1);
      }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
/** The ring at height y, between those given. */
function ringAt(rings, y) {
  const above = rings.findIndex((r) => r[0] > y);
  const k = THREE.MathUtils.clamp(
    (above < 0 ? rings.length : above) - 1,
    0,
    rings.length - 2,
  );
  const [a, b] = [rings[k], rings[k + 1]];
  const t = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  const [oa, ob] = [a[4] ?? {}, b[4] ?? {}];
  return [
    y,
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t),
    {
      n: lerp(oa.n ?? 2, ob.n ?? 2, t),
      gap: lerp(oa.gap ?? 0, ob.gap ?? 0, t),
    },
  ];
}
/** A trim along the open edge of a loft, on `side` (±1). */
const edging = (rings, side, r, grow = 0.012) =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(
      rings.map((ring) => onRing(ring, side * ring[4].gap, grow)),
    ),
    rings.length * 3,
    r,
    3,
  );
/** A ribbon laid on a loft's surface from [y, angle] to [y, angle]. */
function band(rings, from, to, width, grow, steps = 12) {
  const pos = [];
  const index = [];
  for (let k = 0; k <= steps; k++) {
    const y = lerp(from[0], to[0], k / steps);
    const a = lerp(from[1], to[1], k / steps);
    for (const d of [-width / 2, width / 2])
      pos.push(...onRing(ringAt(rings, y + d), a, grow).toArray());
    if (k) index.push(2 * k - 2, 2 * k, 2 * k - 1, 2 * k - 1, 2 * k, 2 * k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
/** A string of `count` beads: a torus pinched between them. */
function beads(radius, r, count) {
  const g = new THREE.TorusGeometry(radius, r, 4, count * 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = Math.atan2(y, x);
    const f = 0.45 + 0.55 * Math.abs(Math.sin((u * count) / 2));
    const [cx, cy] = [Math.cos(u) * radius, Math.sin(u) * radius];
    p.setXYZ(i, cx + (x - cx) * f, cy + (y - cy) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

// --- Heads ---------------------------------------------------------------------

const C = V(0, 6.12, 0.38); // the centre of the head
const NECK = V(0, 5.72, 0.48); // where it turns

/**
 * A head sculpted from a sphere (jaw, chin, cheekbones, brow, a flatter
 * face, the skull full behind), its seam at the back so the painted face sits
 * whole at u = 0.5. `dress(x, y, z)` may reshape it further (hair).
 */
function headShape(dress, detail = [24, 18]) {
  const g = new THREE.SphereGeometry(1, ...detail, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const front = Math.max(0, -z);
    const low = smooth(0, -0.95, y);
    x *= 1 - 0.28 * low;
    if (z > 0) z *= 1 + 0.08 * smooth(-0.4, 0.3, y) - 0.4 * low;
    else z *= 1 - 0.14 * smooth(0.4, 1, front);
    x *= 1 + 0.07 * bell(y + 0.18, 0.25) * smooth(0.2, 0.7, front);
    z -= 0.07 * bell(y + 0.86, 0.14) * smooth(0.7, 1, front);
    z -= 0.04 * bell(y - 0.2, 0.12) * smooth(0.75, 1, front);
    z +=
      0.05 *
      bell(Math.abs(x) - 0.4, 0.17) *
      bell(y + 0.02, 0.15) *
      smooth(0.6, 1, front);
    if (dress) [x, y, z] = dress(x, y, z);
    p.setXYZ(i, C.x + x * 0.37, C.y + y * 0.57, C.z + z * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
/**
 * Hair over the head: from a hairline (`line`, its height at the brow) back
 * to the nape, standing `lift` off the scalp; `pouf` raises the crown,
 * `toupee` a roll over the brow. Below the hairline it tucks into the head.
 */
const hairShell = ({ line = 0.6, lift = 1.08, pouf = 0, toupee = 0 }) =>
  headShape(
    (x, y, z) => {
      const edge =
        z > 0 ? -0.08 - 0.72 * z : -0.08 + (line + 0.08) * (-z) ** 0.8;
      // Close to the skin at the hairline, its volume growing above it.
      const on = smooth(edge - 0.12, edge, y);
      const k = 0.93 + 0.08 * on + (lift - 1.01) * smooth(edge, edge + 0.45, y);
      // The pouf: the crown lifted and swelling round, not to a point.
      const rise = pouf * Math.max(0, y) * on;
      const swell = 1 + 0.4 * pouf * smooth(edge, edge + 0.5, y);
      const roll = toupee * bell(z + 0.8, 0.35) * smooth(0.3, 0.75, y) * on;
      return [x * k * swell, y * k + rise + roll, z * k * swell - 0.5 * roll];
    },
    [24, 16],
  );

/** Ears and nose, in skin. */
const features = () => [
  ...[-1, 1].map((s) =>
    ball(
      1,
      [s * 0.365, C.y - 0.06, C.z + 0.06],
      [0.05, 0.13, 0.085],
      [0, s * 0.25, 0],
      [8, 6],
    ),
  ),
  ball(
    1,
    [0, C.y - 0.1, C.z - 0.415],
    [0.038, 0.115, 0.05],
    [0.3, 0, 0],
    [8, 6],
  ),
  ball(
    1,
    [0, C.y - 0.19, C.z - 0.462],
    [0.044, 0.03, 0.032],
    undefined,
    [8, 6],
  ),
];

/**
 * The painted face, as seen from the front, in two layers: tones that
 * multiply the skin (lids, brows, lips, rouge, shading) in RGB, and the eyes,
 * which replace it, weighted by alpha. Points are given on the unit sphere's
 * front (x to the figure's right, y up) before sculpting.
 */
function faceTexture(lady) {
  const W = 1024;
  const H = 512;
  const K = W / (2 * Math.PI); // pixels per unit near the front
  const layer = (fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");
    if (fill) {
      g.fillStyle = fill;
      g.fillRect(0, 0, W, H);
    }
    return g;
  };
  const tone = layer("#ffffff");
  const eyes = layer();
  const P = (x, y) => {
    const t = Math.acos(y);
    return [
      W * (0.5 + Math.asin(-x / Math.sin(t)) / (2 * Math.PI)),
      (H * t) / Math.PI,
    ];
  };
  const blot = (x, y, r, rgb, a) => {
    const [cx, cy] = P(x, y);
    const fill = tone.createRadialGradient(cx, cy, 0, cx, cy, r * K);
    fill.addColorStop(0, `rgba(${rgb},${a})`);
    fill.addColorStop(1, `rgba(${rgb},0)`);
    tone.fillStyle = fill;
    tone.fillRect(cx - r * K, cy - r * K, 2 * r * K, 2 * r * K);
  };
  const curve = (g, pts, width, color) => {
    g.strokeStyle = color;
    g.lineWidth = width * K;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(...P(...pts[0]));
    g.quadraticCurveTo(...P(...pts[1]), ...P(...pts[2]));
    g.stroke();
  };

  // Shading: sockets, under the nose and lip, along the jaw; then rouge.
  for (const s of [-1, 1]) {
    blot(s * 0.4, 0.04, 0.26, lady ? "150,105,120" : "140,100,90", 0.32);
    blot(s * 0.13, -0.22, 0.09, "150,105,95", 0.22);
    blot(s * 0.56, -0.3, 0.34, "225,95,100", lady ? 0.5 : 0.2);
  }
  blot(0, -0.44, 0.1, "130,90,80", 0.4);
  blot(0, -0.7, 0.1, "140,100,90", 0.25);
  blot(0, -0.98, 0.32, "150,110,100", 0.2);

  // Brows, then the lips: the upper darker, a line between.
  for (const s of [-1, 1])
    curve(
      tone,
      [
        [s * 0.17, 0.15],
        [s * 0.42, 0.25],
        [s * 0.66, 0.13],
      ],
      lady ? 0.034 : 0.05,
      lady ? "rgba(95,70,55,0.7)" : "rgba(70,50,38,0.8)",
    );
  const [mx, my] = P(0, -0.56);
  const hw = 0.3 * K;
  tone.fillStyle = lady ? "rgb(178,82,92)" : "rgb(176,118,112)";
  tone.beginPath();
  tone.moveTo(mx - hw, my);
  tone.quadraticCurveTo(mx - 0.14 * K, my - 0.09 * K, mx, my - 0.05 * K);
  tone.quadraticCurveTo(mx + 0.14 * K, my - 0.09 * K, mx + hw, my);
  tone.quadraticCurveTo(mx, my + 0.02 * K, mx - hw, my);
  tone.fill();
  tone.fillStyle = lady ? "rgb(200,100,108)" : "rgb(190,132,124)";
  tone.beginPath();
  tone.moveTo(mx - hw * 0.92, my + 0.01 * K);
  tone.quadraticCurveTo(mx, my + 0.15 * K, mx + hw * 0.92, my + 0.01 * K);
  tone.quadraticCurveTo(mx, my + 0.03 * K, mx - hw * 0.92, my + 0.01 * K);
  tone.fill();
  tone.strokeStyle = "rgba(90,40,40,0.75)";
  tone.lineWidth = 0.012 * K;
  tone.beginPath();
  tone.moveTo(mx - hw, my);
  tone.quadraticCurveTo(mx, my + 0.025 * K, mx + hw, my);
  tone.stroke();
  if (lady) {
    // A beauty patch.
    const [bx, by] = P(-0.36, -0.36);
    tone.fillStyle = "rgb(40,30,30)";
    tone.beginPath();
    tone.arc(bx, by, 0.014 * K, 0, Math.PI * 2);
    tone.fill();
  }

  // The eyes: an almond of white, the iris under the upper lid, a lash line
  // and a crease above.
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * 0.4, -0.02);
    const w = 0.17 * K;
    const lift = (lady ? 0.012 : 0) * K * s; // the outer corner a little up
    const almond = (g) => {
      g.beginPath();
      g.moveTo(cx - w, cy + lift);
      g.quadraticCurveTo(cx, cy - 0.15 * K, cx + w, cy - lift);
      g.quadraticCurveTo(cx, cy + 0.1 * K, cx - w, cy + lift);
    };
    almond(eyes);
    eyes.fillStyle = "rgb(222,212,200)";
    eyes.fill();
    eyes.save();
    almond(eyes);
    eyes.clip();
    eyes.fillStyle = lady ? "rgb(70,90,110)" : "rgb(78,56,40)";
    eyes.beginPath();
    eyes.arc(cx, cy - 0.01 * K, 0.066 * K, 0, Math.PI * 2);
    eyes.fill();
    eyes.fillStyle = "rgb(20,14,12)";
    eyes.beginPath();
    eyes.arc(cx, cy - 0.01 * K, 0.028 * K, 0, Math.PI * 2);
    eyes.fill();
    eyes.fillStyle = "rgb(250,250,250)";
    eyes.beginPath();
    eyes.arc(cx - 0.022 * K, cy - 0.035 * K, 0.012 * K, 0, Math.PI * 2);
    eyes.fill();
    const lid = eyes.createLinearGradient(0, cy - 0.08 * K, 0, cy);
    lid.addColorStop(0, "rgba(60,40,35,0.7)");
    lid.addColorStop(1, "rgba(60,40,35,0)");
    eyes.fillStyle = lid;
    eyes.fillRect(cx - w, cy - 0.1 * K, 2 * w, 0.1 * K);
    eyes.restore();
    // Lash line along the upper lid, lower lid fainter, the crease above.
    tone.strokeStyle = "rgba(45,30,25,0.95)";
    tone.lineWidth = (lady ? 0.03 : 0.022) * K;
    tone.lineCap = "round";
    tone.beginPath();
    tone.moveTo(cx - w, cy + lift);
    tone.quadraticCurveTo(
      cx,
      cy - 0.15 * K,
      cx + w * (lady ? 1.12 : 1),
      cy - lift * 2,
    );
    tone.stroke();
    tone.strokeStyle = "rgba(110,75,65,0.5)";
    tone.lineWidth = 0.01 * K;
    tone.beginPath();
    tone.moveTo(cx - w * 0.9, cy + lift);
    tone.quadraticCurveTo(cx, cy + 0.1 * K, cx + w * 0.9, cy - lift);
    tone.stroke();
    tone.strokeStyle = "rgba(120,80,70,0.35)";
    tone.lineWidth = 0.012 * K;
    tone.beginPath();
    tone.moveTo(cx - w * 0.85, cy - 0.04 * K);
    tone.quadraticCurveTo(cx, cy - 0.19 * K, cx + w * 0.9, cy - 0.05 * K);
    tone.stroke();
  }

  // One texture: the tones' RGB where there is no eye, the eye's where there
  // is, and its weight in alpha. Rows flip: texture v runs bottom to top.
  const a = tone.getImageData(0, 0, W, H).data;
  const b = eyes.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const i = (r * W + c) * 4;
      const o = ((H - 1 - r) * W + c) * 4;
      const src = b[i + 3] ? b : a;
      data[o] = src[i];
      data[o + 1] = src[i + 1];
      data[o + 2] = src[i + 2];
      data[o + 3] = b[i + 3];
    }
  const map = new THREE.DataTexture(data, W, H);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

/** Fine combed strands in greys, tinted per figure; wraps both ways. */
function strandTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#d4d4d4";
  g.fillRect(0, 0, 128, 128);
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 260; k++) {
    const x = rand() * 128;
    const v = Math.round(150 + rand() * 105);
    const bend = (rand() - 0.5) * 10;
    g.strokeStyle = `rgba(${v},${v},${v},0.7)`;
    g.lineWidth = 0.5 + rand() * 1.3;
    for (const dx of [-128, 0, 128]) {
      g.beginPath();
      g.moveTo(x + dx, 0);
      g.bezierCurveTo(x + dx + bend, 42, x + dx - bend, 86, x + dx, 128);
      g.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 2);
  return map;
}

/** A net of holes with scalloped edges (cut out by alpha). */
function laceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = "destination-out";
  const hole = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let y = 12; y <= 52; y += 8)
    for (let x = (y / 8) % 2 ? 4 : 0; x <= 64; x += 8) hole(x, y, 2.3);
  for (let x = 0; x <= 64; x += 16) {
    hole(x, -1, 6);
    hole(x, 65, 6);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(10, 1);
  return map;
}

/** A woven damask motif in greys, tinted per figure by its instance colour. */
function brocadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#bdbdbd";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#ffffff";
  for (const [x, y] of [
    [32, 32],
    [96, 96],
    [96, 32],
    [32, 96],
  ]) {
    g.save();
    g.translate(x, y);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.ellipse(0, -12, 6, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  return map;
}

// --- Arms and hands -----------------------------------------------------------

// Joints on the right side (x is mirrored for the left): the shoulder, the
// elbow resting on the seat's arm, the wrist over the lap.
const GENT = {
  shoulder: [0.86, 5.0, 0.5],
  elbow: [1.1, 3.36, 0.36],
  wrist: [0.46, 3.22, -0.76],
  droop: 0.25,
  size: 1,
};
const LADY = {
  shoulder: [0.8, 4.92, 0.5],
  elbow: [1.04, 3.34, 0.38],
  wrist: [0.43, 3.32, -0.72],
  droop: 0.35,
  size: 0.88,
};
const joint = (J, name, s) => V(s * J[name][0], J[name][1], J[name][2]);

/** How the hand is laid: from DOWN along the forearm, after a droop. */
function handTurn(J, s) {
  const E = joint(J, "elbow", s);
  const W = joint(J, "wrist", s);
  return new THREE.Quaternion()
    .setFromUnitVectors(DOWN, W.clone().sub(E).normalize())
    .multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -J.droop));
}

/** A hand at the wrist, palm down along the forearm, the fingers a little
 *  curled and together, the thumb inward. */
function handShape(J, s) {
  const parts = [ball(1, [0, -0.24, 0], [0.17, 0.25, 0.07], undefined, [8, 6])];
  for (const [x, len, r] of [
    [0.12, 0.29, 0.04],
    [0.04, 0.32, 0.042],
    [-0.045, 0.3, 0.04],
    [-0.125, 0.24, 0.035],
  ])
    parts.push(
      tube([-s * x, -0.42, 0], [-s * x, -0.42 - len, 0.12], [r, r * 0.85], 4),
    );
  parts.push(
    tube([-s * 0.12, -0.1, 0.03], [-s * 0.22, -0.32, 0.09], [0.05, 0.04], 4),
  );
  const q = handTurn(J, s);
  const W = joint(J, "wrist", s);
  return parts.map((g) =>
    g.scale(J.size, J.size, J.size).applyQuaternion(q).translate(W.x, W.y, W.z),
  );
}
/** A flounce of cloth or lace opening from `at` along `dir`. */
const ruffle = (at, dir, r0, r1, length, folds = 0.18) =>
  aim(
    loft(
      [
        [-length, r1, r1, 0, { folds }],
        [-length * 0.4, (r0 + r1) / 2, (r0 + r1) / 2, 0, { folds: folds / 2 }],
        [0, r0, r0, 0],
      ],
      18,
    ),
    at,
    dir,
  );
/** A flounce hanging from the elbow, longer behind. */
const elbowFlounce = (E, top, r0, r1, length, tilt) =>
  loft(
    [
      [E.y + top - length, r1, r1, E.z, { folds: 0.12, tilt }],
      [E.y + top, r0, r0, E.z],
    ],
    18,
  ).translate(E.x, 0, 0);

// --- Gentlemen ----------------------------------------------------------------

const COAT = [
  [2.5, 0.95, 0.7, 0.4, { gap: 1.6 }],
  [2.9, 0.86, 0.6, 0.45, { gap: 1.35 }],
  [3.5, 0.78, 0.52, 0.48, { gap: 1.02 }],
  [4.2, 0.86, 0.55, 0.48, { gap: 0.62 }],
  [4.75, 0.98, 0.52, 0.5, { gap: 0.42, n: 2.6 }],
  [5.1, 1.04, 0.46, 0.52, { gap: 0.38, n: 3 }],
  [5.3, 0.66, 0.38, 0.52, { gap: 0.4, n: 2.4 }],
  [5.42, 0.34, 0.3, 0.52, { gap: 0.45 }],
];
const VEST = [
  [2.88, 0.7, 0.5, 0.46],
  [3.5, 0.73, 0.48, 0.48],
  [4.2, 0.82, 0.51, 0.48],
  [4.75, 0.93, 0.48, 0.5, { n: 2.6 }],
  [5.1, 0.97, 0.42, 0.52, { n: 3 }],
  [5.32, 0.5, 0.32, 0.52],
  [5.42, 0, 0, 0.52],
];

function gentleman() {
  const J = GENT;
  const onCoat = (y, a, grow) => onRing(ringAt(COAT, y), a, grow);
  const shoe = (s) => {
    const g = ball(
      1,
      [s * 0.47, 0.17, -1.38],
      [0.18, 0.17, 0.5],
      undefined,
      [12, 8],
    );
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const toe = smooth(-1.2, -1.85, p.getZ(i)); // lower toward the toe
      const y = Math.max(0.06, p.getY(i));
      p.setY(i, 0.06 + (y - 0.06) * (1 - 0.45 * toe));
    }
    g.computeVertexNormals();
    return g;
  };
  // An eight-pointed star of an order, on the left breast.
  const star = new THREE.CircleGeometry(0.13, 16);
  const sp = star.attributes.position;
  for (let i = 2; i < sp.count; i += 2)
    sp.setXYZ(i, sp.getX(i) * 0.42, sp.getY(i) * 0.42, 0);
  const starAt = onCoat(4.35, -0.95, 0.02);
  star
    .applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        V(0, 0, 1),
        V(Math.sin(-0.95), 0, -Math.cos(-0.95)),
      ),
    )
    .translate(starAt.x, starAt.y, starAt.z);
  const vestFront = (y) => {
    const r = ringAt(VEST, y);
    return r[3] - r[2];
  };

  return {
    joints: J,
    body: {
      coat: [
        loft(COAT, 24),
        // A standing collar.
        loft(
          [
            [5.36, 0.35, 0.34, 0.5, { gap: 0.95 }],
            [5.6, 0.32, 0.31, 0.5, { gap: 0.95 }],
          ],
          12,
        ),
      ],
      waistcoat: [
        loft(VEST, 22, [3, 2]),
        // Pocket flaps, turned to the cloth.
        ...[-0.75, 0.75].map((a) => {
          const at = onRing(ringAt(VEST, 3.15), a, 0.015);
          return new THREE.BoxGeometry(0.3, 0.1, 0.03)
            .rotateY(-a)
            .translate(at.x, at.y, at.z);
        }),
      ],
      // The stock: a band of linen about the neck, open above.
      linen: [
        loft(
          [
            [5.3, 0.29, 0.29, 0.49],
            [5.45, 0.28, 0.28, 0.48],
            [5.6, 0.265, 0.265, 0.47],
          ],
          16,
        ),
      ],
      // The jabot, falling in folds from the stock.
      lace: [
        loft(
          [
            [4.7, 0.02, 0.01, 0.02],
            [4.82, 0.12, 0.05, 0.0, { folds: 0.35 }],
            [5.0, 0.15, 0.07, 0.02, { folds: 0.3 }],
            [5.18, 0.13, 0.06, 0.08],
            [5.4, 0.1, 0.05, 0.2],
          ],
          16,
        ),
      ],
      breeches: [-1, 1].flatMap((s) => [
        tube(
          [s * 0.42, 2.84, 0.45],
          [s * 0.46, 2.82, -1.42],
          [0.41, 0.4, 0.36, 0.31, 0.27],
          10,
          [1, 1, 0.85],
        ),
        // The band below the knee.
        new THREE.TorusGeometry(0.265, 0.035, 3, 14)
          .rotateX(Math.PI / 2)
          .translate(s * 0.46, 2.48, -1.4),
      ]),
      // Silk stockings over the calf to a slim ankle.
      stockings: [-1, 1].map((s) =>
        tube(
          [s * 0.46, 2.78, -1.42],
          [s * 0.47, 0.38, -1.06],
          [0.26, 0.28, 0.29, 0.26, 0.21, 0.16, 0.14, 0.15],
          8,
        ),
      ),
      shoes: [-1, 1].map(shoe),
      heels: [-1, 1].map((s) => box(0.18, 0.15, 0.2, s * 0.47, 0.075, -1.0)),
      gold: [
        ...[-1, 1].map((s) => edging(COAT, s, 0.034)),
        // Buttons down the right front, those of the waistcoat, the cuffs'
        // edging is on the forearms.
        ...[3.65, 3.95, 4.25, 4.55, 4.85].map((y) =>
          ball(
            0.045,
            onCoat(y, ringAt(COAT, y)[4].gap + 0.1, 0.02).toArray(),
            undefined,
            undefined,
            [6, 4],
          ),
        ),
        ...[3.0, 3.22, 3.44, 3.66, 3.88, 4.1, 4.32, 4.54].map((y) =>
          ball(
            0.028,
            [0, y, vestFront(y) - 0.012],
            undefined,
            undefined,
            [5, 3],
          ),
        ),
        ...[-1, 1].flatMap((s) => [
          box(0.06, 0.1, 0.1, s * 0.73, 2.48, -1.4), // knee buckles
          box(0.22, 0.05, 0.15, s * 0.47, 0.3, -1.3), // shoe buckles
        ]),
      ],
      skin: [tube([0, 5.15, 0.52], [0, 5.95, 0.46], [0.25, 0.24, 0.24], 12)],
      // A tenth wear an order: the blue sash under the coat, its star on it.
      sash: {
        who: 0.1,
        parts: [band(VEST, [5.0, 0.85], [3.3, -0.75], 0.17, 0.03)],
      },
      star: { who: 0.1, parts: [star] },
      // And some are officers, in fringed gold epaulettes.
      epaulettes: {
        who: 0.12,
        parts: [-1, 1].flatMap((s) => [
          ball(1, [s * 0.9, 5.14, 0.5], [0.27, 0.07, 0.21]),
          loft(
            [
              [4.94, 0.29, 0.23, 0.5, { folds: 0.1 }],
              [5.13, 0.27, 0.21, 0.5],
            ],
            20,
          ).translate(s * 0.9, 0, 0),
        ]),
      },
    },
    head: {
      face: [headShape()],
      skin: features(),
      // A powdered bag wig: the toupee, two rolls over each ear, the queue
      // in a black silk bag.
      wig: {
        who: 0.65,
        key: 30,
        parts: [
          hairShell({ line: 0.62, lift: 1.1, toupee: 0.12 }),
          ...[-1, 1].flatMap((s) =>
            [-0.02, -0.19].map((dy) =>
              rolled(
                tube(
                  [s * 0.385, C.y + dy, C.z - 0.1],
                  [s * 0.385, C.y + dy, C.z + 0.36],
                  [0.075, 0.085, 0.075],
                  8,
                ),
              ),
            ),
          ),
        ],
      },
      bag: {
        who: 0.65,
        key: 30,
        parts: [ball(1, [0, C.y - 0.44, C.z + 0.6], [0.19, 0.2, 0.06])],
      },
      natural: {
        who: -0.65,
        key: 30,
        parts: [
          hairShell({ line: 0.55, lift: 1.07 }),
          tube(
            [0, C.y - 0.2, C.z + 0.52],
            [0, C.y - 0.78, C.z + 0.6],
            [0.075, 0.07, 0.05],
            8,
          ),
        ],
      },
      bow: [-1, 1].map((s) =>
        new THREE.ConeGeometry(0.12, 0.26, 8)
          .rotateZ((s * Math.PI) / 2)
          .scale(1, 1, 0.4)
          .translate(s * 0.13, C.y - 0.25, C.z + 0.55),
      ),
    },
    up: (s) => ({
      coat: [
        tube(
          joint(J, "shoulder", s).toArray(),
          joint(J, "elbow", s).toArray(),
          [0.29, 0.25, 0.22, 0.2],
          12,
        ),
      ],
    }),
    fore: (s) => {
      const E = joint(J, "elbow", s);
      const W = joint(J, "wrist", s);
      const dir = W.clone().sub(E);
      const along = (t) => E.clone().lerp(W, t);
      return {
        coat: [
          tube(E.toArray(), along(0.75).toArray(), [0.2, 0.19], 12),
          // The cuff, turned back and flaring, open at the wrist.
          ruffle(along(0.6), dir, 0.215, 0.25, dir.length() * 0.33, 0),
        ],
        gold: [
          aim(
            new THREE.TorusGeometry(0.22, 0.022, 4, 18).rotateX(Math.PI / 2),
            along(0.6),
            dir,
          ),
        ],
        lace: [ruffle(along(0.9), dir, 0.16, 0.22, 0.3)],
      };
    },
    hand: (s) => ({ skin: handShape(J, s) }),
  };
}

// --- Ladies -------------------------------------------------------------------

const BODICE = [
  [3.3, 0.5, 0.38, 0.48, { gap: 0.16 }],
  [3.9, 0.6, 0.42, 0.47, { gap: 0.24 }],
  [4.4, 0.74, 0.5, 0.45, { gap: 0.34 }],
  [4.78, 0.84, 0.47, 0.47, { gap: 0.44, n: 2.6 }],
];
// Over the lap, and falling from the knees to the floor in folds.
const SKIRT = [
  [0.04, 1.36, 0.63, -1.18, { gap: 0.72, folds: 0.05, waves: 7 }],
  [1.2, 1.28, 0.58, -1.18, { gap: 0.66, folds: 0.045, waves: 7 }],
  [2.3, 1.2, 0.57, -1.18, { gap: 0.6, folds: 0.03, n: 2.5, waves: 7 }],
  [2.75, 1.12, 1.06, -0.55, { gap: 0.55, n: 3, folds: 0.012 }],
  [3.02, 0.98, 1.12, -0.28, { gap: 0.48, n: 3, folds: 0.01 }],
  [3.22, 0.78, 0.68, 0.24, { gap: 0.3 }],
  [3.42, 0.52, 0.4, 0.46, { gap: 0.18 }],
];
/** The layer beneath, closed and unfolded so it never shows through. */
const inside = (rings, by) =>
  rings.map(([y, rx, rz, cz, o]) => [
    y,
    rx - by,
    rz - by,
    cz,
    { ...o, gap: 0, folds: 0 },
  ]);

function lady() {
  const J = LADY;
  const stomacher = inside(BODICE, 0.025);
  const front = (y) => {
    const r = ringAt(stomacher, y);
    return r[3] - r[2];
  };
  // The robe's front edges, from the hem to the neckline.
  const robe = [...SKIRT.slice(0, -1), ...BODICE];
  // A long ringlet over the right shoulder.
  const spiral = new THREE.CatmullRomCurve3(
    Array.from({ length: 25 }, (_, k) => {
      const t = k / 24;
      const a = t * Math.PI * 6;
      return V(
        0.34 + 0.05 * Math.cos(a) + 0.08 * t,
        C.y - 0.05 - 0.8 * t,
        C.z + 0.26 + 0.05 * Math.sin(a),
      );
    }),
  );
  const curls = (ys) =>
    [-1, 1].flatMap((s) =>
      ys.map((dy) =>
        rolled(
          tube(
            [s * 0.355, C.y + dy, C.z - 0.02],
            [s * 0.345, C.y + dy, C.z + 0.42],
            [0.08, 0.09, 0.08],
            8,
          ),
        ),
      ),
    );
  const chignon = new THREE.TorusGeometry(0.14, 0.065, 6, 14).translate(
    0,
    C.y + 0.05,
    C.z + 0.5,
  );
  const fan = new THREE.CylinderGeometry(
    0.6,
    0.6,
    0.012,
    16,
    1,
    false,
    Math.PI - 0.95,
    1.9,
  );
  const fp = fan.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const r = Math.hypot(fp.getX(i), fp.getZ(i));
    const j = Math.round(
      (((Math.atan2(fp.getX(i), fp.getZ(i)) + 2 * Math.PI) % (2 * Math.PI)) -
        (Math.PI - 0.95)) /
        (1.9 / 16),
    );
    fp.setY(i, fp.getY(i) + (j % 2 ? 0.02 : -0.02) * (r / 0.6)); // pleats
  }
  fan.computeVertexNormals();
  const fanAt = joint(J, "wrist", 1).add(V(-0.12, 0.02, -0.25));
  fan.rotateY(0.35).rotateX(0.12).translate(fanAt.x, fanAt.y, fanAt.z);

  return {
    joints: J,
    body: {
      gown: [
        loft(BODICE, 24),
        loft(SKIRT, 28),
        // Robings: the gown's pleated edging down either side of the opening.
        ...[-1, 1].map((s) => edging(robe, s, 0.045, 0.01)),
      ],
      petticoat: [
        loft(stomacher, 20, [2, 1.2]),
        loft(inside(SKIRT, 0.07), 28, [4, 2]),
      ],
      skin: [
        loft(
          [
            [4.5, 0.7, 0.44, 0.48],
            [4.82, 0.8, 0.42, 0.5, { n: 2.5 }],
            [4.98, 0.7, 0.38, 0.52, { n: 2.5 }],
            [5.12, 0.5, 0.33, 0.52],
            [5.24, 0.31, 0.26, 0.51],
            [5.34, 0.22, 0.21, 0.5],
          ],
          22,
        ),
        tube([0, 5.15, 0.5], [0, 5.95, 0.45], [0.23, 0.22, 0.21], 12),
      ],
      // Lace standing along the neckline.
      lace: [
        loft(
          [
            [4.75, 0.84, 0.47, 0.47, { n: 2.6 }],
            [4.88, 0.9, 0.52, 0.47, { n: 2.6, folds: 0.03 }],
          ],
          32,
        ),
      ],
      // An échelle: a ladder of bows down the stomacher.
      bows: {
        who: 0.6,
        parts: [4.45, 4.17, 3.9, 3.65].flatMap((y, k) => {
          const z = front(y) - 0.02;
          const sz = 1 - k * 0.1;
          return [
            ...[-1, 1].map((s) =>
              ball(
                1,
                [s * 0.075 * sz, y, z],
                [0.075 * sz, 0.045 * sz, 0.025],
                [0, 0, s * 0.3],
                [8, 5],
              ),
            ),
            ball(0.03, [0, y, z - 0.01], undefined, undefined, [6, 4]),
          ];
        }),
      },
      ribbon: {
        who: 0.5,
        key: 36,
        parts: [
          new THREE.TorusGeometry(0.225, 0.035, 5, 22)
            .rotateX(Math.PI / 2)
            .translate(0, 5.5, 0.47),
        ],
      },
      pearls: {
        who: -0.5,
        key: 36,
        parts: [
          beads(0.31, 0.03, 22)
            .rotateX(Math.PI / 2)
            .rotateX(-0.6)
            .translate(0, 5.2, 0.42),
        ],
      },
    },
    head: {
      face: [headShape()],
      skin: features(),
      pearls: [-1, 1].map((s) =>
        ball(
          0.045,
          [s * 0.4, C.y - 0.25, C.z + 0.06],
          [1, 1.3, 1],
          undefined,
          [8, 6],
        ),
      ),
      // Raised in a pouf, curls at the sides, the chignon behind...
      pouf: {
        who: 0.6,
        key: 32,
        parts: [
          hairShell({ line: 0.7, lift: 1.12, pouf: 0.6 }),
          ...curls([0.06, -0.12]),
          chignon,
        ],
      },
      // ...or dressed lower, with a long ringlet over the shoulder.
      dressed: {
        who: -0.6,
        key: 32,
        parts: [
          hairShell({ line: 0.68, lift: 1.1, pouf: 0.28 }),
          ...curls([0.02]),
          chignon,
          new THREE.TubeGeometry(spiral, 36, 0.038, 4),
          ball(0.045, spiral.getPoint(1).toArray()),
        ],
      },
      feathers: {
        who: 0.35,
        key: 32,
        parts: [
          ball(
            1,
            [0.12, C.y + 0.95, C.z + 0.12],
            [0.05, 0.36, 0.13],
            [-0.35, 0, -0.3],
          ),
          ball(
            1,
            [-0.02, C.y + 0.9, C.z + 0.24],
            [0.045, 0.3, 0.11],
            [-0.55, 0, 0.15],
          ),
        ],
      },
      hairpearls: {
        who: [0.35, 0.6],
        key: 32,
        parts: [
          beads(0.38, 0.026, 26)
            .rotateX(Math.PI / 2 - 0.45)
            .translate(0, C.y + 0.62, C.z + 0.02),
        ],
      },
      flowers: {
        who: -0.6,
        key: 32,
        parts: [
          [-0.26, 0.42, 0.08],
          [-0.16, 0.5, 0.18],
          [-0.33, 0.34, 0.22],
        ].map(([x, y, z], k) => ball(0.09 - k * 0.01, [x, C.y + y, C.z + z])),
      },
    },
    up: (s) => {
      const E = joint(J, "elbow", s);
      return {
        gown: [
          tube(
            joint(J, "shoulder", s).toArray(),
            E.toArray(),
            [0.25, 0.21, 0.19, 0.18],
            12,
          ),
        ],
        // A silk flounce at the elbow, two tiers of lace below it.
        flounce: [elbowFlounce(E, 0.04, 0.19, 0.28, 0.24, 0.08)],
        lace: [
          elbowFlounce(E, -0.02, 0.2, 0.32, 0.3, 0.12),
          elbowFlounce(E, -0.1, 0.21, 0.35, 0.32, 0.16),
        ],
      };
    },
    fore: (s) => {
      const arm = tube(
        joint(J, "elbow", s).toArray(),
        joint(J, "wrist", s).toArray(),
        [0.16, 0.15, 0.12, 0.105],
        10,
      );
      return {
        gloves: { who: 0.45, key: 33, parts: [arm] },
        bare: { who: -0.45, key: 33, parts: [arm.clone()] },
      };
    },
    hand: (s) => ({
      gloves: { who: 0.45, key: 33, parts: handShape(J, s) },
      bare: { who: -0.45, key: 33, parts: handShape(J, s) },
      ...(s > 0 && { fan: { who: 0.28, parts: [fan] } }),
    }),
  };
}

// --- Colours ------------------------------------------------------------------

const COATS = [
  0x1d2b5a, 0x5e1424, 0x14432f, 0x121214, 0x3b1d52, 0x123c44, 0x4a1c14,
  0x2b2b2e, 0x7d93b8, 0xb89a74, 0x8fa07a, 0xa87882,
];
const BROCADE = [0xd8b45e, 0xece2c8, 0xd9c08a, 0xa02232, 0xc4c2bc, 0xe6d6c0];
const GOWNS = [
  0x9fb8d6, 0xd99aa5, 0xe8d58a, 0xeee4cc, 0x8fb8a0, 0xb4a0c8, 0x8c1c2b,
  0x2a4a8c, 0x1d6a48, 0xc9a24a, 0x18161a, 0xe0a088,
];
const RIBBONS = [0xe8b0c0, 0x8cb0d8, 0xf0e8d8, 0xb02040, 0x405890, 0x1a1a1a];
const SKIN = [0xf1c7a5, 0xe6b48f, 0xd29c75, 0xb07a55, 0x8a5a3c, 0x60402c];
const POWDER = [0xf0ece6, 0xe2ded8, 0xd4d0ca, 0xe8e2d2];
const HAIR = [0x1a130e, 0x2a1d14, 0x3a2618, 0x5a2c18, 0x8a6a40, 0xc9a66b];
const GLOVES = [0xece4d4, 0xe4dac6, 0xf0ead8];
const FLOWERS = [0xc2304a, 0xf0e6d0, 0x6a3a8a, 0xe88aa0];
const FANS = [0xf1e6c8, 0xe8c0c8, 0xc8d8e8, 0x2a2a30, 0xe8dcb0];
const BREECHES = [0x141414, 0xd6c8a8, 0xe8e0cc];
const GOLD = 0xe8c070;
const SILVER = 0xdadce2;

/** `seats`: [x, y, z, yaw] of every seat, facing −z. */
export function buildAudience(parent, seats) {
  const hash = (i, k) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const velvet = new THREE.MeshPhysicalMaterial({
    roughness: 0.8,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: 0x8c7c70,
  });
  const satin = new THREE.MeshPhysicalMaterial({
    roughness: 0.32,
    sheen: 0.5,
    sheenRoughness: 0.3,
    sheenColor: 0xffffff,
  });
  const silk = satin.clone();
  silk.side = THREE.DoubleSide;
  const brocade = new THREE.MeshStandardMaterial({
    map: brocadeTexture(),
    roughness: 0.5,
    metalness: 0.25,
  });
  const lace = new THREE.MeshStandardMaterial({
    map: laceTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
  });
  const linen = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const skin = new THREE.MeshPhysicalMaterial({
    roughness: 0.55,
    sheen: 0.3,
    sheenRoughness: 0.5,
    sheenColor: 0xffc8b0,
  });
  // The face paints over the skin (see faceTexture).
  const faces = [false, true].map((isLady) => {
    const face = skin.clone();
    face.map = faceTexture(isLady);
    face.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <map_fragment>",
          `vec4 paint = texture2D( map, vMapUv );
          diffuseColor.rgb = mix( diffuseColor.rgb * vColor.rgb * paint.rgb, paint.rgb, paint.a );`,
        )
        .replace("#include <color_fragment>", "");
    };
    return face;
  });
  const strands = strandTexture();
  const hair = new THREE.MeshStandardMaterial({
    map: strands,
    bumpMap: strands,
    bumpScale: 1.5,
    roughness: 0.62,
  });
  const plain = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const gilt = new THREE.MeshStandardMaterial({
    metalness: 1,
    roughness: 0.3,
  });
  gilt.userData.keepEnv = true;
  const pick = (palette, i, k) =>
    palette[Math.floor(hash(i, k) * palette.length)];
  const hairOf = (i, isLady) =>
    hash(i, 30) < (isLady ? 0.45 : 0.65)
      ? pick(POWDER, i, 4)
      : pick(HAIR, i, 4);
  const gown = (i) => pick(GOWNS, i, 1);
  // Each part's colour (per figure) and finish.
  const look = {
    coat: (i) => [pick(COATS, i, 1), velvet],
    gown: (i) => [gown(i), satin],
    flounce: (i) => [gown(i), silk],
    waistcoat: (i) => [pick(BROCADE, i, 2), brocade],
    // Half the petticoats match the gown; the rest are brocade in contrast.
    petticoat: (i) => [
      hash(i, 2) < 0.5 ? gown(i) : pick(BROCADE, i, 2),
      brocade,
    ],
    linen: () => [0xf3eee2, linen],
    lace: (i) => [hash(i, 19) < 0.7 ? 0xf6f2e8 : 0xeee2c8, lace],
    breeches: (i) => [
      hash(i, 34) < 0.65 ? pick(COATS, i, 1) : pick(BREECHES, i, 35),
      velvet,
    ],
    stockings: (i) => [hash(i, 19) < 0.8 ? 0xf2efe8 : 0xe4dccc, satin],
    shoes: () => [0x0d0c0b, satin],
    heels: (i) => [hash(i, 37) < 0.5 ? 0x9a1a1a : 0x0d0c0b, satin],
    gold: (i, isLady) => [!isLady && hash(i, 38) < 0.25 ? SILVER : GOLD, gilt],
    star: () => [SILVER, gilt],
    epaulettes: () => [GOLD, gilt],
    sash: () => [0x1f4aa8, satin],
    skin: (i) => [pick(SKIN, i, 3), skin],
    bare: (i) => [pick(SKIN, i, 3), skin],
    face: (i, isLady) => [pick(SKIN, i, 3), faces[isLady ? 1 : 0]],
    wig: (i) => [hairOf(i, false), hair],
    natural: (i) => [hairOf(i, false), hair],
    pouf: (i) => [hairOf(i, true), hair],
    dressed: (i) => [hairOf(i, true), hair],
    bag: () => [0x0c0b0b, satin],
    bow: () => [0x0c0b0b, satin],
    bows: (i) => [pick(RIBBONS, i, 16), satin],
    ribbon: (i) => [pick(RIBBONS, i, 17), velvet],
    pearls: () => [0xf3eee4, satin],
    hairpearls: () => [0xf3eee4, satin],
    feathers: (i) => [
      hash(i, 18) < 0.6 ? 0xf6f2ea : pick(RIBBONS, i, 18),
      plain,
    ],
    flowers: (i) => [pick(FLOWERS, i, 16), plain],
    gloves: (i) => [pick(GLOVES, i, 5), satin],
    fan: (i) => [pick(FANS, i, 20), satin],
  };
  // These keep their UVs, for a texture.
  const textured = new Set([
    "waistcoat",
    "petticoat",
    "lace",
    "face",
    "wig",
    "natural",
    "pouf",
    "dressed",
  ]);

  const seated = seats
    .map((seat, i) => ({ seat, i }))
    .filter(({ i }) => hash(i, 0) < 0.7);
  const groups = [
    {
      figure: gentleman(),
      people: seated.filter(({ i }) => hash(i, 9) >= 0.5),
    },
    {
      figure: lady(),
      people: seated.filter(({ i }) => hash(i, 9) < 0.5),
      lady: true,
    },
  ];
  // Who wears a part: `who` > 0, that share of the group by a per-figure
  // draw on `key`; < 0, the rest; [lo, hi], those drawn between.
  const wears =
    (who, key) =>
    ({ i }) => {
      const h = hash(i, key);
      if (Array.isArray(who)) return h >= who[0] && h < who[1];
      return who > 0 ? h < who : h >= -who;
    };
  const FRAMES = [
    "body",
    "head",
    "upL",
    "upR",
    "foreL",
    "foreR",
    "handL",
    "handR",
  ];
  const all = [];
  for (const group of groups) {
    const { joints, ...figure } = group.figure;
    group.meshes = [];
    const entries = [];
    for (const [frame, spec] of Object.entries(figure))
      if (typeof spec === "function")
        for (const s of [-1, 1])
          entries.push([frame + (s < 0 ? "L" : "R"), spec(s)]);
      else entries.push([frame, spec]);
    for (const [frame, parts] of entries)
      for (const [part, spec] of Object.entries(parts)) {
        const {
          who = 1,
          key = 40 + part.length,
          parts: geometries,
        } = Array.isArray(spec) ? { parts: spec } : spec;
        const members = group.people
          .map((person, n) => ({ person, n }))
          .filter(({ person }) => wears(who, key)(person));
        if (!members.length) continue;
        const geometry = (textured.has(part) ? soupUv : soup)(geometries);
        const [, material] = look[part](0, group.lady);
        const mesh = new THREE.InstancedMesh(
          geometry,
          material,
          members.length,
        );
        members.forEach(({ person }, k) =>
          mesh.setColorAt(
            k,
            new THREE.Color(look[part](person.i, group.lady)[0]),
          ),
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // the instances span the whole stalls
        mesh.name = `audience-${group.lady ? "lady" : "gentleman"}-${part}-${frame}`;
        mesh.userData = { frame, members: members.map(({ n }) => n) };
        parent.add(mesh);
        group.meshes.push(mesh);
        all.push(mesh);
      }
    // Every figure's frames, written once per pose and copied out.
    group.frames = Object.fromEntries(
      FRAMES.map((f) => [f, new Float32Array(group.people.length * 16)]),
    );
    // Per side: the joints, the forearm at rest, and the hand's rest axes
    // (fingers, palm) to turn from when clapping.
    group.sides = [-1, 1].map((s) => {
      const S = joint(joints, "shoulder", s);
      const E = joint(joints, "elbow", s);
      const W = joint(joints, "wrist", s);
      const turn = handTurn(joints, s);
      return {
        s,
        S,
        E,
        W,
        dir: W.clone().sub(E).normalize(),
        palm: new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            ...[DOWN, V(0, 0, 1)].map((v) => v.clone().applyQuaternion(turn)),
            DOWN.clone()
              .cross(V(0, 0, 1))
              .applyQuaternion(turn),
          ),
        ),
      };
    });
  }

  const seatM = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const head = new THREE.Matrix4();
  const up = new THREE.Matrix4();
  const fore = new THREE.Matrix4();
  const hand = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const build = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const yawQ = new THREE.Quaternion();
  const qUp = new THREE.Quaternion();
  const qFore = new THREE.Quaternion();
  const qHand = new THREE.Quaternion();
  const qAim = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const lift = new THREE.Euler();
  const gaze = new THREE.Euler(0, 0, 0, "YXZ");
  const at = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const reach = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const basis = new THREE.Matrix4();
  // The hands while clapping: fingers up and forward, palms facing.
  const clapAim = [-1, 1].map((s) => {
    const fingers = V(0, 0.75, -0.66).normalize();
    const palm = V(-s, 0, 0);
    return new THREE.Quaternion().setFromRotationMatrix(
      basis.makeBasis(fingers, palm, fingers.clone().cross(palm)),
    );
  });
  let time = 0;
  let sway = 0; // 0..1, eased in while music plays
  let clapFrom = -1;
  let clapUntil = -1;

  /** out = parent × (a turn by `quat` about point P). */
  const about = (out, parent, P, quat) => {
    m.makeRotationFromQuaternion(quat);
    at.copy(P).applyQuaternion(quat);
    m.setPosition(P.x - at.x, P.y - at.y, P.z - at.z);
    return out.multiplyMatrices(parent, m);
  };

  function pose() {
    for (const { people, meshes, frames, sides } of groups) {
      people.forEach(({ seat: [x, y, z, yaw], i }, n) => {
        const phase = hash(i, 6) * 6.283;
        // Applause: each joins a moment late and stops on their own.
        const start = clapFrom + 0.6 * hash(i, 7);
        const stop = clapUntil - 1.8 * hash(i, 8);
        const raw =
          time < start || time > stop + 1
            ? 0
            : Math.min(1, (time - start) * 2.5, stop + 1 - time);
        const clap = raw * raw * (3 - 2 * raw);
        const keen = 0.8 + 0.2 * hash(i, 10);
        const rate = 6.283 * (2.5 + hash(i, 12)); // 2.5–3.5 claps a second
        const open = 0.5 + 0.5 * Math.sin(time * rate + phase);
        const listen = sway * Math.sin(time * (1.4 + hash(i, 13)) + phase);
        euler.set(
          0.025 * listen + clap * 0.05, // a nod; leaning in to clap
          0,
          0.03 * sway * Math.sin(time * (0.9 + hash(i, 14)) + phase), // a sway
        );
        // No two the same: a little taller or shorter, broader or slighter.
        const tall = 0.95 + 0.1 * hash(i, 17);
        const broad = 0.93 + 0.14 * hash(i, 18);
        seatM.compose(at.set(x, y, z), yawQ.setFromAxisAngle(UP, yaw), one);
        body
          .multiplyMatrices(seatM, turn.makeRotationFromEuler(euler))
          .multiply(build.makeScale(broad, tall, 1));
        body.toArray(frames.body, n * 16);
        // The head: a slow glance about the hall when idle, held toward the
        // stage while music plays, turned to a neighbour while applauding.
        const idle = 1 - Math.max(sway, clap);
        const glance =
          0.45 *
          Math.sin(time * (0.11 + 0.1 * hash(i, 19)) + phase) *
          Math.max(0, Math.sin(time * 0.07 + phase * 3));
        const neighbour = (hash(i, 21) - 0.5) * 0.6;
        gaze.set(
          -0.06 + 0.05 * listen,
          glance * idle + neighbour * clap,
          0.04 * sway * Math.sin(time * 0.8 + phase),
        );
        about(head, body, NECK, q.setFromEuler(gaze));
        head.toArray(frames.head, n * 16);
        // Applause: the elbows come forward off the seat's arms, the
        // forearms rise until the wrists meet before the chest, and the hands
        // turn palm to palm, parting and meeting on each beat.
        for (const { s, S, E, W, dir, palm } of sides) {
          const k = s < 0 ? "L" : "R";
          qUp.setFromEuler(lift.set(0.55 * clap * keen, 0, s * 0.1 * clap));
          about(up, body, S, qUp);
          up.toArray(frames["up" + k], n * 16);
          elbow.copy(E).sub(S).applyQuaternion(qUp).add(S);
          reach
            .set(s * (0.075 + 0.17 * open), 4.3, -0.62)
            .sub(elbow)
            .applyQuaternion(q.copy(qUp).invert())
            .normalize();
          qFore.setFromUnitVectors(dir, reach);
          qFore.copy(q.identity().slerp(qFore, clap)); // eased in
          about(fore, up, E, qFore);
          fore.toArray(frames["fore" + k], n * 16);
          // The hand's turn: from its rest axes toward the clapping ones,
          // less what the arm has already turned.
          qAim.multiplyQuaternions(
            clapAim[s < 0 ? 0 : 1],
            q.copy(palm).invert(),
          );
          qAim.copy(q.identity().slerp(qAim, clap));
          qHand.multiplyQuaternions(qUp, qFore).invert().multiply(qAim);
          about(hand, fore, W, qHand);
          hand.toArray(frames["hand" + k], n * 16);
        }
      });
      for (const mesh of meshes) {
        const { frame, members } = mesh.userData;
        const from = frames[frame];
        const into = mesh.instanceMatrix.array;
        members.forEach((n, k) =>
          into.set(from.subarray(n * 16, n * 16 + 16), k * 16),
        );
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  pose();

  return {
    count: seated.length,
    meshes: all,
    hands: all.filter((mesh) => mesh.userData.frame.startsWith("hand")),
    /** Applaud for `seconds`, starting now. */
    applaud(seconds = 9) {
      clapFrom = time;
      clapUntil = time + seconds;
    },
    /** `playing`: music is sounding, so the house sways with it. Heads keep
     *  glancing about even when it is not. */
    update(dt, playing) {
      time += dt;
      sway += ((playing ? 1 : 0) - sway) * Math.min(1, dt * 0.8);
      if (all[0].visible) pose();
    },
    get visible() {
      return all[0].visible;
    },
    set visible(on) {
      for (const mesh of all) mesh.visible = on;
    },
  };
}
