import * as THREE from "three";

/**
 * Shared geometry helpers and the master dimension table for the procedural
 * grand piano. Every anatomy module reads its heights from `DIM` so the
 * vertical stack (case → soundboard → plate → strings → action → lid) stays
 * physically consistent and free of arbitrary overlaps.
 *
 * Coordinate convention
 * ---------------------
 * The piano faces the player along +Z (keyboard at +Z, tail at -Z).
 * Width runs along X: bass / spine on the left (-X), treble bent side (+X).
 * Footprint shapes are authored in "shape space" (sx, sy). After
 * `extrudeFlat` they lie in the XZ plane with world.x = sx, world.z = -sy and
 * the extruded thickness growing upward from the mesh's base (y ≈ 0).
 */
export const DIM = {
  // Case / rim -------------------------------------------------------------
  caseBottomY: 0.86, // underside of the rim (legs reach down from here)
  caseTopY: 1.4, // top edge of the rim wall / keybed surface
  wallThickness: 0.36, // visible rim wall thickness

  // Interior stack (all below the rim top so the rim frames the anatomy) ---
  cavityFloorY: 0.92, // dark inner floor closing the belly underside
  ribY: 1.06, // ribs sit just under the soundboard
  soundboardTopY: 1.12, // top face of the thin spruce soundboard
  soundboardThickness: 0.05,
  // The bridge projects just above the plate frame, while the string paths
  // dip onto its crown before rising again to their terminations.
  bridgeCenterY: 1.195,
  bridgeRadius: 0.055,
  bridgeTopY: 1.25,
  plateY: 1.155,
  plateThickness: 0.07,
  plateBraceY: 1.14,
  plateBraceThickness: 0.025,
  stringY: 1.29,
  tuningPointY: 1.31,
  frontBearingY: 1.29,
  bridgeContactY: 1.255,
  hitchPointY: 1.285,
  frontBearingZ: 1.02,
  tuningPinZ: 1.18,
  tuningRowStep: 0.08,
  pinblockMinX: -3.1,
  pinblockMaxX: 3.1,
  pinblockMinZ: 1.04,
  pinblockMaxZ: 1.66,
  tuningFieldMinX: -2.9,
  tuningFieldMaxX: 2.9,
  frontBearingMinX: -2.9,
  frontBearingMaxX: 2.9,
  tuningPinHeight: 0.085,
  tuningPinRadius: 0.018,
  hitchPinHeight: 0.07,
  hitchPinRadius: 0.019,
  bridgePinHeight: 0.042,

  // Front / keyboard -------------------------------------------------------
  frontEdgeZ: 2.4, // world Z of the straight front (case) edge
  keybedTopY: 1.4, // surface the keys rest on
  whiteKeyTopY: 1.445, // resting centre Y of a white key
  blackKeyTopY: 1.505, // resting centre Y of a black key
  keyboardWidth: 6.6, // total span of the 88 keys along X

  // Tail -------------------------------------------------------------------
  tailZ: -4.9,
};

// --- Primitive mesh helpers -------------------------------------------------

export function box(w, h, d, mat, parent, x = 0, y = 0, z = 0, name = "") {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  if (name) {
    m.userData.partName = name;
    m.userData.inspectable = true;
  }
  if (parent) parent.add(m);
  return m;
}

export function cyl(
  r1,
  r2,
  h,
  mat,
  parent,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  rz = 0,
  name = "",
  seg = 20,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  m.castShadow = m.receiveShadow = true;
  if (name) {
    m.userData.partName = name;
    m.userData.inspectable = true;
  }
  if (parent) parent.add(m);
  return m;
}

