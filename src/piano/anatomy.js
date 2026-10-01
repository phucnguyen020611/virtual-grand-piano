import * as THREE from "three";
import {
  DIM,
  PIANO_LIFT,
  box,
  cyl,
  cylBetween,
  extrudeFlat,
  applyPlanarXZUV,
  tag,
  outerFootprint,
  cavityPath,
  cavityShape,
  hitchRailCurve,
  plateRingShape,
} from "./geometry.js";
import { createLogoTexture } from "./materials.js";
import { createScoreBook } from "./scoreBook.js";
import { SONGS } from "../performance/songs.js";

const RIM_H = DIM.rimTopY - DIM.caseBottomY;

/** The case footprint clipped to the band front ≤ sy ≤ back. The lid is the
 *  part behind the belly rail; clipping the real contour (rather than
 *  redrawing it) keeps every band flush with the rim. */
function footprintBand(front, back = Infinity) {
  const outline = outerFootprint().getPoints(48);
  const points = [];
  const cross = (a, b, y) =>
    a.y < y !== b.y < y &&
    points.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i],
      b = outline[i + 1];
    if (a.y >= front && a.y <= back) points.push(a.clone());
    cross(a, b, front);
    cross(a, b, back);
  }
  const s = new THREE.Shape(points);
  s.closePath();
  return s;
}

/** The rim wall as a C: the case outline with the cavity cut out and the
 *  front left open above the keybed, where keys and fallboard sit. */
function rimWallShape() {
  const outer = outerFootprint().getPoints(32);
  const inner = cavityPath().getPoints(32);
  const front = outer[0].y;
  return new THREE.Shape([
    ...outer.slice(1), // treble front corner, round the tail, to the spine
    new THREE.Vector2(inner[0].x, front),
    ...inner.slice(1).reverse(), // cavity, spine side back round to treble
    new THREE.Vector2(inner[1].x, front),
  ]);
}

/** Side profile (z, y) of a cheek: full rim height at the back, sweeping
 *  down in an S to a rounded nose just above the keys. */
function cheekProfile() {
  const s = new THREE.Shape();
  s.moveTo(2.16, DIM.keyBottomY);
  s.lineTo(3.11, DIM.keyBottomY);
  s.lineTo(3.11, 1.47);
  s.quadraticCurveTo(3.11, 1.56, 3.0, 1.56);
  s.bezierCurveTo(2.84, 1.56, 2.76, DIM.rimTopY, 2.5, DIM.rimTopY);
  s.lineTo(2.16, DIM.rimTopY);
  return s;
}

