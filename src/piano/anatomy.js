import * as THREE from "three";
import {
  DIM,
  box,
  cyl,
  cylBetween,
  extrudeFlat,
  tag,
  outerFootprint,
  cavityPath,
  cavityShape,
  plateRingShape,
} from "./geometry.js";
import { createLogoTexture, createSheetTexture } from "./materials.js";

const RIM_H = DIM.caseTopY - DIM.caseBottomY;

/** Lid outline: same silhouette as the case but its straight front edge is
 *  pulled back to the belly rail so the closed lid covers only the harp and
 *  leaves the keyboard / music-desk strip exposed. */
function lidShape() {
  const s = new THREE.Shape();
  s.moveTo(-3.62, -1.45);
  s.lineTo(3.62, -1.45);
  s.bezierCurveTo(4.07, -0.6, 3.92, 1.7, 2.87, 3.27);
  s.bezierCurveTo(1.92, 4.57, 0.4, 5.02, -1.17, 4.92);
  s.bezierCurveTo(-2.52, 4.82, -3.27, 4.62, -3.62, 4.32);
  s.lineTo(-3.62, -1.45);
  return s;
}

// ---------------------------------------------------------------------------
// Case / rim ---------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildCaseRim(mats) {
  const g = new THREE.Group();

  // Hollow rim wall: outer silhouette with the cavity punched out.
  const rimShape = outerFootprint();
  rimShape.holes.push(cavityPath());
  const rim = extrudeFlat(rimShape, RIM_H, mats.blackLacquer, 0.02);
  rim.position.y = DIM.caseBottomY;
  g.add(rim);

  // Dark inner floor closing the belly underside.
  const floor = extrudeFlat(cavityShape(0), 0.05, mats.innerCase, 0);
  floor.position.y = DIM.cavityFloorY;
  g.add(floor);

  // Thin gold trim tracing the top edge of the rim.
  const trimShape = outerFootprint();
  trimShape.holes.push(cavityPath());
  const trim = extrudeFlat(trimShape, 0.02, mats.gold, 0.008);
  trim.position.y = DIM.caseTopY;
  g.add(trim);

  // Keybed shelf: supports the overhanging key fronts ahead of the case edge.
  box(
    7.0,
    0.16,
    0.78,
    mats.blackLacquer,
    g,
    0,
    DIM.caseTopY - 0.08,
    DIM.frontEdgeZ + 0.32,
    "",
  );
  // Keyslip: the thin vertical rail below the white-key fronts.
  box(
    6.9,
    0.16,
    0.05,
    mats.blackLacquer,
    g,
    0,
    DIM.caseTopY - 0.06,
    DIM.frontEdgeZ + 0.68,
  );

  // Cheek blocks flanking the keyboard, rising just above the keys.
  for (const sx of [-1, 1]) {
    box(
      0.26,
      0.2,
      1.16,
      mats.blackLacquer,
      g,
      sx * 3.42,
      DIM.caseTopY + 0.06,
      2.5,
      "Cheek block",
    );
  }

  // Nameboard / fallboard standing behind the keys.
  const fallboard = box(
    6.9,
    0.5,
    0.14,
    mats.blackLacquer,
    g,
    0,
    DIM.caseTopY + 0.2,
    1.86,
    "Fallboard",
  );
  fallboard.rotation.x = 0.16;

  const logoTex = createLogoTexture(mats.maxAniso);
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.45, 0.36),
    new THREE.MeshBasicMaterial({
      map: logoTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  logo.position.set(0, DIM.caseTopY + 0.22, 1.79);
  logo.rotation.x = 0.16;
  g.add(logo);

  // Bass-side hinge knuckles along the spine.
  for (let i = 0; i < 8; i++) {
    box(
      0.26,
      0.05,
      0.08,
      mats.gold,
      g,
      -3.58,
      DIM.caseTopY + 0.01,
      1.9 - i * 0.8,
    );
  }

  return tag(
    g,
    "Lacquered rim & case",
    "A hollow curved rim forms the structural case: a thin glossy wall around an open cavity, a keybed at the front, and a dark inner floor. It holds the soundboard under crown and resists the strings’ cumulative tension.",
    "Exterior",
  );
}

// ---------------------------------------------------------------------------
// Soundboard, ribs, bridge --------------------------------------------------
// ---------------------------------------------------------------------------

export function buildSoundboard(mats) {
  const g = new THREE.Group();

  const board = extrudeFlat(
    cavityShape(0.03),
    DIM.soundboardThickness,
    mats.spruce,
    0.01,
  );
  board.position.y = DIM.soundboardTopY - DIM.soundboardThickness;
  g.add(board);

  // Ribs glued to the underside, fanned across the board. They stay strictly
  // within the cavity (z from ~0.7 back to the tail) so nothing floats forward
  // into the keyboard/action region ahead of the belly.
  for (let i = 0; i < 9; i++) {
    const z = 0.7 - i * 0.6;
    const t = (1.45 - z) / (1.45 + 4.9); // 0 at cavity front, 1 at tail
    const w = THREE.MathUtils.lerp(5.0, 1.3, t);
    const rib = box(w, 0.05, 0.07, mats.bridge, g, -0.1, DIM.ribY, z);
    rib.rotation.y = -0.2;
  }

  // Curved main (long) bridge sweeping across the board.
  const mainCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(2.55, DIM.bridgeTopY - 0.05, 0.55),
    new THREE.Vector3(1.1, DIM.bridgeTopY - 0.05, -0.7),
    new THREE.Vector3(-1.15, DIM.bridgeTopY - 0.05, -1.65),
  );
  addBridge(g, mainCurve, mats.bridge, 10, 0.06);

  // Shorter bass bridge, offset toward the spine (overstrung layout).
  const bassCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.7, DIM.bridgeTopY - 0.05, -1.4),
    new THREE.Vector3(-1.7, DIM.bridgeTopY - 0.05, -2.35),
    new THREE.Vector3(-2.4, DIM.bridgeTopY - 0.05, -3.15),
  );
  addBridge(g, bassCurve, mats.bridge, 6, 0.055);

  return tag(
    g,
    "Spruce soundboard",
    "A thin spruce diaphragm fills the cavity below the cast frame, ribbed underneath and carrying a curved bridge on top. It turns string vibration into the instrument’s broad acoustic output.",
    "Acoustics",
  );
}