/** A cylinder that spans two points — used for strings and pins. */
export function cylBetween(a, b, r, mat, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Extrude a 2D shape into a flat plate lying in the XZ plane. The extruded
 * thickness grows upward from the mesh base (y ≈ 0), so callers set
 * `mesh.position.y` to the desired bottom face.
 */
export function extrudeFlat(shape, thickness, mat, bevel = 0.03) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel * 0.6,
    curveSegments: 48,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Replace per-triangle extrusion UVs with one continuous XZ projection. This
 * is useful for broad timber faces whose grain must run across the complete
 * shape rather than restarting at each triangulated polygon.
 */
export function applyPlanarXZUV(geometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  const width = Math.max(bounds.max.x - bounds.min.x, Number.EPSILON);
  const depth = Math.max(bounds.max.z - bounds.min.z, Number.EPSILON);

  for (let index = 0; index < position.count; index++) {
    uv[index * 2] = (position.getX(index) - bounds.min.x) / width;
    uv[index * 2 + 1] = (position.getZ(index) - bounds.min.z) / depth;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
  return geometry;
}

/** Attach inspection metadata to a group and route child meshes back to it. */
export function tag(obj, name, desc, category = "Piano anatomy") {
  obj.userData.inspectable = true;
  obj.userData.partName = name;
  obj.userData.partText = desc;
  obj.userData.partCategory = category;
  obj.traverse((o) => {
    if (o.isMesh) o.userData.owner = obj;
  });
  return obj;
}

// --- Footprint contours -----------------------------------------------------
// Authored in shape space (sx, sy). world.x = sx, world.z = -sy.

/** Outer silhouette of the whole case: straight front, straight bass spine,
 *  curved treble bent side sweeping around the tail. */
export function outerFootprint() {
  const s = new THREE.Shape();
  s.moveTo(-3.6, -2.4); // front-left (spine corner)
  s.lineTo(3.6, -2.4); // straight front edge
  s.bezierCurveTo(4.05, -0.6, 3.9, 1.7, 2.85, 3.25); // treble bulge, curving in
  s.bezierCurveTo(1.9, 4.55, 0.4, 5.0, -1.15, 4.9); // around the tail
  s.bezierCurveTo(-2.5, 4.8, -3.25, 4.6, -3.6, 4.3); // into the spine corner
  s.lineTo(-3.6, -2.4); // straight bass spine
  return s;
}

/** Inner cavity contour (a THREE.Path suitable for use as a hole). The front
 *  stops short of the case front, leaving a solid keybed band. */
export function cavityPath() {
  const h = new THREE.Path();
  h.moveTo(-3.24, -1.45);
  h.lineTo(3.24, -1.45);
  h.bezierCurveTo(3.64, -0.45, 3.5, 1.55, 2.5, 3.0);
  h.bezierCurveTo(1.7, 4.2, 0.35, 4.6, -1.0, 4.5);
  h.bezierCurveTo(-2.15, 4.42, -2.85, 4.25, -3.24, 3.95);
  h.lineTo(-3.24, -1.45);
  return h;
}

/** Closed Shape matching the cavity outline (for the soundboard / floor). */
export function cavityShape(inset = 0) {
  const s = new THREE.Shape();
  const k = 1 - inset;
  s.moveTo(-3.24 * k, -1.45);
  s.lineTo(3.24 * k, -1.45);
  s.bezierCurveTo(3.64 * k, -0.45, 3.5 * k, 1.55, 2.5 * k, 3.0 * k);
  s.bezierCurveTo(1.7 * k, 4.2 * k, 0.35 * k, 4.6 * k, -1.0 * k, 4.5 * k);
  s.bezierCurveTo(
    -2.15 * k,
    4.42 * k,
    -2.85 * k,
    4.25 * k,
    -3.24 * k,
    3.95 * k,
  );
  s.lineTo(-3.24 * k, -1.45);
  return s;
}

/** Plate perimeter as a thin ring: cavity-sized outer contour with an inner
 *  hole, leaving open windows where the soundboard shows through. */
export function plateRingShape() {
  const s = cavityShape(0.02);
  const hole = new THREE.Path();
  hole.moveTo(-2.86, -1.05);
  hole.lineTo(2.86, -1.05);
  hole.bezierCurveTo(3.2, -0.3, 3.05, 1.4, 2.15, 2.65);
  hole.bezierCurveTo(1.42, 3.72, 0.25, 4.05, -0.9, 3.96);
  hole.bezierCurveTo(-1.9, 3.9, -2.5, 3.74, -2.86, 3.48);
  hole.lineTo(-2.86, -1.05);
  s.holes.push(hole);
  return s;
}

/** Continuous bridge paths shared by the bridge meshes and string routing. */
export function mainBridgeCurve(y = 0) {
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(2.55, y, 0.55),
    new THREE.Vector3(1.1, y, -0.7),
    new THREE.Vector3(-1.15, y, -1.65),
  );
}

export function bassBridgeCurve(y = 0) {
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.7, y, -1.4),
    new THREE.Vector3(-1.7, y, -2.35),
    new THREE.Vector3(-2.4, y, -3.15),
  );
}

/** The tail rail that carries the hitch-pin field. */
export function hitchRailCurve(y = 0) {
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(1.9, y, -0.4),
    new THREE.Vector3(0.4, y, -4.2),
    new THREE.Vector3(-2.6, y, -3.4),
  );
}