// ---------------------------------------------------------------------------
// Case / rim ---------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildCaseRim(mats) {
  const g = new THREE.Group();

  // Rim wall, rising well above the keys; open at the front over the keybed.
  const rim = extrudeFlat(rimWallShape(), RIM_H, mats.blackLacquer, 0.02);
  rim.position.y = DIM.caseBottomY;
  g.add(rim);
  // Keybed band between the cheeks, the belly rail face behind it.
  box(
    6.6,
    DIM.caseTopY - DIM.caseBottomY,
    0.95,
    mats.blackLacquer,
    g,
    0,
    (DIM.caseTopY + DIM.caseBottomY) / 2,
    1.925,
  );
  // Deeper key bottom under the keyboard end, dropping below the rim line.
  const keyBottom = extrudeFlat(
    footprintBand(-2.4, -1.2),
    DIM.caseBottomY - DIM.keyBottomY,
    mats.blackLacquer,
    0.02,
  );
  keyBottom.position.y = DIM.keyBottomY;
  g.add(keyBottom);

  // Dark inner floor closing the belly underside.
  const floor = extrudeFlat(cavityShape(0), 0.05, mats.innerCase, 0);
  floor.position.y = DIM.cavityFloorY;
  g.add(floor);

  // Thin gold trim tracing the top edge of the rim.
  const trim = extrudeFlat(rimWallShape(), 0.02, mats.gold, 0.008);
  trim.position.y = DIM.rimTopY;
  g.add(trim);

  // Keybed shelf: the key bottom carried forward under the overhanging keys.
  box(
    7.0,
    DIM.keybedTopY - DIM.keyBottomY,
    0.78,
    mats.blackLacquer,
    g,
    0,
    (DIM.keybedTopY + DIM.keyBottomY) / 2,
    DIM.frontEdgeZ + 0.32,
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

  // Cheeks flanking the keyboard, extruded across X from their side profile.
  const cheekGeo = new THREE.ExtrudeGeometry(cheekProfile(), {
    depth: 0.6,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 3,
    curveSegments: 24,
  });
  cheekGeo.rotateY(-Math.PI / 2); // profile u → world z, extrusion → −x
  for (const x of [3.585, -2.985]) {
    const cheek = new THREE.Mesh(cheekGeo, mats.blackLacquer);
    cheek.position.x = x;
    cheek.castShadow = cheek.receiveShadow = true;
    cheek.userData.partName = "Cheek block";
    cheek.userData.inspectable = true;
    g.add(cheek);
  }

  // Sliding fallboard. Open, the board slides back under the music desk and
  // its front flap stands behind the keys, carrying the lettering; closing
  // slides it out over the keys and lets the flap drop over the key fronts.
  const fall = new THREE.Group();
  g.add(fall);
  const fallDepth = 0.77;
  box(
    5.9,
    0.035,
    fallDepth,
    mats.blackLacquer,
    fall,
    0,
    0.0175,
    fallDepth / 2,
    "Fallboard",
  );
  const flap = new THREE.Group();
  flap.position.set(0, 0.035, fallDepth); // hinge on the board's front edge
  fall.add(flap);
  // Short enough to clear the desk when standing and the keyslip when hung.
  box(5.9, 0.25, 0.03, mats.blackLacquer, flap, 0, -0.125, -0.015);

  // The lettering sits on the flap's inner face, which faces the player
  // while the fallboard is open.
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.225),
    new THREE.MeshBasicMaterial({
      map: createLogoTexture(mats.maxAniso),
      transparent: true,
      depthWrite: false,
    }),
  );
  logo.position.set(0, -0.125, -0.031);
  logo.rotation.set(0, Math.PI, Math.PI); // reads upright from the bench
  logo.name = "fallboard-logo";
  flap.add(logo);

  // Back rail closing the well behind the stowed fallboard, under the desk.
  box(6.48, 0.55, 0.03, mats.blackLacquer, g, 0, DIM.caseTopY + 0.275, 1.49);

  const closedZ = 2.33; // board's back edge just behind the key tails
  const fallY = 1.64; // clear of the black-key tops
  // Open, the flap stands 20° back from upright (π is straight up); closing,
  // it swings on over the front to hang (2π), never down through the keys.
  const flapOpen = Math.PI - 0.35;
  /** 0 = open (stowed under the desk), 1 = closed over the keys. */
  g.userData.setFallboard = (t) => {
    const slide = THREE.MathUtils.smoothstep(t, 0, 0.7);
    fall.position.set(0, fallY, closedZ - (1 - slide) * 0.82);
    flap.rotation.x =
      flapOpen +
      THREE.MathUtils.smoothstep(t, 0.7, 1) * (2 * Math.PI - flapOpen);
  };
  g.userData.setFallboard(0);

  // Three slim brass butt hinges along the straight bass side, as on a real
  // grand: barrel knuckles sitting flush at the rim edge, not blocks.
  for (const z of [0.7, -1.7, -4.1]) {
    const knuckle = cyl(
      0.022,
      0.022,
      0.34,
      mats.gold,
      g,
      -3.665,
      DIM.lidHingeY - 0.012,
      z,
      Math.PI / 2,
      0,
      "",
      12,
    );
    knuckle.castShadow = false;
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

export function buildSoundboard(mats, stringLayout) {
  const g = new THREE.Group();

  const board = extrudeFlat(
    cavityShape(0.03),
    DIM.soundboardThickness,
    mats.spruce,
    0.01,
  );
  // Long spruce grain follows the piano's XZ-oriented soundboard as one
  // continuous surface, independent of the extrusion triangulation.
  applyPlanarXZUV(board.geometry);
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

  // Continuous low, rounded hardwood bridges. The string layout samples the
  // same curves, so every route lands on the corresponding bridge crown.
  addBridge(g, stringLayout.mainBridge, mats.bridge, DIM.bridgeRadius);
  addBridge(g, stringLayout.bassBridge, mats.bridge, DIM.bridgeRadius * 0.92);
  addBridgePins(g, stringLayout.routes, mats.bronze);

  return tag(
    g,
    "Spruce soundboard",
    "A thin spruce diaphragm fills the cavity below the cast frame, ribbed underneath and carrying a curved bridge on top. It turns string vibration into the instrument’s broad acoustic output.",
    "Acoustics",
  );
}

function addBridge(group, curve, mat, radius) {
  const bridge = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 44, radius, 8, false),
    mat,
  );
  bridge.position.y = DIM.bridgeCenterY;
  bridge.castShadow = bridge.receiveShadow = true;
  group.add(bridge);
}

