import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { onStage } from "../piano/geometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  damaskSet,
  plasterSet,
  repeatSet,
  stageBoardSet,
  velvetSet,
} from "./surfaces.js";
import { buildRoyalInterior } from "./royalDecor.js";

// One scene unit is ~0.21 m (the keyboard is 5.9 units, 1.22 m wide).
const STAGE_TOP = -0.045; // legs and casters sit on this plane
const STAGE_FRONT_Z = 12;
const STAGE_BACK_Z = -26;
const STAGE_RISE = 4.8; // ~1 m above the stalls
const HALL_HALF_WIDTH = 34;
const HALL_BACK_Z = 100;
const CEILING_Y = 72;
const RAKE = 0.1; // stalls rise toward the back

const stallsY = (z) => STAGE_TOP - STAGE_RISE + (z - STAGE_FRONT_Z) * RAKE;
const floorY = (z) => (z < STAGE_FRONT_Z ? STAGE_TOP : stallsY(z));
const BALCONY_Y = 24;

function mesh(geometry, material, x, y, z, parent) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
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
  const stage = mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, 0.55, stageDepth),
    new THREE.MeshPhysicalMaterial({
      ...repeatSet(boards, (HALL_HALF_WIDTH * 2) / 5, stageDepth / 19),
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
  });
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
    [-15, 11, 20],
    [0, 15, 30],
    [15, 11, 20],
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
    matrix.makeScale(1, height, 1).setPosition(x, 16, STAGE_BACK_Z + 1.2);
    pipeMesh.setMatrixAt(i, matrix);
  });
  hall.add(pipeMesh);
  mesh(
    new THREE.BoxGeometry(46, 3, 3),
    darkWood,
    0,
    14.5,
    STAGE_BACK_Z + 1.5,
    hall,
  );

  // --- Stalls ------------------------------------------------------------------------
  const rakeLength = HALL_BACK_Z - STAGE_FRONT_Z;
  const stalls = mesh(
    new THREE.PlaneGeometry(
      HALL_HALF_WIDTH * 2,
      Math.hypot(rakeLength, rakeLength * RAKE),
    ),
    // Low-pile carpet: the velvet weave, tighter and darker.
    new THREE.MeshStandardMaterial({
      ...repeatSet(velvet, 120, 160),
      color: 0x5a4040,
      roughness: 1,
    }),
    0,
    (stallsY(STAGE_FRONT_Z) + stallsY(HALL_BACK_Z)) / 2,
    STAGE_FRONT_Z + rakeLength / 2,
    hall,
  );
  stalls.rotation.x = -Math.PI / 2 - Math.atan(RAKE);

  const { velvet: seatShape, frame } = seatGeometries();
  const seats = [];
  for (let row = 0; row < 17; row++) {
    const rowZ = STAGE_FRONT_Z + 6 + row * 4.6;
    for (let x = 3.9; x < 27; x += 2.55)
      for (const side of [-1, 1]) {
        const sx = side * x;
        // Gently curved rows, each seat turned toward the piano.
        const z = rowZ + (sx * sx) / 160;
        seats.push([sx, stallsY(z), z, Math.atan2(sx, z)]);
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
  scene.add(wash, wallGlaze);

  // House lights: the chandeliers (royalDecor) carry the room; this is only
  // the faint bounce from the gilt and the damask.
  scene.add(new THREE.HemisphereLight(0x9a8672, 0x2a1c14, 0.1));

  // The studio reflection map is tuned for the lacquer; on the room's matte
  // surfaces it reads as ambient fill, so the hall takes only a trace of it.
  hall.traverse((o) => {
    for (const m of [o.material].flat())
      if (m && "envMapIntensity" in m && !m.userData.keepEnv)
        m.envMapIntensity = 0.08;
  });

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
      const floor = floorY(v.z);
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
        position: new THREE.Vector3(3, stallsY(20) + 5.6, 20),
        target: new THREE.Vector3(0, 2.2, 0),
      },
      balcony: {
        position: new THREE.Vector3(-HALL_HALF_WIDTH + 7, 30, 42),
        target: new THREE.Vector3(0, 2, 0),
      },
      overview: {
        position: new THREE.Vector3(0, 46, HALL_BACK_Z - 6),
        target: new THREE.Vector3(0, 4, 18),
      },
    },
    key,
    setExploded(value) {
      target = value ? 1 : 0;
    },
    update(dt) {
      blend = THREE.MathUtils.damp(blend, target, 2.8, dt);
      focus.lerpVectors(normalFocus, explodedFocus, blend);
      aim();
    },
  };
}
