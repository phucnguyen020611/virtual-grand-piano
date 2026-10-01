import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { onStage } from "../piano/geometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  damaskSet,
  PARQUET_TILE,
  parquetSet,
  plasterSet,
  repeatSet,
  runnerSet,
  stageBoardSet,
  velvetSet,
} from "./surfaces.js";
import { buildRoyalInterior } from "./royalDecor.js";
import { createComposerProjection } from "./composerProjection.js";

// One scene unit is ~0.21 m (the keyboard is 5.9 units, 1.22 m wide).
const STAGE_TOP = -0.045; // legs and casters sit on this plane
const STAGE_FRONT_Z = 12;
const STAGE_BACK_Z = -26;
const STAGE_RISE = 4.8; // ~1 m above the stalls
const HALL_HALF_WIDTH = 34;
const HALL_BACK_Z = 100;
const CEILING_Y = 72;

// Stepped stalls: each row of seats stands on its own tier, ~15 cm above the
// one in front, and the tiers bow toward the stage with the rows.
const STALLS_BASE = STAGE_TOP - STAGE_RISE;
const ROWS = 17;
const ROW_PITCH = 4.6;
const FIRST_ROW_Z = STAGE_FRONT_Z + 6;
const TIER_RISE = 0.7;
const AISLE_HALF = 2.1;
const rowCurve = (x) => (x * x) / 160;
const tierFrontZ = (k, x = 0) =>
  FIRST_ROW_Z + k * ROW_PITCH - 1.9 + rowCurve(x);
const tierY = (k) => STALLS_BASE + (k + 1) * TIER_RISE; // top of tier k
const stallsY = (z, x = 0) =>
  tierY(
    THREE.MathUtils.clamp(
      Math.floor((z - tierFrontZ(0, x)) / ROW_PITCH),
      -1,
      ROWS - 1,
    ),
  );
const floorY = (z, x = 0) => (z < STAGE_FRONT_Z ? STAGE_TOP : stallsY(z, x));
const BALCONY_Y = 24;
const ORGAN_Y = 9; // base of the display pipes

function mesh(geometry, material, x, y, z, parent) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * The stepped stalls floor as treads and risers, `segments` pieces across.
 * `across` gives each vertex's u (runner) or world x; `lift` raises the
 * surface a hair above the carpet for the aisle runner.
 */