function addBridgePins(group, routes, mat) {
  const pins = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.009, DIM.bridgePinHeight, 7),
    mat,
    routes.length,
  );
  const matrix = new THREE.Matrix4();
  routes.forEach((route, index) => {
    matrix.makeTranslation(
      route.bridgePoint.x,
      route.bridgePoint.y - DIM.bridgePinHeight / 2,
      route.bridgePoint.z,
    );
    pins.setMatrixAt(index, matrix);
  });
  pins.instanceMatrix.needsUpdate = true;
  pins.castShadow = pins.receiveShadow = true;
  group.add(pins);
}

function addRefinedPlateStructure(group, mats) {
  box(
    6.2,
    DIM.plateThickness + 0.04,
    0.62,
    mats.plateGold,
    group,
    0,
    DIM.plateY + (DIM.plateThickness + 0.04) / 2,
    1.35,
    "Tuning-pin block",
  );
  box(6.0, 0.055, 0.08, mats.gold, group, 0, DIM.frontBearingY - 0.027, 1.02);

  const braces = [
    { a: [-2.7, 0.95], b: [-2.22, -3.2], root: 0.42, tip: 0.19 },
    { a: [-1.45, 0.95], b: [-1.25, -3.75], root: 0.34, tip: 0.16 },
    { a: [-0.1, 0.95], b: [0.2, -4.05], root: 0.38, tip: 0.17 },
    { a: [1.25, 0.86], b: [1.35, -2.75], root: 0.32, tip: 0.15 },
    { a: [2.48, 0.55], b: [2.3, -1.15], root: 0.3, tip: 0.14 },
  ];
  braces.forEach((brace) =>
    addTaperedBrace(
      group,
      brace.a,
      brace.b,
      brace.root,
      brace.tip,
      mats.plateGold,
    ),
  );

  const hitchRail = new THREE.Mesh(
    new THREE.TubeGeometry(hitchRailCurve(), 36, 0.07, 8, false),
    mats.plateGold,
  );
  hitchRail.position.y = DIM.plateY + DIM.plateThickness * 0.65;
  hitchRail.castShadow = hitchRail.receiveShadow = true;
  group.add(hitchRail);

  addTaperedBrace(
    group,
    [-2.72, -3.35],
    [-1.3, -4.02],
    0.3,
    0.16,
    mats.plateGold,
  );
  addTaperedBrace(
    group,
    [1.3, -2.95],
    [0.35, -4.12],
    0.28,
    0.14,
    mats.plateGold,
  );
}

function addTaperedBrace(group, a, b, rootWidth, tipWidth, mat) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const nx = -dz / length;
  const nz = dx / length;
  const shape = new THREE.Shape();
  const points = [
    [a[0] + nx * rootWidth * 0.5, a[1] + nz * rootWidth * 0.5],
    [a[0] - nx * rootWidth * 0.5, a[1] - nz * rootWidth * 0.5],
    [b[0] - nx * tipWidth * 0.5, b[1] - nz * tipWidth * 0.5],
    [b[0] + nx * tipWidth * 0.5, b[1] + nz * tipWidth * 0.5],
  ];
  shape.moveTo(points[0][0], -points[0][1]);
  points.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
  shape.closePath();
  const brace = extrudeFlat(shape, DIM.plateBraceThickness, mat, 0.014);
  brace.position.y = DIM.plateBraceY;
  group.add(brace);
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

  addRefinedPlateStructure(g, mats);
  return tag(
    g,
    "Cast-iron plate / harp",
    "An open structural cast frame with a thick perimeter, pinblock web, five tapered braces, raised window bosses and a heavy tail rail. Large openings keep the spruce soundboard visibly active beneath the string field.",
    "Structure",
  );
}