function addBridge(group, curve, mat, segments, radius) {
  const pts = curve.getPoints(segments);
  for (let i = 0; i < pts.length - 1; i++) {
    group.add(cylBetween(pts[i], pts[i + 1], radius, mat, 8));
  }
}

// ---------------------------------------------------------------------------
// Cast-iron plate / harp ----------------------------------------------------
// ---------------------------------------------------------------------------

export function buildPlate(mats) {
  const g = new THREE.Group();

  // Perimeter frame ring with a large open window (soundboard shows through).
  const ring = extrudeFlat(
    plateRingShape(),
    DIM.plateThickness,
    mats.plateGold,
    0.015,
  );
  ring.position.y = DIM.plateY;
  g.add(ring);

  // Front pinblock cap — solid band carrying the tuning pins.
  box(
    6.2,
    DIM.plateThickness + 0.02,
    0.5,
    mats.plateGold,
    g,
    0,
    DIM.plateY + 0.03,
    1.35,
    "Tuning-pin block",
  );
  // Capo bar across the front where the speaking length begins.
  box(6.0, 0.05, 0.08, mats.gold, g, 0, DIM.plateY + 0.06, 1.05);

  // Structural braces radiating across the opening.
  const struts = [
    { x: -0.5, z: -0.2, ry: -0.16, len: 3.4 },
    { x: 0.7, z: -0.6, ry: 0.18, len: 3.2 },
    { x: 1.75, z: 0.1, ry: 0.5, len: 2.4 },
  ];
  for (const s of struts) {
    const b = box(
      0.26,
      0.06,
      s.len,
      mats.plateGold,
      g,
      s.x,
      DIM.plateY + 0.02,
      s.z,
    );
    b.rotation.y = s.ry;
  }

  // Hitch-pin rail hugging the tail curve.
  const hitchCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(1.9, DIM.plateY + 0.03, -0.4),
    new THREE.Vector3(0.4, DIM.plateY + 0.03, -4.2),
    new THREE.Vector3(-2.6, DIM.plateY + 0.03, -3.4),
  );
  const hpts = hitchCurve.getPoints(14);
  for (let i = 0; i < hpts.length - 1; i++)
    g.add(cylBetween(hpts[i], hpts[i + 1], 0.05, mats.plateGold, 8));

  // Tuning pins standing on the pinblock (kept just under the rim top).
  for (let i = 0; i < 40; i++) {
    const x = -2.9 + i * (5.8 / 39);
    cyl(
      0.026,
      0.026,
      0.11,
      mats.bronze,
      g,
      x,
      DIM.plateY + 0.05,
      1.48 + (i % 2) * 0.12,
      0,
      0,
      "",
      8,
    );
  }

  return tag(
    g,
    "Cast-iron plate / harp",
    "A gold cast frame — perimeter ring, tuning-pin block, radiating braces and a tail hitch rail — with large open windows revealing the soundboard beneath. It braces the string field and transfers its load into the case.",
    "Structure",
  );
}