function tiers(
  x0,
  x1,
  segments,
  { lift = 0, curved = true, u = (x) => x } = {},
) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  let run = 0; // distance along the aisle, so a runner's pattern flows on
  const strip = (point, normal, length) => {
    const start = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const x = x0 + ((x1 - x0) * i) / segments;
      for (const side of [0, 1]) {
        positions.push(...point(x, side));
        normals.push(...normal);
        uvs.push(u(x), run + side * length);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    run += length;
  };
  const front = (k, x) => tierFrontZ(k, curved ? x : 0);
  const tread = (y, z0, z1) =>
    strip(
      (x, side) => [x, y + lift, side ? z1(x) : z0(x)],
      [0, 1, 0],
      z1(0) - z0(0),
    );
  const riser = (y0, y1, z) =>
    strip((x, side) => [x, side ? y1 : y0, z(x) - lift], [0, 0, -1], y1 - y0);
  tread(
    STALLS_BASE,
    () => STAGE_FRONT_Z,
    (x) => front(0, x),
  );
  for (let k = 0; k < ROWS; k++) {
    riser(tierY(k - 1), tierY(k), (x) => front(k, x));
    tread(
      tierY(k),
      (x) => front(k, x),
      (x) => (k < ROWS - 1 ? front(k + 1, x) : HALL_BACK_Z),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A strip of carpet across x ∈ [-half, half] following a [y, z] profile that
 * runs down toward the audience (+z), so every face turns up or toward the
 * hall. v is the distance along the profile, so the pattern flows on.
 */
function runnerAlong(profile, half, lift = 0.012) {
  const positions = [];
  const uvs = [];
  let run = 0;
  for (let i = 1; i < profile.length; i++) {
    const [y0, z0] = profile[i - 1];
    const [y1, z1] = profile[i];
    const length = Math.hypot(y1 - y0, z1 - z0);
    // Nudge off the step: up on treads, toward the hall on risers.
    const [ly, lz] = y0 === y1 ? [lift, 0] : [0, lift];
    const corner = (x, y, z, v) => {
      positions.push(x, y + ly, z + lz);
      uvs.push((x + half) / (2 * half), v);
    };
    // Two triangles, wound to face the profile's outward side.
    for (const [x, y, z, v] of [
      [-half, y0, z0, run],
      [-half, y1, z1, run + length],
      [half, y0, z0, run],
      [-half, y1, z1, run + length],
      [half, y1, z1, run + length],
      [half, y0, z0, run],
    ])
      corner(x, y, z, v);
    run += length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** One theatre seat: velvet cushion + back, wooden arms, a steel stand. */
function seatGeometries() {
  const velvet = [];
  const frame = [];
  // Rounded upholstery: box edges are what made the seats read as blocks.
  // Two edge segments: round at viewing distance, ~1/2 the triangles of 3
  // across 340 instanced seats.
  const cushion = new RoundedBoxGeometry(2.1, 0.5, 1.9, 2, 0.2);
  cushion.translate(0, 2.1, 0.1);
  const back = new RoundedBoxGeometry(2.1, 2.8, 0.5, 2, 0.22);
  back.rotateX(-0.16);
  back.translate(0, 3.75, 1.05);
  velvet.push(cushion, back);
  for (const side of [-1, 1]) {
    const arm = new RoundedBoxGeometry(0.28, 0.22, 1.9, 1, 0.08);
    arm.translate(side * 1.18, 3.0, 0.3);
    const post = new THREE.BoxGeometry(0.22, 3.0, 0.22);
    post.translate(side * 1.18, 1.5, 0.9);
    frame.push(arm, post);
  }
  // Rounded and plain boxes differ in indexing; merge them as triangle soup.
  const merge = (parts) =>
    mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  return { velvet: merge(velvet), frame: merge(frame) };
}

/**
 * A shoebox concert hall in the European court style (see royalDecor.js):
 * wooden stage and gilded organ, crimson damask and ivory walls, balconies,
 * raked stalls of velvet seats, chandeliers and a theatrical lighting rig.
 */
export function createHall(scene, mats) {
  RectAreaLightUniformsLib.init();
  const hall = new THREE.Group();
  hall.name = "concert-hall";
  scene.add(hall);

  const aniso = mats.maxAniso;
  const velvet = velvetSet(aniso);

  // --- Stage -------------------------------------------------------------------
  // Board width ~0.13 m: eight boards (one tile) span ~5 units.
  const boards = stageBoardSet(aniso);
  const woodSet = (x, y, color = 0xffffff, rough = 1) =>
    new THREE.MeshStandardMaterial({
      color,
      ...repeatSet(boards, x, y),
      roughness: rough,
    });
  const stageDepth = STAGE_FRONT_Z - STAGE_BACK_Z;
  // Herringbone oak parquet, as in a palace salon.
  const stage = mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, 0.55, stageDepth),
    new THREE.MeshPhysicalMaterial({
      ...repeatSet(
        parquetSet(aniso),
        (HALL_HALF_WIDTH * 2) / PARQUET_TILE[0],
        stageDepth / PARQUET_TILE[1],
      ),
      roughness: 1,
      // Satin polyurethane over stained oak.
      clearcoat: 0.3,
      clearcoatRoughness: 0.38,
    }),
    0,
    STAGE_TOP - 0.275,
    (STAGE_FRONT_Z + STAGE_BACK_Z) / 2,
    hall,
  );
  stage.name = "stage-floor";
  const darkWood = woodSet(12, 1, 0x4a3a30);
  mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, STAGE_RISE, 0.5),
    darkWood,
    0,
    STAGE_TOP - STAGE_RISE / 2,
    STAGE_FRONT_Z + 0.25,
    hall,
  );

  // --- Walls -------------------------------------------------------------------
  // Crimson silk damask to balcony height, ivory lime plaster above.
  const damask = damaskSet(aniso);
  const plasterTiles = plasterSet(aniso);
  const plasterWall = (width, height) =>
    new THREE.MeshStandardMaterial({
      ...repeatSet(plasterTiles, width / 10, height / 10),
      color: 0xe8dcc0,
      roughness: 1,
    });
  const wallHeight = CEILING_Y - (STAGE_TOP - STAGE_RISE);
  const wallBase = STAGE_TOP - STAGE_RISE;
  const dadoHeight = BALCONY_Y - wallBase;
  const backWall = mesh(
    new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, wallHeight),
    plasterWall(HALL_HALF_WIDTH * 2, wallHeight),
    0,
    wallBase + wallHeight / 2,
    STAGE_BACK_Z,
    hall,
  );
  backWall.name = "stage-back-wall";
  const hallLength = HALL_BACK_Z - STAGE_BACK_Z;
  const damaskWall = new THREE.MeshStandardMaterial({
    ...repeatSet(damask, hallLength / 6, dadoHeight / 9),
    roughness: 1,
  });
  const upperPlaster = plasterWall(hallLength, wallHeight - dadoHeight);
  for (const side of [-1, 1]) {
    const dado = mesh(
      new THREE.PlaneGeometry(hallLength, dadoHeight),
      damaskWall,
      side * HALL_HALF_WIDTH,
      wallBase + dadoHeight / 2,
      (HALL_BACK_Z + STAGE_BACK_Z) / 2,
      hall,
    );
    dado.rotation.y = -side * (Math.PI / 2);
    const upper = mesh(
      new THREE.PlaneGeometry(hallLength, wallHeight - dadoHeight),
      upperPlaster,
      side * HALL_HALF_WIDTH,
      BALCONY_Y + (wallHeight - dadoHeight) / 2,
      (HALL_BACK_Z + STAGE_BACK_Z) / 2,
      hall,
    );
    upper.rotation.y = -side * (Math.PI / 2);
    // Balcony deck; its gilded balustrade comes with the royal interior.
    const balconyZ0 = 16;
    const balconyLength = HALL_BACK_Z - balconyZ0;
    mesh(
      new THREE.BoxGeometry(6, 1, balconyLength),
      darkWood,
      side * (HALL_HALF_WIDTH - 3),
      BALCONY_Y,
      balconyZ0 + balconyLength / 2,
      hall,
    );
  }
  const rear = mesh(
    new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, wallHeight),
    damaskWall,
    0,
    wallBase + wallHeight / 2,
    HALL_BACK_Z,
    hall,
  );
  rear.rotation.y = Math.PI;

  const royal = buildRoyalInterior(hall, scene, {
    halfWidth: HALL_HALF_WIDTH,
    stageFrontZ: STAGE_FRONT_Z,
    stageBackZ: STAGE_BACK_Z,
    backZ: HALL_BACK_Z,
    ceilingY: CEILING_Y,
    floorY,
    balconyY: BALCONY_Y,
    aniso,
    velvet,
    glowWall: upperPlaster, // the stained glass lights it
  });
  // Autoplay casts the composer's portrait, lantern-show style, on the bare
  // wall behind the stalls, clear of the back rows and the balconies.
  const projection = createComposerProjection(
    hall,
    // Off the wall by a hand's breadth: that far from the camera, depth
    // precision is too coarse to tell a decal from the wall behind it.
    new THREE.Vector3(0, 40, HALL_BACK_Z - 0.6),
    30,
    royal.portraitMaps,
  );
  const gold = royal.gilt;
  // Gilded nosing along the stage front.
  mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, 0.35, 0.7),
    gold,
    0,
    STAGE_TOP - 0.2,
    STAGE_FRONT_Z + 0.35,
    hall,
  );

  // --- Organ on the back wall ------------------------------------------------------
  const pipes = [];
  for (const [cx, count, tall] of [
    [-15, 11, 15],
    [0, 15, 23],
    [15, 11, 15],
  ])
    for (let i = 0; i < count; i++) {
      const offset = i - (count - 1) / 2;
      // Pipes rise toward the centre of each tower, as organ fronts do.
      const height = tall - Math.abs(offset) * (tall / count) * 1.1;
      pipes.push([cx + offset * 1.05, height]);
    }
  const pipeGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1, 14);
  pipeGeometry.translate(0, 0.5, 0);
  const pipeMesh = new THREE.InstancedMesh(
    pipeGeometry,
    gold, // gilded display pipes, as in the Golden Hall
    pipes.length,
  );
  const matrix = new THREE.Matrix4();
  pipes.forEach(([x, height], i) => {
    matrix.makeScale(1, height, 1).setPosition(x, ORGAN_Y, STAGE_BACK_Z + 1.2);
    pipeMesh.setMatrixAt(i, matrix);
  });
  hall.add(pipeMesh);
  mesh(
    new THREE.BoxGeometry(46, 3, 3),
    darkWood,
    0,
    ORGAN_Y - 1.5,
    STAGE_BACK_Z + 1.5,
    hall,
  );
  mesh(
    new THREE.BoxGeometry(46.6, 0.45, 3.4),
    gold,
    0,
    ORGAN_Y + 0.05,
    STAGE_BACK_Z + 1.5,
    hall,
  );

  // --- Parnassus above the organ ----------------------------------------------------
  // Anton Raphael Mengs, "Parnassus" (1761): Apollo and the nine Muses, the
  // patrons of music, in a deep gilt frame (see docs/THIRD_PARTY_ART.md).
  const PAINTING_H = 24;
  const PAINTING_W = PAINTING_H * (2000 / 1115);
  const PAINTING_Y = ORGAN_Y + 23 + 3.4 + PAINTING_H / 2;
  const canvas = new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}art/parnassus.jpg`,
  );
  canvas.colorSpace = THREE.SRGBColorSpace;
  canvas.anisotropy = aniso;
  // Trim the scan's thin black border.
  canvas.offset.set(0.004, 0.007);
  canvas.repeat.set(0.992, 0.986);
  const painting = mesh(
    new THREE.PlaneGeometry(PAINTING_W, PAINTING_H),
    new THREE.MeshStandardMaterial({ map: canvas, roughness: 0.82 }),
    0,
    PAINTING_Y,
    STAGE_BACK_Z + 0.35,
    hall,
  );
  painting.name = "parnassus";
  const rect = (w, h) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.lineTo(-w / 2, -h / 2);
    return shape;
  };
  const moulding = (outer, inner, depth, bevel) => {
    const shape = rect(PAINTING_W + outer, PAINTING_H + outer);
    shape.holes.push(rect(PAINTING_W + inner, PAINTING_H + inner));
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
    });
  };
  // A broad outer moulding, a sunk cove and a fine sight-edge lip.
  for (const [outer, inner, depth, bevel] of [
    [4.2, 1.8, 0.7, 0.35],
    [1.4, 0.3, 0.9, 0.12],
  ])
    mesh(
      moulding(outer, inner, depth, bevel),
      gold,
      0,
      PAINTING_Y,
      STAGE_BACK_Z + 0.1,
      hall,
    );

  // Gilded pilasters from the stage to the cornice frame the whole wall.
  // (Merged with the stair balustrade below into one mesh.)
  const gilded = [];
  const pilasterH = CEILING_Y - 8 - STAGE_TOP;
  for (const x of [-31, -26, 26, 31])
    gilded.push(
      new THREE.CylinderGeometry(0.8, 0.9, pilasterH, 20, 1, false, 0, Math.PI)
        .rotateY(-Math.PI / 2)
        .translate(x, STAGE_TOP + pilasterH / 2, STAGE_BACK_Z),
      new THREE.BoxGeometry(2.4, 1, 1.4).translate(
        x,
        STAGE_TOP + pilasterH - 0.5,
        STAGE_BACK_Z + 0.7,
      ),
      new THREE.BoxGeometry(2.3, 0.9, 1.4).translate(
        x,
        STAGE_TOP + 0.45,
        STAGE_BACK_Z + 0.7,
      ),
    );

  // --- Stalls ------------------------------------------------------------------------
  // Low-pile carpet on every tread and riser: the velvet weave, tighter and
  // darker (uv in world units).
  mesh(
    tiers(-HALL_HALF_WIDTH, HALL_HALF_WIDTH, 48),
    new THREE.MeshStandardMaterial({
      ...repeatSet(velvet, 1.75, 1.75),
      color: 0x5a4040,
      roughness: 1,
    }),
    0,
    0,
    0,
    hall,
  ).name = "stalls-floor";
  // A royal runner up the centre aisle, a gilt nosing on every step.
  const runnerMaterial = new THREE.MeshPhysicalMaterial({
    ...repeatSet(runnerSet(aniso), 1, 1 / 7),
    roughness: 1,
    sheen: 0.7,
    sheenRoughness: 0.4,
    sheenColor: 0xff9090,
  });
  mesh(
    tiers(-AISLE_HALF, AISLE_HALF, 1, {
      lift: 0.012,
      curved: false,
      u: (x) => (x + AISLE_HALF) / (2 * AISLE_HALF),
    }),
    runnerMaterial,
    0,
    0,
    0,
    hall,
  ).name = "aisle-runner";
  const nosing = new THREE.BoxGeometry(2 * AISLE_HALF + 0.2, 0.07, 0.12);
  const nosings = new THREE.InstancedMesh(nosing, royal.gilt, ROWS);
  for (let k = 0; k < ROWS; k++)
    nosings.setMatrixAt(
      k,
      new THREE.Matrix4().makeTranslation(
        0,
        tierY(k) + 0.03,
        tierFrontZ(k) + 0.05,
      ),
    );
  hall.add(nosings);

  // --- Stairs up to the stage, carpeted like the aisle -------------------------------
  const STEPS = 7;
  const stepRise = STAGE_RISE / STEPS;
  const stepRun = 0.5;
  const stairFront = STAGE_FRONT_Z + 0.7; // clear of the gilt stage nosing
  const stairHalf = 3.2;
  const stairZ = (i) => stairFront + (STEPS - i) * stepRun; // front of step i
  const steps = [];
  for (let i = 1; i < STEPS; i++) {
    const depth = stairZ(i) - (STAGE_FRONT_Z + 0.5);
    steps.push(
      new THREE.BoxGeometry(stairHalf * 2, i * stepRise, depth).translate(
        0,
        STALLS_BASE + (i * stepRise) / 2,
        STAGE_FRONT_Z + 0.5 + depth / 2,
      ),
    );
  }
  hall.add(new THREE.Mesh(mergeGeometries(steps), darkWood));
  // The runner climbs the treads and risers from the stage lip down.
  const profile = [
    [STAGE_TOP, STAGE_FRONT_Z + 0.5],
    [STAGE_TOP, stairFront],
  ];
  for (let i = STEPS - 1; i >= 1; i--) {
    const y = STALLS_BASE + i * stepRise;
    profile.push([y, stairZ(i) - stepRun], [y, stairZ(i)]);
  }
  profile.push([STALLS_BASE, stairZ(1)]);
  mesh(runnerAlong(profile, AISLE_HALF), runnerMaterial, 0, 0, 0, hall);
  // Nosings, and a gilt balustrade each side: newels with finials at the foot
  // and the head, a rail between, and a baluster per step reaching the rail.
  for (let i = 1; i < STEPS; i++)
    gilded.push(
      nosing
        .clone()
        .translate(0, STALLS_BASE + i * stepRise + 0.03, stairZ(i) - 0.05),
    );
  const topStep = STALLS_BASE + (STEPS - 1) * stepRise;
  for (const side of [-1, 1]) {
    const x = side * (stairHalf - 0.2);
    const foot = new THREE.Vector3(
      x,
      STALLS_BASE + stepRise + 2.6,
      stairZ(1) - 0.3,
    );
    const head = new THREE.Vector3(x, STAGE_TOP + 2.6, STAGE_FRONT_Z + 0.9);
    for (const [top, bottom, z] of [
      [foot.y, STALLS_BASE + stepRise, foot.z],
      [head.y, topStep, head.z],
    ])
      gilded.push(
        new THREE.CylinderGeometry(0.2, 0.26, top - bottom, 16).translate(
          x,
          (top + bottom) / 2,
          z,
        ),
        new THREE.SphereGeometry(0.32, 16, 12).translate(x, top + 0.3, z),
      );
    gilded.push(
      new THREE.CylinderGeometry(0.1, 0.1, foot.distanceTo(head), 10)
        .applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            UP,
            head.clone().sub(foot).normalize(),
          ),
        )
        .translate(
          (foot.x + head.x) / 2,
          (foot.y + head.y) / 2,
          (foot.z + head.z) / 2,
        ),
    );
    for (let i = 2; i < STEPS - 1; i++) {
      const z = stairZ(i) - stepRun / 2;
      const top =
        foot.y + ((foot.z - z) / (foot.z - head.z)) * (head.y - foot.y);
      const bottom = STALLS_BASE + i * stepRise;
      gilded.push(
        new THREE.CylinderGeometry(0.06, 0.06, top - bottom, 8).translate(
          x,
          (top + bottom) / 2,
          z,
        ),
      );
    }
  }
  // Every small gilt piece of the stage wall and the stairs: one draw call.
  hall.add(new THREE.Mesh(mergeGeometries(gilded), gold));

  const { velvet: seatShape, frame } = seatGeometries();
  const seats = [];
  for (let row = 0; row < 17; row++) {
    const rowZ = FIRST_ROW_Z + row * ROW_PITCH;
    // 3.2 apart (the seat with its arms is 2.64 wide), so neighbours on the
    // curve never touch; each faces square to its row, as in a real hall.
    for (let x = 3.9; x < 27; x += 3.2)
      for (const side of [-1, 1]) {
        const sx = side * x;
        const z = rowZ + rowCurve(sx);
        seats.push([sx, tierY(row), z, Math.atan(sx / 80)]); // rowCurve' = x/80
      }
  }
  const velvetSeats = new THREE.InstancedMesh(
    seatShape,
    new THREE.MeshPhysicalMaterial({
      ...repeatSet(velvet, 5, 5),
      roughness: 1,
      // Pile sheen: velvet lights up at grazing angles.
      sheen: 1,
      sheenRoughness: 0.32,
      sheenColor: 0xe0707e,
    }),
    seats.length,
  );
  const frameSeats = new THREE.InstancedMesh(frame, gold, seats.length);
  const q = new THREE.Quaternion();
  const tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  seats.forEach(([x, y, z, yaw], i) => {
    matrix.compose(pos.set(x, y, z), q.setFromAxisAngle(up, yaw), one);
    velvetSeats.setMatrixAt(i, matrix);
    // Years of use: no two seats fade quite alike.
    velvetSeats.setColorAt(
      i,
      tint.setScalar(0.9 + (((i * 7919) % 97) / 97) * 0.2),
    );
    frameSeats.setMatrixAt(i, matrix);
  });
  hall.add(velvetSeats, frameSeats);

  // --- Lighting rig ------------------------------------------------------------------
  // Piano and bench together: the pool of light covers the whole stage set.
  const normalFocus = onStage(0, 1.2, 0.3);
  const explodedFocus = onStage(0, 4.35, -0.65);
  const focus = normalFocus.clone();

  const spot = (color, intensity, position, angle, penumbra) => {
    const light = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 0);
    light.position.copy(position);
    scene.add(light, light.target);
    return light;
  };
  // Front-of-house key from the lighting bridge: the only shadow caster.
  const key = spot(0xfff1dc, 3.2, new THREE.Vector3(12, 46, 40), 0.105, 0.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00008;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  key.shadow.camera.near = 30;
  key.shadow.camera.far = 90;
  const fill = spot(0xffe2c0, 1.4, new THREE.Vector3(-18, 42, 36), 0.12, 0.8);
  const back = spot(0xd8e4ff, 1.8, new THREE.Vector3(-4, 48, -20), 0.24, 0.6);

  // Soft overhead wash for the whole stage, and a warm glaze on the organ wall.
  const wash = new THREE.RectAreaLight(0xffe8cc, 0.2, 56, 30);
  wash.position.set(0, 44, -6);
  wash.lookAt(0, 0, -6);
  const wallGlaze = new THREE.RectAreaLight(0xffc98f, 0.3, 60, 20);
  wallGlaze.position.set(0, 10, -8);
  wallGlaze.lookAt(0, 22, STAGE_BACK_Z);
  // A warm gallery wash on the painting.
  const artLight = new THREE.RectAreaLight(0xffe6c4, 1.7, PAINTING_W + 6, 8);
  artLight.position.set(0, PAINTING_Y - 16, STAGE_BACK_Z + 14);
  artLight.lookAt(0, PAINTING_Y, STAGE_BACK_Z);
  scene.add(wash, wallGlaze, artLight);

  // House lights: the chandeliers (royalDecor) carry the room; this is only
  // the faint bounce from the gilt and the damask.
  const bounce = new THREE.HemisphereLight(0x9a8672, 0x2a1c14, 0.1);
  scene.add(bounce);

  // Ghost light: the bare work lamp a closed theatre leaves burning on stage.
  const ghost = new THREE.Group();
  ghost.name = "ghost-light";
  const ironwork = new THREE.MeshStandardMaterial({
    color: 0x1b1a19,
    metalness: 0.6,
    roughness: 0.5,
  });
  mesh(
    new THREE.CylinderGeometry(0.9, 1, 0.3, 24),
    ironwork,
    0,
    0.15,
    0,
    ghost,
  );
  mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 8, 8),
    ironwork,
    0,
    4.2,
    0,
    ghost,
  );
  const ghostGlass = new THREE.MeshBasicMaterial({ toneMapped: false });
  mesh(new THREE.SphereGeometry(0.3, 16, 12), ghostGlass, 0, 8.5, 0, ghost);
  mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshBasicMaterial({ color: 0x151412, wireframe: true }),
    0,
    8.5,
    0,
    ghost,
  );
  const ghostLamp = new THREE.PointLight(0xffdcb0, 0, 0, 2);
  ghostLamp.position.y = 8.5;
  ghost.add(ghostLamp);
  ghost.position.set(5.5, STAGE_TOP, 6.5);
  scene.add(ghost);
  const ghostGlow = new THREE.Color(0xffe6c0).multiplyScalar(4);

  // The studio reflection map is tuned for the lacquer; on the room's matte
  // surfaces it reads as ambient fill, so the hall takes only a trace of it.
  hall.traverse((o) => {
    for (const m of [o.material].flat())
      if (m && "envMapIntensity" in m && !m.userData.keepEnv)
        m.envMapIntensity = 0.08;
  });

  // House lights follow the curtain: open is a lit hall, closed a dark one.
  const dimmable = [key, fill, back, wash, wallGlaze, artLight, bounce].map(
    (light) => [light, light.intensity],
  );
  let curtainTarget = 1;
  let curtain = 1;
  let houseLevel = -1;
  function setHouse(level) {
    if (level === houseLevel) return;
    houseLevel = level;
    for (const [light, power] of dimmable) light.intensity = power * level;
    royal.setHouseLights(level);
    // Studio reflections fade with the room, all but a trace. (Materials
    // lit by scene.environment take this, not their own envMapIntensity.)
    scene.environmentIntensity = 0.1 + 0.9 * level;
    ghostLamp.intensity = 28 * (1 - level);
    ghostGlass.color.copy(ghostGlow).multiplyScalar(1 - level);
    ghost.visible = level < 0.999;
  }

  let target = 0;
  let blend = 0;
  function aim() {
    for (const light of [key, fill, back]) {
      light.target.position.copy(focus);
      light.target.updateMatrixWorld();
    }
  }
  aim();

  return {
    group: hall,
    stageTopY: STAGE_TOP,
    /** Keep a point inside the room and above whichever floor lies below. */
    keepInside(v, margin = 1) {
      v.x = THREE.MathUtils.clamp(
        v.x,
        -HALL_HALF_WIDTH + margin,
        HALL_HALF_WIDTH - margin,
      );
      v.z = THREE.MathUtils.clamp(
        v.z,
        STAGE_BACK_Z + margin,
        HALL_BACK_Z - margin,
      );
      const floor = floorY(v.z, v.x);
      v.y = THREE.MathUtils.clamp(
        v.y,
        floor + margin * 0.6,
        CEILING_Y - margin,
      );
      return v;
    },
    /** Seats with a view: eye heights ~1.2 m above each floor. */
    views: {
      frontRow: {
        position: new THREE.Vector3(8.8, stallsY(21, 8.8) + 5.6, 21),
        target: new THREE.Vector3(0, 3.6, 0),
      },
      balcony: {
        position: new THREE.Vector3(-HALL_HALF_WIDTH + 7, 30, 42),
        target: new THREE.Vector3(0, 3.4, 0),
      },
      overview: {
        position: new THREE.Vector3(0, 46, HALL_BACK_Z - 6),
        target: new THREE.Vector3(0, 4, 18),
      },
      // Turned to the rear wall, where the lantern casts its slides.
      projection: {
        position: new THREE.Vector3(0, 30, 38),
        target: new THREE.Vector3(0, 40, HALL_BACK_Z),
      },
    },
    key,
    setExploded(value) {
      target = value ? 1 : 0;
    },
    get curtainOpen() {
      return curtainTarget === 1;
    },
    setCurtainOpen(open) {
      curtainTarget = open ? 1 : 0;
    },
    /** Graphics quality: key-light shadow size (0 = none), the two broad
     *  area lights, the stained glass's wall light and sunbeams: the costliest
     *  parts. */
    setQuality({ shadow, areaLights, glassGlow, sunbeams }) {
      key.castShadow = shadow > 0;
      if (shadow && key.shadow.mapSize.x !== shadow) {
        key.shadow.mapSize.set(shadow, shadow);
        key.shadow.map?.dispose();
        key.shadow.map = null;
      }
      wash.visible = wallGlaze.visible = areaLights;
      royal.setGlow(glassGlow);
      royal.setBeams(sunbeams);
    },
    /** Project the playing song's composer on the rear wall (null: none). */
    showComposer: projection.show,
    rollCredits: projection.rollCredits,
    update(dt) {
      projection.update(dt);
      // Reduced motion arrives as one huge step: hold the glass still then.
      royal.update(dt < 1 ? dt : 0);
      // The traveller takes a few seconds to cross; lights follow it.
      curtain = THREE.MathUtils.clamp(
        curtain + Math.sign(curtainTarget - curtain) * (dt / 3.2),
        0,
        1,
      );
      const eased = curtain * curtain * (3 - 2 * curtain);
      royal.setCurtain(eased);
      setHouse(eased);
      blend = THREE.MathUtils.damp(blend, target, 2.8, dt);
      focus.lerpVectors(normalFocus, explodedFocus, blend);
      aim();
    },
  };
}