// ---------------------------------------------------------------------------
// Action / hammers / dampers ------------------------------------------------
// ---------------------------------------------------------------------------

export function buildAction(mats, layout, stringRoutes = []) {
  const g = new THREE.Group();
  const midiToMechanism = new Map();
  const routeIndex = new Map(
    stringRoutes.map((route, index) => [route, index]),
  );
  // Each key owns one course; use its centre string so unisons stay centred.
  const routeByMidi = new Map();
  for (const route of stringRoutes) {
    const course = stringRoutes.filter(
      (r) => r.courseIndex === route.courseIndex,
    );
    if (route === course[Math.floor(course.length / 2)])
      routeByMidi.set(route.midi, route);
  }

  const capstanGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.09, 6);
  const wippenGeo = new THREE.BoxGeometry(0.055, 0.035, 0.24);
  const shankGeo = new THREE.CylinderGeometry(
    0.011,
    0.011,
    DIM.hammerShankLength,
    6,
  );
  // A short tapered felt roll reads more like a hammer than a rectangular block.
  const hammerGeo = new THREE.CylinderGeometry(0.052, 0.038, 0.11, 8);
  const damperStemGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.18, 5);
  // Sized to one semitone (~0.067) so 88 heads sit side by side, not overlapping.
  const damperHeadGeo = new THREE.BoxGeometry(0.05, 0.045, 0.095);

  function pointOnSpeakingLength(route, amount) {
    return route.frontBearingPoint.clone().lerp(route.bridgePoint, amount);
  }

  // The rail supports individual dampers; upper C7–C8 are intentionally clear.
  box(6.5, 0.08, 0.22, mats.felt, g, 0, DIM.caseTopY - 0.06, 1.62);
  box(6.6, 0.06, 0.08, mats.maple, g, 0, DIM.caseTopY - 0.09, 1.78);

  for (let index = 0; index < layout.length; index++) {
    const entry = layout[index];
    const mechanism = new THREE.Group();
    mechanism.position.x = entry.x;
    const stringRoute = routeByMidi.get(entry.midi) ?? null;
    const strikePoint = stringRoute
      ? pointOnSpeakingLength(
          stringRoute,
          stringRoute.zone === "bass" ? 0.1 : 0.13,
        )
      : new THREE.Vector3(entry.x, DIM.stringY, DIM.frontBearingZ - 0.25);
    const damperPoint = stringRoute
      ? pointOnSpeakingLength(stringRoute, 0.065)
      : strikePoint.clone();
    const hammerHeadY = DIM.hammerShankLength + DIM.hammerHeadOffset;
    const hammerHeadCenterY = strikePoint.y - DIM.hammerStringClearance;

    // Rear linkage and wippen make the key → hammer relationship legible.
    const capstan = new THREE.Mesh(capstanGeo, mats.bronze);
    capstan.position.set(0, DIM.capstanRestY, 1.91);
    capstan.receiveShadow = true;
    mechanism.add(capstan);
    const wippen = new THREE.Mesh(wippenGeo, mats.maple);
    // As in a real action, the key tail is cranked sideways so capstan and
    // wippen sit directly under their evenly spaced hammer.
    const reach = strikePoint.x - entry.x;
    capstan.position.x = reach;
    wippen.position.set(reach, DIM.caseTopY - 0.09, strikePoint.z + 0.5);
    wippen.rotation.x = -0.28;
    wippen.castShadow = wippen.receiveShadow = true;
    mechanism.add(wippen);

    const hammerPivot = new THREE.Group();
    hammerPivot.position.set(
      strikePoint.x - entry.x,
      hammerHeadCenterY - Math.cos(DIM.hammerStrikeAngle) * hammerHeadY,
      strikePoint.z - Math.sin(DIM.hammerStrikeAngle) * hammerHeadY,
    );
    hammerPivot.rotation.x = DIM.hammerRestAngle;
    const shank = new THREE.Mesh(shankGeo, mats.maple);
    shank.position.y = DIM.hammerShankLength / 2;
    const hammerHead = new THREE.Mesh(hammerGeo, mats.hammerFelt);
    hammerHead.position.y = hammerHeadY;
    hammerHead.rotation.z = Math.PI / 2;
    hammerHead.scale.set(0.65, 0.48, 1.18);
    shank.receiveShadow = true;
    hammerHead.castShadow = hammerHead.receiveShadow = true;
    hammerPivot.add(shank, hammerHead);
    mechanism.add(hammerPivot);

    let damperPivot = null;
    let damperHead = null;
    if (entry.midi <= DIM.damperCutoffMidi) {
      damperPivot = new THREE.Group();
      damperPivot.position.set(
        damperPoint.x - entry.x,
        damperPoint.y - DIM.damperStringClearance - DIM.damperHeadOffsetY,
        damperPoint.z - DIM.damperHeadOffsetZ,
      );
      const stem = new THREE.Mesh(damperStemGeo, mats.blackSatin);
      stem.position.y = 0.055;
      damperHead = new THREE.Mesh(damperHeadGeo, mats.felt);
      damperHead.position.set(0, DIM.damperHeadOffsetY, DIM.damperHeadOffsetZ);
      stem.receiveShadow = true;
      damperHead.castShadow = damperHead.receiveShadow = true;
      damperPivot.add(stem, damperHead);
      mechanism.add(damperPivot);
    }

    mechanism.userData.midi = entry.midi;
    mechanism.userData.stringRouteIndex = routeIndex.get(stringRoute) ?? -1;
    g.add(mechanism);
    midiToMechanism.set(entry.midi, {
      mechanism,
      capstan,
      wippen,
      hammerPivot,
      hammerHead,
      damperPivot,
      damperHead,
      stringRoute,
      strikePoint,
      damperPoint,
    });
  }

  tag(
    g,
    "Hammer action & dampers",
    "Eighty-eight aligned actions show capstans, wippens, pivoting hammer shanks and individual dampers through B6. The undamped C7–C8 treble follows normal grand-piano practice.",
    "Action",
  );
  return { group: g, midiToMechanism };
}

