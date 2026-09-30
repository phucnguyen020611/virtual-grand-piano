import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeCanvasTexture } from "../piano/materials.js";

// One scene unit is ~0.21 m (the keyboard is 5.9 units, 1.22 m wide).
const STAGE_TOP = -0.045; // legs and casters sit on this plane
const STAGE_FRONT_Z = 12;
const STAGE_BACK_Z = -26;
const STAGE_RISE = 4.8; // ~1 m above the stalls
const HALL_HALF_WIDTH = 34;
const HALL_BACK_Z = 100;
const CEILING_Y = 72;
const RAKE = 0.1; // stalls rise toward the back

/** Honey maple stage boards with staggered butt joints. */
function stageBoards(maxAniso) {
  const texture = makeCanvasTexture(
    (g, w, h) => {
      const boards = 8;
      const bw = w / boards;
      for (let b = 0; b < boards; b++) {
        const tone = 150 + ((b * 37) % 5) * 9;
        g.fillStyle = `rgb(${tone + 30},${tone - 12},${tone - 62})`;
        g.fillRect(b * bw, 0, bw, h);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(90,52,24,${0.05 + Math.random() * 0.08})`;
          g.fillRect(
            b * bw + Math.random() * bw,
            0,
            1 + Math.random() * 1.5,
            h,
          );
        }
        g.fillStyle = "rgba(40,22,10,.55)";
        g.fillRect(b * bw, 0, 2, h);
        const joint = ((b * 0.37) % 1) * h;
        g.fillRect(b * bw, joint, bw, 2);
      }
    },
    512,
    512,
    maxAniso,
  );
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const stallsY = (z) => STAGE_TOP - STAGE_RISE + (z - STAGE_FRONT_Z) * RAKE;

function panelTexture(maxAniso, { base, line, slats, grain = 0.05 }) {
  const texture = makeCanvasTexture(
    (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(40,22,10,${grain * Math.random()})`;
        g.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h);
      }
      g.fillStyle = line;
      for (let x = 0; x < w; x += w / slats) g.fillRect(x, 0, 3, h);
    },
    512,
    512,
    maxAniso,
  );
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

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
  const cushion = new THREE.BoxGeometry(2.1, 0.45, 1.9);
  cushion.translate(0, 2.1, 0.1);
  const back = new THREE.BoxGeometry(2.1, 2.8, 0.42);
  back.rotateX(-0.16);
  back.translate(0, 3.75, 1.05);
  velvet.push(cushion, back);
  for (const side of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.26, 0.2, 1.9);
    arm.translate(side * 1.18, 3.0, 0.3);
    const post = new THREE.BoxGeometry(0.22, 3.0, 0.22);
    post.translate(side * 1.18, 1.5, 0.9);
    frame.push(arm, post);
  }
  return { velvet: mergeGeometries(velvet), frame: mergeGeometries(frame) };
}

/**
 * A shoebox chamber-music hall around the stage: wooden stage and back wall
 * with an organ, panelled side walls with balconies, acoustic reflectors,
 * raked stalls of velvet seats, and a theatrical lighting rig.
 */