// ---------------------------------------------------------------------------
// Strings -------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildStrings(mats) {
  const g = new THREE.Group();
  const N = 82;
  const bassCount = 16;
  const trebleVerts = [];
  const y = DIM.stringY;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const frontX = THREE.MathUtils.lerp(-3.0, 3.0, t);
    const backX = THREE.MathUtils.lerp(-1.8, 2.2, t);
    const backZ = THREE.MathUtils.lerp(-4.2, -0.3, Math.pow(t, 0.8));
    const front = new THREE.Vector3(frontX, y, 1.5);
    const back = new THREE.Vector3(backX, y, backZ);

    if (i < bassCount) {
      // Thick, warm copper-wound bass strings.
      g.add(cylBetween(front, back, 0.022, mats.copper, 6));
    } else {
      trebleVerts.push(front.x, front.y, front.z, back.x, back.y, back.z);
    }
    // Hitch pins at the tail end of every other course.
    if (i % 2 === 0)
      cyl(
        0.03,
        0.036,
        0.09,
        mats.bronze,
        g,
        backX,
        y - 0.02,
        backZ,
        0,
        0,
        "",
        6,
      );
  }

  const trebleGeo = new THREE.BufferGeometry();
  trebleGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(trebleVerts, 3),
  );
  g.add(new THREE.LineSegments(trebleGeo, mats.trebleLine));

  return tag(
    g,
    "String field & tuning system",
    "Copper-wound bass strings run thick and warm toward the tail; thin steel treble strings fan across the front. Each course runs from the tuning-pin block, over the bridge, to a hitch pin — sitting just above the plate.",
    "Acoustics",
  );
}

// ---------------------------------------------------------------------------
// Action / hammers / dampers ------------------------------------------------
// ---------------------------------------------------------------------------

export function buildAction(mats) {
  const g = new THREE.Group();

  // Damper felt rail sitting just behind the strings’ front termination.
  box(6.5, 0.08, 0.22, mats.felt, g, 0, DIM.caseTopY - 0.06, 1.62);

  // Hammer rest rail and a row of felted hammers angled toward the strings.
  box(6.6, 0.06, 0.08, mats.maple, g, 0, DIM.caseTopY - 0.09, 1.78);
  for (let i = 0; i < 52; i++) {
    const x = -3.05 + i * (6.1 / 51);
    const shank = cyl(
      0.011,
      0.011,
      0.34,
      mats.maple,
      g,
      x,
      DIM.caseTopY - 0.12,
      1.72,
      Math.PI / 2.4,
      0,
      "",
      6,
    );
    const hammer = box(
      0.07,
      0.09,
      0.16,
      mats.hammerFelt,
      g,
      x,
      DIM.caseTopY - 0.03,
      1.58,
    );
    hammer.rotation.x = -0.32;
  }

  return tag(
    g,
    "Hammer action & dampers",
    "A simplified visible action: felted hammers on maple shanks resting behind the keyboard with a damper felt rail. Each keystroke visually depresses its key.",
    "Action",
  );
}

// ---------------------------------------------------------------------------
// Legs & casters ------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildLegs(mats, stageTopY) {
  const g = new THREE.Group();
  const top = DIM.caseBottomY;
  const legLen = top - stageTopY;
  const cy = (top + stageTopY) / 2;

  const legPos = [
    [-3.0, 1.9],
    [3.0, 1.9],
    [-1.1, -3.4],
  ];
  for (const [x, z] of legPos) {
    cyl(0.24, 0.15, legLen, mats.blackLacquer, g, x, cy, z, 0, 0, "", 22);
    // Brass caster cup + wheel resting on the stage surface.
    cyl(
      0.14,
      0.14,
      0.1,
      mats.gold,
      g,
      x,
      stageTopY + 0.11,
      z,
      Math.PI / 2,
      0,
      "",
      16,
    );
    cyl(
      0.09,
      0.09,
      0.07,
      mats.blackSatin,
      g,
      x,
      stageTopY + 0.09,
      z + 0.07,
      Math.PI / 2,
      0,
      "",
      14,
    );
  }

  return tag(
    g,
    "Legs & brass casters",
    "Three tapered legs carry the case above the stage — two under the keyboard corners and one beneath the tail — each ending in a brass caster resting on the floor.",
    "Support",
  );
}