// ---------------------------------------------------------------------------
// Legs & casters ------------------------------------------------------------
// ---------------------------------------------------------------------------

/** A square frustum: flat faces, `top` wide at +h/2 narrowing to `bottom`. */
function taperedBox(top, bottom, h) {
  const geo = new THREE.BoxGeometry(top, h, top);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++)
    if (p.getY(i) < 0)
      p.setXYZ(
        i,
        (p.getX(i) * bottom) / top,
        p.getY(i),
        (p.getZ(i) * bottom) / top,
      );
  geo.computeVertexNormals();
  return geo;
}

export function buildLegs(mats, stageTopY) {
  const g = new THREE.Group();
  // Square legs tapering to a brass ferrule over a twin-wheel brass caster.
  const plate = 0.46,
    root = 0.34,
    foot = 0.2,
    ferrule = 0.1,
    wheel = 0.075;
  const footY = stageTopY + 2 * wheel + 0.02;
  const legPos = [
    [-3.0, 1.9, DIM.keyBottomY],
    [3.0, 1.9, DIM.keyBottomY],
    [-1.1, -3.4, DIM.caseBottomY],
  ];
  for (const [x, z, top] of legPos) {
    const shaftTop = top - 0.08;
    box(plate, 0.08, plate, mats.blackLacquer, g, x, top - 0.04, z);
    const shaftH = shaftTop - footY - ferrule;
    const shaft = new THREE.Mesh(
      taperedBox(root, foot, shaftH),
      mats.blackLacquer,
    );
    shaft.position.set(x, footY + ferrule + shaftH / 2, z);
    const cup = new THREE.Mesh(
      taperedBox(foot + 0.02, foot - 0.01, ferrule),
      mats.gold,
    );
    cup.position.set(x, footY + ferrule / 2, z);
    for (const m of [shaft, cup]) {
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    box(0.16, 0.02, 0.16, mats.gold, g, x, footY - 0.01, z); // swivel plate
    for (const side of [-1, 1])
      cyl(
        wheel,
        wheel,
        0.06,
        mats.gold,
        g,
        x + side * 0.05,
        stageTopY + wheel,
        z + 0.06,
        0,
        Math.PI / 2,
        "",
        18,
      );
  }

  return tag(
    g,
    "Legs & brass casters",
    "Three square tapered legs carry the case above the stage — two under the key bottom and one beneath the tail — each shod in a brass ferrule over a twin-wheel brass caster.",
    "Support",
  );
}

// ---------------------------------------------------------------------------
// Pedal lyre ----------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildPedals(mats) {
  const g = new THREE.Group();
  const pedalPivots = new Map();
  const topY = DIM.keyBottomY;
  const floor = -PIANO_LIFT; // the stage, in the piano's raised frame

  // Two lyre posts descending from the underside of the keybed.
  cyl(
    0.05,
    0.07,
    topY - floor - 0.34,
    mats.blackLacquer,
    g,
    -0.26,
    (topY + floor + 0.34) / 2,
    2.2,
    0,
    0.1,
    "",
    14,
  );
  cyl(
    0.05,
    0.07,
    topY - floor - 0.34,
    mats.blackLacquer,
    g,
    0.26,
    (topY + floor + 0.34) / 2,
    2.2,
    0,
    -0.1,
    "",
    14,
  );
  // A compact lyre base leaves the brass pedal arms visibly clear in front.
  box(0.64, 0.1, 0.24, mats.blackLacquer, g, 0, floor + 0.36, 2.1);
  // Anchor both ends instead of leaving a rotated rod floating in the case.
  g.add(
    cylBetween(
      new THREE.Vector3(0, floor + 0.41, 2.08),
      new THREE.Vector3(0, DIM.keyBottomY, 1.4),
      0.03,
      mats.blackSatin,
      8,
    ),
  );

  // Separate, elongated brass pedals pivot at the rear and project +Z.
  const pedalBodyGeo = new THREE.BoxGeometry(0.085, 0.035, 0.58);
  const pedalToeGeo = new THREE.CapsuleGeometry(0.085, 0.15, 4, 12);
  // Bake orientation before flattening in world Y: a horizontal foot plate.
  pedalToeGeo.rotateX(Math.PI / 2);
  pedalToeGeo.scale(1, 0.25, 1);
  [
    { type: "soft", x: -0.22, label: "Soft pedal" },
    { type: "sostenuto", x: 0, label: "Sostenuto pedal" },
    { type: "sustain", x: 0.22, label: "Sustain pedal" },
  ].forEach(({ type, x, label }) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, DIM.pedalPivotY, DIM.pedalPivotZ);
    const body = new THREE.Mesh(pedalBodyGeo, mats.gold);
    body.position.z = 0.29;
    const toe = new THREE.Mesh(pedalToeGeo, mats.gold);
    toe.position.set(0, 0, 0.64);
    body.castShadow = body.receiveShadow = true;
    toe.castShadow = toe.receiveShadow = true;
    for (const mesh of [body, toe]) {
      mesh.userData.pedalType = type;
      mesh.userData.partName = label;
      mesh.userData.partText =
        type === "sustain"
          ? "Hold to lift the dampers and sustain released notes."
          : `${label} is shown for anatomical reference. Only the sustain pedal affects the sound.`;
      mesh.userData.partCategory = "Controls";
      mesh.userData.inspectable = true;
    }
    pivot.add(body, toe);
    g.add(pivot);
    pedalPivots.set(type, pivot);
  });

  tag(
    g,
    "Pedal lyre",
    "Three pedals — soft, sostenuto and sustain — mounted on the decorative lyre that hangs centred beneath the keyboard and faces the player.",
    "Controls",
  );
  return { group: g, pedalPivots };
}