export function createHall(scene, mats) {
  RectAreaLightUniformsLib.init();
  const hall = new THREE.Group();
  hall.name = "concert-hall";
  scene.add(hall);

  const aniso = mats.maxAniso;

  // --- Stage -------------------------------------------------------------------
  const floorTex = stageBoards(aniso);
  floorTex.repeat.set(12, 4);
  const stageDepth = STAGE_FRONT_Z - STAGE_BACK_Z;
  const stage = mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, 0.55, stageDepth),
    new THREE.MeshPhysicalMaterial({
      color: 0x8c6f58, // stained, so the pool of light does the work
      map: floorTex,
      roughness: 0.55,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.3,
    }),
    0,
    STAGE_TOP - 0.275,
    (STAGE_FRONT_Z + STAGE_BACK_Z) / 2,
    hall,
  );
  stage.name = "stage-floor";
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x24170f,
    roughness: 0.6,
  });
  mesh(
    new THREE.BoxGeometry(HALL_HALF_WIDTH * 2, STAGE_RISE, 0.5),
    darkWood,
    0,
    STAGE_TOP - STAGE_RISE / 2,
    STAGE_FRONT_Z + 0.25,
    hall,
  );

  // --- Walls -------------------------------------------------------------------
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: panelTexture(aniso, {
      base: "#5e3521",
      line: "rgba(22,11,5,.6)",
      slats: 16,
    }),
    roughness: 0.62,
  });
  wood.map.repeat.set(20, 3);
  const plaster = new THREE.MeshStandardMaterial({
    color: 0x8a7d6a,
    roughness: 0.9,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0x9a7a45,
    metalness: 0.75,
    roughness: 0.35,
  });
  const wallHeight = CEILING_Y - (STAGE_TOP - STAGE_RISE);
  const wallBase = STAGE_TOP - STAGE_RISE;
  const backWall = mesh(
    new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, wallHeight),
    wood,
    0,
    wallBase + wallHeight / 2,
    STAGE_BACK_Z,
    hall,
  );
  backWall.name = "stage-back-wall";
  const hallLength = HALL_BACK_Z - STAGE_BACK_Z;
  for (const side of [-1, 1]) {
    // Wood dado below, plaster above, pilasters every ~2.5 m.
    const dado = mesh(
      new THREE.PlaneGeometry(hallLength, 22),
      wood,
      side * HALL_HALF_WIDTH,
      wallBase + 11,
      (HALL_BACK_Z + STAGE_BACK_Z) / 2,
      hall,
    );
    dado.rotation.y = -side * (Math.PI / 2);
    const upper = mesh(
      new THREE.PlaneGeometry(hallLength, wallHeight - 22),
      plaster,
      side * HALL_HALF_WIDTH,
      wallBase + 22 + (wallHeight - 22) / 2,
      (HALL_BACK_Z + STAGE_BACK_Z) / 2,
      hall,
    );
    upper.rotation.y = -side * (Math.PI / 2);
    for (let z = STAGE_BACK_Z + 6; z < HALL_BACK_Z; z += 12)
      mesh(
        new THREE.BoxGeometry(1.2, wallHeight - 22, 2.2),
        plaster,
        side * (HALL_HALF_WIDTH - 0.6),
        wallBase + 22 + (wallHeight - 22) / 2,
        z,
        hall,
      );
    // Side balcony with a gilded parapet.
    const balconyZ0 = 16;
    const balconyLength = HALL_BACK_Z - balconyZ0;
    mesh(
      new THREE.BoxGeometry(6, 1, balconyLength),
      darkWood,
      side * (HALL_HALF_WIDTH - 3),
      24,
      balconyZ0 + balconyLength / 2,
      hall,
    );
    mesh(
      new THREE.BoxGeometry(0.4, 3.2, balconyLength),
      wood,
      side * (HALL_HALF_WIDTH - 6),
      26.1,
      balconyZ0 + balconyLength / 2,
      hall,
    );
    mesh(
      new THREE.BoxGeometry(0.6, 0.3, balconyLength),
      gold,
      side * (HALL_HALF_WIDTH - 6),
      27.8,
      balconyZ0 + balconyLength / 2,
      hall,
    );
  }
  const rear = mesh(
    new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, wallHeight),
    wood,
    0,
    wallBase + wallHeight / 2,
    HALL_BACK_Z,
    hall,
  );
  rear.rotation.y = Math.PI;
  const ceiling = mesh(
    new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, hallLength),
    new THREE.MeshStandardMaterial({ color: 0x3a2e25, roughness: 0.9 }),
    0,
    CEILING_Y,
    (HALL_BACK_Z + STAGE_BACK_Z) / 2,
    hall,
  );
  ceiling.rotation.x = Math.PI / 2;

  // Acoustic reflector "clouds" over the stage.
  const reflector = new THREE.MeshStandardMaterial({
    color: 0xd8cfbf,
    roughness: 0.7,
  });
  [
    [-16, -14, 0.12],
    [0, -12, 0.08],
    [16, -14, -0.12],
    [-10, 2, 0.1],
    [10, 2, -0.1],
  ].forEach(([x, z, tilt]) => {
    const cloud = mesh(
      new THREE.BoxGeometry(13, 0.5, 9),
      reflector,
      x,
      50,
      z,
      hall,
    );
    cloud.rotation.set(0.18, 0, tilt);
  });

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
    new THREE.MeshStandardMaterial({
      color: 0xcfc8bb,
      metalness: 0.92,
      roughness: 0.28,
    }),
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
    new THREE.MeshStandardMaterial({ color: 0x4a1a1e, roughness: 1 }),
    0,
    (stallsY(STAGE_FRONT_Z) + stallsY(HALL_BACK_Z)) / 2,
    STAGE_FRONT_Z + rakeLength / 2,
    hall,
  );
  stalls.rotation.x = -Math.PI / 2 - Math.atan(RAKE);

  const { velvet, frame } = seatGeometries();
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
    velvet,
    new THREE.MeshPhysicalMaterial({
      color: 0x6e1420,
      roughness: 0.85,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: 0xd0485a,
    }),
    seats.length,
  );
  const frameSeats = new THREE.InstancedMesh(frame, darkWood, seats.length);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  seats.forEach(([x, y, z, yaw], i) => {
    matrix.compose(pos.set(x, y, z), q.setFromAxisAngle(up, yaw), one);
    velvetSeats.setMatrixAt(i, matrix);
    frameSeats.setMatrixAt(i, matrix);
  });
  hall.add(velvetSeats, frameSeats);

  // --- Lighting rig ------------------------------------------------------------------
  const normalFocus = new THREE.Vector3(0, 1.2, -0.35);
  const explodedFocus = new THREE.Vector3(0, 4.35, -0.65);
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

  // House lights down: the room falls into a dim, hazy dusk around the spot.
  scene.add(new THREE.HemisphereLight(0x9a8672, 0x2a1c14, 0.1));
  const houseGlow = new THREE.PointLight(0xffd7a8, 6, 0, 1.4);
  houseGlow.position.set(0, 36, 55);
  scene.add(houseGlow);

  // Parapet lamps along both balconies.
  const lampPositions = [];
  for (const side of [-1, 1])
    for (let z = 20; z < HALL_BACK_Z; z += 8)
      lampPositions.push([side * (HALL_HALF_WIDTH - 6), 28.4, z]);
  const lamps = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 10, 8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd9a0).multiplyScalar(2.2),
      toneMapped: false,
    }),
    lampPositions.length,
  );
  lampPositions.forEach(([x, y, z], i) => {
    matrix.makeTranslation(x, y, z);
    lamps.setMatrixAt(i, matrix);
  });
  hall.add(lamps);

  // The studio reflection map is tuned for the lacquer; on the room's matte
  // surfaces it reads as ambient fill, so the hall takes only a trace of it.
  hall.traverse((o) => {
    for (const m of [o.material].flat())
      if (m && "envMapIntensity" in m) m.envMapIntensity = 0.08;
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