// ---------------------------------------------------------------------------
// Pedal lyre ----------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildPedals(mats) {
  const g = new THREE.Group();
  const topY = DIM.caseBottomY;

  // Two lyre posts descending from the underside of the keybed.
  cyl(
    0.05,
    0.07,
    topY - 0.34,
    mats.blackLacquer,
    g,
    -0.26,
    (topY + 0.34) / 2,
    2.2,
    0,
    0.1,
    "",
    14,
  );
  cyl(
    0.05,
    0.07,
    topY - 0.34,
    mats.blackLacquer,
    g,
    0.26,
    (topY + 0.34) / 2,
    2.2,
    0,
    -0.1,
    "",
    14,
  );
  // Lyre base block.
  box(0.72, 0.12, 0.34, mats.blackLacquer, g, 0, 0.34, 2.4);
  // A back stay connecting the lyre to the case.
  const stay = cyl(
    0.03,
    0.03,
    1.4,
    mats.blackSatin,
    g,
    0,
    topY - 0.02,
    1.9,
    Math.PI / 2.2,
    0,
    "",
    8,
  );

  // Three pedals angled toward the player.
  [-0.24, 0, 0.24].forEach((x, i) => {
    const p = box(0.34, 0.05, 0.16, mats.gold, g, x, 0.34, 2.62);
    p.rotation.y = i === 1 ? 0 : i === 0 ? -0.06 : 0.06;
  });

  return tag(
    g,
    "Pedal lyre",
    "Three pedals — soft, sostenuto and sustain — mounted on the decorative lyre that hangs centred beneath the keyboard and faces the player.",
    "Controls",
  );
}

// ---------------------------------------------------------------------------
// Lid & prop ----------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildLid(mats) {
  // Group holds a pivot (hinged along the bass spine) plus a prop stick.
  const g = new THREE.Group();

  const pivot = new THREE.Group();
  pivot.position.set(-3.6, DIM.caseTopY, 0);
  g.add(pivot);

  const lid = extrudeFlat(lidShape(), 0.06, mats.blackLacquer, 0.02);
  lid.position.set(3.6, 0, 0); // spine edge aligns with the pivot axis
  pivot.add(lid);

  // Underlid trim so the raised interior face reads as finished.
  const underTrim = extrudeFlat(lidShape(), 0.012, mats.gold, 0);
  underTrim.position.set(3.6, -0.014, 0);
  pivot.add(underTrim);

  const prop = cyl(
    0.045,
    0.045,
    2.2,
    mats.blackSatin,
    g,
    1.45,
    DIM.caseTopY + 1.0,
    -0.9,
    0,
    -0.42,
    "",
    12,
  );

  tag(
    g,
    "Grand-piano lid",
    "A thin lacquered lid matching the case outline, hinged along the bass-side spine and held open by a prop stick to project sound toward the audience.",
    "Exterior",
  );

  return { group: g, pivot, prop };
}

// ---------------------------------------------------------------------------
// Music desk & score --------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildMusicDesk(mats) {
  const g = new THREE.Group();

  // Rack ledge + backing board standing in the exposed strip ahead of the lid.
  box(3.7, 0.07, 0.14, mats.blackLacquer, g, 0, 1.5, 1.74);
  const board = box(3.5, 1.2, 0.06, mats.blackLacquer, g, 0, 2.02, 1.6);
  board.rotation.x = 0.2;

  const sheetTex = createSheetTexture(mats.maxAniso);
  const sheetMat = new THREE.MeshStandardMaterial({
    map: sheetTex,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  const left = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.05, 8, 8),
    sheetMat,
  );
  left.position.set(-0.82, 2.06, 1.63);
  left.rotation.x = 0.2;
  left.rotation.y = 0.03;
  left.castShadow = true;
  g.add(left);
  const right = left.clone();
  right.position.x = 0.82;
  right.rotation.y = -0.03;
  g.add(right);

  return tag(
    g,
    "Music desk & score",
    "A modeled music rack standing ahead of the lid, carrying a textured two-page score of the autoplay piece, Für Elise.",
    "Score",
  );
}