// ---------------------------------------------------------------------------
// Lid & prop ----------------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildLid(mats) {
  // Group holds a pivot (hinged along the bass spine) plus a prop stick.
  const g = new THREE.Group();

  const pivot = new THREE.Group();
  pivot.position.set(-3.6, DIM.lidHingeY, 0);
  pivot.rotation.z = DIM.lidOpenAngle; // Initial open state also defines accurate exploded bounds.
  g.add(pivot);

  const lid = extrudeFlat(footprintBand(-1.45), 0.06, mats.blackLacquer, 0.02);
  lid.position.set(3.6, 0, 0); // spine edge aligns with the pivot axis
  pivot.add(lid);

  // Finished satin-black underside; it remains distinct from the exterior
  // clearcoat without turning the open lid into a bright metallic panel.
  const underTrim = extrudeFlat(
    footprintBand(-1.45),
    0.012,
    mats.blackSatin,
    0,
  );
  underTrim.position.set(3.6, -0.014, 0);
  pivot.add(underTrim);

  // The front flap, folded back onto the lid on a continuous brass hinge.
  const flapShape = footprintBand(-1.45, -0.8);
  const flap = extrudeFlat(flapShape, 0.04, mats.blackLacquer, 0.012);
  flap.position.set(3.6, 0.082, 0); // its bevel clears the lid top (0.072)
  pivot.add(flap);
  const edge = flapShape
    .getPoints()
    .filter((p) => p.y < -1.44)
    .map((p) => p.x);
  const [left, right] = [Math.min(...edge), Math.max(...edge)];
  const hinge = cyl(
    0.016,
    0.016,
    right - left,
    mats.gold,
    null,
    3.6 + (left + right) / 2,
    0.08,
    1.43,
    0,
    Math.PI / 2,
    "",
    10,
  );
  pivot.add(hinge);

  const prop = cyl(
    0.045,
    0.045,
    1,
    mats.blackSatin,
    g,
    2.92,
    DIM.rimTopY + 1.0,
    -0.2,
    0,
    -0.28,
    "",
    12,
  );

  tag(
    g,
    "Grand-piano lid",
    "A thin lacquered lid matching the case outline, hinged along the bass-side spine and held open by a prop stick to project sound toward the audience.",
    "Exterior",
  );

  const base = new THREE.Vector3(3.42, DIM.rimTopY + 0.03, -0.2);
  const top = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function setAngle(angle) {
    pivot.rotation.z = angle;
    top.set(7.05 * Math.cos(angle), 7.05 * Math.sin(angle), -0.2);
    top.add(pivot.position);
    direction.subVectors(top, base);
    prop.position.copy(base).addScaledVector(direction, 0.5);
    prop.scale.y = direction.length();
    prop.quaternion.setFromUnitVectors(up, direction.normalize());
    prop.visible = angle > 0.03;
  }
  setAngle(DIM.lidOpenAngle);
  return { group: g, pivot, prop, setAngle };
}

