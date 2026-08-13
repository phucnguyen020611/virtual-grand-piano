import * as THREE from "three";
import {
  DIM,
  box,
  cyl,
  extrudeFlat,
  applyPlanarXZUV,
  tag,
  outerFootprint,
  cavityPath,
  cavityShape,
  hitchRailCurve,
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
    { a: [1.25, 0.86], b: [1.85, -2.85], root: 0.32, tip: 0.15 },
    { a: [2.48, 0.55], b: [2.76, -1.55], root: 0.3, tip: 0.14 },
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
    [1.7, -2.78],
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

  const capstanGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.09, 6);
  const wippenGeo = new THREE.BoxGeometry(0.055, 0.035, 0.24);
  const shankGeo = new THREE.CylinderGeometry(
    0.011,
    0.011,
    DIM.hammerShankLength,
    6,
  );
  const hammerGeo = new THREE.BoxGeometry(0.075, 0.075, 0.145);
  const damperStemGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.18, 5);
  const damperHeadGeo = new THREE.BoxGeometry(0.065, 0.045, 0.095);

  // The rail supports individual dampers; upper C7–C8 are intentionally clear.
  box(6.5, 0.08, 0.22, mats.felt, g, 0, DIM.caseTopY - 0.06, 1.62);
  box(6.6, 0.06, 0.08, mats.maple, g, 0, DIM.caseTopY - 0.09, 1.78);

  for (let index = 0; index < layout.length; index++) {
    const entry = layout[index];
    const mechanism = new THREE.Group();
    mechanism.position.x = entry.x;

    // Rear linkage and wippen make the key → hammer relationship legible.
    const capstan = new THREE.Mesh(capstanGeo, mats.bronze);
    capstan.position.set(0, DIM.caseTopY - 0.025, 1.91);
    capstan.castShadow = capstan.receiveShadow = true;
    mechanism.add(capstan);
    const wippen = new THREE.Mesh(wippenGeo, mats.maple);
    wippen.position.set(0, DIM.caseTopY - 0.09, 1.78);
    wippen.rotation.x = -0.28;
    wippen.castShadow = wippen.receiveShadow = true;
    mechanism.add(wippen);

    const hammerPivot = new THREE.Group();
    hammerPivot.position.set(0, DIM.actionPivotY, DIM.actionPivotZ);
    hammerPivot.rotation.x = DIM.hammerRestAngle;
    const shank = new THREE.Mesh(shankGeo, mats.maple);
    shank.position.y = DIM.hammerShankLength / 2;
    const hammerHead = new THREE.Mesh(hammerGeo, mats.hammerFelt);
    hammerHead.position.set(0, DIM.hammerShankLength + 0.025, -0.035);
    shank.castShadow = shank.receiveShadow = true;
    hammerHead.castShadow = hammerHead.receiveShadow = true;
    hammerPivot.add(shank, hammerHead);
    mechanism.add(hammerPivot);

    let damperPivot = null;
    if (entry.midi <= DIM.damperCutoffMidi) {
      damperPivot = new THREE.Group();
      damperPivot.position.set(0, DIM.damperPivotY, DIM.damperPivotZ);
      const stem = new THREE.Mesh(damperStemGeo, mats.blackSatin);
      stem.position.y = 0.09;
      const head = new THREE.Mesh(damperHeadGeo, mats.felt);
      head.position.set(0, 0.19, -0.025);
      stem.castShadow = stem.receiveShadow = true;
      head.castShadow = head.receiveShadow = true;
      damperPivot.add(stem, head);
      mechanism.add(damperPivot);
    }

    mechanism.userData.stringRouteIndex = Math.round(
      (index / (layout.length - 1)) * Math.max(0, stringRoutes.length - 1),
    );
    g.add(mechanism);
    midiToMechanism.set(entry.midi, {
      mechanism,
      capstan,
      wippen,
      hammerPivot,
      damperPivot,
      stringRoute: stringRoutes[mechanism.userData.stringRouteIndex] || null,
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
  const pedalPivots = new Map();
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

  // Separate, elongated brass pedals pivot at the rear and project +Z.
  const pedalBodyGeo = new THREE.BoxGeometry(0.14, 0.045, 0.5);
  const pedalToeGeo = new THREE.SphereGeometry(0.087, 10, 7);
  [
    { type: "soft", x: -0.22, label: "Soft pedal" },
    { type: "sostenuto", x: 0, label: "Sostenuto pedal" },
    { type: "sustain", x: 0.22, label: "Sustain pedal" },
  ].forEach(({ type, x, label }) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, DIM.pedalPivotY, DIM.pedalPivotZ);
    const body = new THREE.Mesh(pedalBodyGeo, mats.gold);
    body.position.z = 0.27;
    const toe = new THREE.Mesh(pedalToeGeo, mats.gold);
    toe.scale.set(0.82, 0.36, 1.2);
    toe.position.set(0, 0, 0.55);
    body.castShadow = body.receiveShadow = true;
    toe.castShadow = toe.receiveShadow = true;
    for (const mesh of [body, toe]) {
      mesh.userData.pedalType = type;
      mesh.userData.partName = label;
      mesh.userData.partText =
        type === "sustain"
          ? "Hold to lift the dampers and sustain released notes."
          : `${label} geometry is inspectable and animated; its acoustic behavior is reserved for a later mechanics phase.`;
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
  pivot.position.set(-3.6, DIM.caseTopY, 0);
  g.add(pivot);

  const lid = extrudeFlat(lidShape(), 0.06, mats.blackLacquer, 0.02);
  lid.position.set(3.6, 0, 0); // spine edge aligns with the pivot axis
  pivot.add(lid);

  // Finished satin-black underside; it remains distinct from the exterior
  // clearcoat without turning the open lid into a bright metallic panel.
  const underTrim = extrudeFlat(lidShape(), 0.012, mats.blackSatin, 0);
  underTrim.position.set(3.6, -0.014, 0);
  pivot.add(underTrim);

  const prop = cyl(
    0.045,
    0.045,
    2.2,
    mats.blackSatin,
    g,
    2.92,
    DIM.caseTopY + 1.0,
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
    color: 0xd7cebb,
    map: sheetTex,
    roughness: 0.9,
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