// ---------------------------------------------------------------------------
// Music desk & score --------------------------------------------------------
// ---------------------------------------------------------------------------

export function buildMusicDesk(mats) {
  const g = new THREE.Group();

  // Rack ledge with a raised lip, and a board with rounded shoulders and a
  // gently arched top edge, as on a concert grand's desk.
  box(3.7, 0.07, 0.24, mats.blackLacquer, g, 0, 1.96, 1.9);
  box(3.7, 0.04, 0.03, mats.blackLacquer, g, 0, 2.01, 2.005);
  const [w, h, r] = [3.5, 1.2, 0.16];
  const outline = new THREE.Shape();
  outline.moveTo(-w / 2, -h / 2);
  outline.lineTo(w / 2, -h / 2);
  outline.lineTo(w / 2, h / 2 - r);
  outline.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  outline.quadraticCurveTo(0, h / 2 + 0.07, -w / 2 + r, h / 2);
  outline.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  const boardGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 0.04,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 24,
  });
  boardGeo.translate(0, 0, -0.02);
  const board = new THREE.Mesh(boardGeo, mats.blackLacquer);
  board.position.set(0, 2.58, 1.78);
  board.castShadow = board.receiveShadow = true;
  g.add(board);
  board.rotation.x = -0.2; // Top leans away from the player (+Z).

  board.name = "music-desk-board";
  // The book rests on the ledge and leans on the board's face.
  const book = createScoreBook(mats.maxAniso, SONGS[0]);
  book.group.position.set(0, -0.58 + book.height / 2, 0.042);
  board.add(book.group);
  g.userData.book = book;

  return tag(
    g,
    "Music desk & score",
    "An engraved edition of the selected piece on the music rack. Click the right page to turn forward, the left page to turn back; autoplay follows this score.",
    "Score",
  );
}
