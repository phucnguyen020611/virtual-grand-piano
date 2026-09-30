import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cofferSet, repeatSet } from "./surfaces.js";

/**
 * A European court-style interior after the Vienna Musikverein's Golden Hall:
 * gilded columns and cornices, arched niches, a coffered ceiling, gilded
 * balustrades, crimson drapes, and crystal chandeliers, wall sconces and
 * balcony globes whose every bulb is lit.
 */

const UP = new THREE.Vector3(0, 1, 0);
const matrix = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

function instanced(geometry, material, transforms, parent) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach(([x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1], i) => {
    matrix.compose(
      p.set(x, y, z),
      q.setFromAxisAngle(UP, yaw),
      s.set(sx, sy, sz),
    );
    mesh.setMatrixAt(i, matrix);
  });
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Soft round glow sprite shared by every lamp halo. */
function haloTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - r) ** 1.7;
      data.set([255, 255, 255, a * 255], (y * size + x) * 4);
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export function buildRoyalInterior(hall, scene, room) {
  const {
    halfWidth,
    stageFrontZ,
    stageBackZ,
    backZ,
    ceilingY,
    floorY,
    balconyY,
    aniso,
    velvet,
  } = room;
  const keepEnv = (m, intensity) => {
    m.envMapIntensity = intensity;
    m.userData.keepEnv = true;
    return m;
  };
  const gilt = keepEnv(
    new THREE.MeshStandardMaterial({
      color: 0xcfa24e,
      metalness: 1,
      roughness: 0.3,
    }),
    0.9,
  );
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xe6d9bd,
    roughness: 0.75,
  });
  const bulbGlow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffe2b0).multiplyScalar(3),
    toneMapped: false,
  });
  const bulbs = []; // every lamp's position, for bulbs and halos
  const length = backZ - stageBackZ;
  const midZ = (backZ + stageBackZ) / 2;

  // --- Gilded columns with bases and capitals, set into both side walls ---------
  const columnZ = [];
  for (let z = stageBackZ + 6; z < backZ - 2; z += 12) columnZ.push(z);
  const shaftH = ceilingY - 8 - (balconyY + 1);
  const shaftY = balconyY + 1 + shaftH / 2;
  const columns = columnZ.flatMap((z) =>
    [-1, 1].map((side) => [side * (halfWidth - 0.55), z]),
  );
  instanced(
    new THREE.CylinderGeometry(0.75, 0.85, shaftH, 20),
    gilt,
    columns.map(([x, z]) => [x, shaftY, z]),
    hall,
  );
  const capital = mergeGeometries([
    new THREE.BoxGeometry(2.2, 0.5, 2.2).translate(0, 0.25, 0),
    new THREE.CylinderGeometry(1.05, 0.8, 1, 20).translate(0, -0.5, 0),
  ]);
  instanced(
    capital,
    gilt,
    columns.map(([x, z]) => [x, shaftY + shaftH / 2, z]),
    hall,
  );
  const base = mergeGeometries([
    new THREE.BoxGeometry(2.1, 0.6, 2.1).translate(0, -0.3, 0),
    new THREE.CylinderGeometry(0.85, 1.05, 0.6, 20).translate(0, 0.3, 0),
  ]);
  instanced(
    base,
    gilt,
    columns.map(([x, z]) => [x, balconyY + 1.6, z]),
    hall,
  );

  // --- Cornices: balcony string course and the entablature under the ceiling ---
  const band = (y, h, d, material) => {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, length), material);
      m.position.set(side * (halfWidth - d / 2), y, midZ);
      hall.add(m);
    }
    for (const z of [stageBackZ + d / 2, backZ - d / 2]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(halfWidth * 2, h, d),
        material,
      );
      m.position.set(0, y, z);
      hall.add(m);
    }
  };
  band(ceilingY - 7.5, 1.1, 1.6, gilt);
  band(ceilingY - 5.8, 2.4, 1.1, ivory);
  band(ceilingY - 4.2, 0.5, 1.8, gilt);
  band(balconyY - 0.9, 0.35, 0.9, gilt);

  // --- Arched niches between the columns (night-dark glazing, gilt frames) -------
  const archW = 5;
  const archH = 16;
  const arch = new THREE.Shape();
  arch.moveTo(-archW / 2, 0);
  arch.lineTo(archW / 2, 0);
  arch.lineTo(archW / 2, archH - archW / 2);
  arch.absarc(0, archH - archW / 2, archW / 2, 0, Math.PI, false);
  arch.lineTo(-archW / 2, 0);
  const frameShape = new THREE.Shape(
    arch
      .getPoints(24)
      .map((v) =>
        v.clone().multiplyScalar(1.12).add(new THREE.Vector2(0, -0.6)),
      ),
  );
  frameShape.holes.push(new THREE.Path(arch.getPoints(24)));
  const niches = [];
  for (let i = 0; i < columnZ.length - 1; i++)
    for (const side of [-1, 1])
      niches.push([
        side * (halfWidth - 0.08),
        balconyY + 9,
        (columnZ[i] + columnZ[i + 1]) / 2,
        -side * (Math.PI / 2),
      ]);
  instanced(
    new THREE.ShapeGeometry(arch, 24),
    new THREE.MeshStandardMaterial({
      color: 0x141a2a,
      roughness: 0.15,
      metalness: 0.2,
    }),
    niches,
    hall,
  );
  instanced(
    new THREE.ExtrudeGeometry(frameShape, { depth: 0.3, bevelEnabled: false }),
    gilt,
    niches,
    hall,
  );

  // --- Coffered ceiling: a painted field under a grid of deep ribs --------------
  const coffers = cofferSet(aniso);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 2, length),
    keepEnv(
      new THREE.MeshStandardMaterial({
        ...repeatSet(coffers, 8, 14),
        roughness: 1,
      }),
      0.4,
    ),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilingY - 0.02, midZ);
  hall.add(ceiling);
  const ribs = [];
  for (let i = 0; i <= 8; i++)
    ribs.push(
      new THREE.BoxGeometry(0.9, 1.2, length).translate(
        -halfWidth + (i * halfWidth * 2) / 8,
        ceilingY - 0.6,
        midZ,
      ),
    );
  for (let i = 0; i <= 14; i++)
    ribs.push(
      new THREE.BoxGeometry(halfWidth * 2, 1.2, 0.9).translate(
        0,
        ceilingY - 0.6,
        stageBackZ + (i * length) / 14,
      ),
    );
  hall.add(new THREE.Mesh(mergeGeometries(ribs), ivory));

  // --- Gilded balustrades on both balconies -----------------------------------------
  const baluster = new THREE.LatheGeometry(
    [
      [0.28, 0],
      [0.28, 0.25],
      [0.16, 0.45],
      [0.32, 1.1],
      [0.14, 1.9],
      [0.24, 2.2],
      [0.3, 2.4],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    10,
  );
  const balconyZ0 = 16;
  const balusters = [];
  const railX = halfWidth - 6;
  for (const side of [-1, 1])
    for (let z = balconyZ0 + 0.5; z < backZ - 0.5; z += 0.85)
      balusters.push([side * railX, balconyY + 0.5, z]);
  instanced(baluster, gilt, balusters, hall);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, backZ - balconyZ0),
      gilt,
    );
    rail.position.set(side * railX, balconyY + 3, (backZ + balconyZ0) / 2);
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, backZ - balconyZ0),
      new THREE.MeshPhysicalMaterial({
        ...repeatSet(velvet, 1, 60),
        roughness: 1,
        sheen: 1,
        sheenColor: 0xe0707e,
      }),
    );
    cushion.position.set(
      side * railX,
      balconyY + 3.25,
      (backZ + balconyZ0) / 2,
    );
    hall.add(rail, cushion);
    // Glass globes on gilt stems along the rail.
    for (let z = balconyZ0 + 4; z < backZ - 2; z += 8)
      bulbs.push([side * railX, balconyY + 4.4, z, 0.42]);
  }
  instanced(
    new THREE.CylinderGeometry(0.07, 0.12, 0.9, 8),
    gilt,
    bulbs.map(([x, y, z]) => [x, y - 0.7, z]),
    hall,
  );

  // --- Crimson drapes framing the stage ------------------------------------------------
  const drapeFloor = floorY(stageFrontZ - 1);
  const drape = new THREE.PlaneGeometry(9, ceilingY - 6 - drapeFloor, 60, 1);
  const pos = drape.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // Deep, irregular folds gathered toward the stage edge.
    pos.setZ(i, Math.sin(x * 2.4) * 0.45 + Math.sin(x * 5.3 + 1) * 0.12);
  }
  drape.computeVertexNormals();
  const drapeMat = new THREE.MeshPhysicalMaterial({
    ...repeatSet(velvet, 3, 20),
    color: 0xd06070,
    roughness: 1,
    sheen: 1,
    sheenRoughness: 0.35,
    sheenColor: 0xff8090,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(drape, drapeMat);
    m.position.set(
      side * (halfWidth - 5.2),
      (ceilingY - 6 + drapeFloor) / 2,
      stageFrontZ - 0.6,
    );
    hall.add(m);
  }
  const pelmet = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2 - 2, 3, 0.6),
    gilt,
  );
  pelmet.position.set(0, ceilingY - 9.5, stageFrontZ - 0.9);
  hall.add(pelmet);

  // --- House curtain: two velvet panels that travel in from the wings -----------
  // Each panel hangs from its outer edge; drawing it open gathers the folds.
  const curtainReach = halfWidth - 7; // outer edge, tucked behind the drapes
  const curtainH = ceilingY - 9 - drapeFloor;
  const panel = new THREE.PlaneGeometry(curtainReach + 0.6, curtainH, 160, 1);
  panel.translate(-(curtainReach + 0.6) / 2, curtainH / 2, 0);
  const panelPos = panel.attributes.position;
  for (let i = 0; i < panelPos.count; i++) {
    const x = panelPos.getX(i);
    panelPos.setZ(i, Math.sin(x * 2.2) * 0.5 + Math.sin(x * 4.9 + 1) * 0.1);
  }
  panel.computeVertexNormals();
  const curtain = [-1, 1].map((side) => {
    const m = new THREE.Mesh(panel, drapeMat);
    m.name = "house-curtain";
    m.position.set(
      side * curtainReach,
      drapeFloor,
      stageFrontZ - 1.8 + side * 0.65,
    );
    m.userData.side = side;
    hall.add(m);
    return m;
  });

  // --- Crystal chandeliers over the stalls ----------------------------------------------
  const crystal = keepEnv(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.04,
      emissive: 0xffe0b8,
      emissiveIntensity: 0.35,
    }),
    1.6,
  );
  const chandelierZ = [22, 38, 54, 70, 86];
  const hangY = ceilingY - 14;
  const frame = [];
  const drops = [];
  const lights = [];
  for (const z of chandelierZ) {
    frame.push(
      new THREE.CylinderGeometry(0.1, 0.1, ceilingY - hangY, 8).translate(
        0,
        (ceilingY + hangY) / 2,
        z,
      ),
      new THREE.LatheGeometry(
        [
          [0, -1.8],
          [0.5, -1.4],
          [0.9, -0.6],
          [0.6, 0],
          [0.35, 1],
          [0.2, 2.4],
          [0, 2.6],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        16,
      ).translate(0, hangY, z),
      new THREE.TorusGeometry(3.2, 0.1, 8, 48)
        .rotateX(Math.PI / 2)
        .translate(0, hangY - 0.6, z),
      new THREE.TorusGeometry(2, 0.08, 8, 40)
        .rotateX(Math.PI / 2)
        .translate(0, hangY + 1.3, z),
    );
    for (const [radius, y, count] of [
      [3.2, hangY - 0.6, 16],
      [2, hangY + 1.3, 10],
    ])
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const bz = z + Math.sin(a) * radius;
        bulbs.push([x, y + 0.55, bz, 0.22]);
        frame.push(
          new THREE.CylinderGeometry(0.12, 0.09, 0.4, 8).translate(
            x,
            y + 0.2,
            bz,
          ),
        );
        // A short strand of prisms under every candle.
        for (let k = 0; k < 3; k++)
          drops.push([x, y - 0.35 - k * 0.42, bz, a, 1, 1.4, 1]);
      }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      drops.push([
        Math.cos(a) * 0.7,
        hangY - 2.4 - (k % 3) * 0.5,
        z + Math.sin(a) * 0.7,
        a,
        1.3,
        2,
        1.3,
      ]);
    }
    const light = new THREE.PointLight(0xffd6a2, 130, 0, 2);
    light.position.set(0, hangY, z);
    lights.push(light);
  }
  hall.add(new THREE.Mesh(mergeGeometries(frame), gilt));
  instanced(new THREE.OctahedronGeometry(0.16, 0), crystal, drops, hall);
  scene.add(...lights);

  // --- Two-branch wall sconces below the balconies -----------------------------------
  const sconce = [];
  for (let i = 0; i < columnZ.length - 1; i++)
    for (const side of [-1, 1]) {
      const x = side * (halfWidth - 0.35);
      const z = (columnZ[i] + columnZ[i + 1]) / 2;
      const y = floorY(z) + 12;
      sconce.push([x, y, z]);
      for (const dz of [-0.9, 0.9])
        bulbs.push([x - side * 0.9, y + 1.3, z + dz, 0.24]);
    }
  const sconceGeometry = mergeGeometries([
    new THREE.BoxGeometry(0.5, 1.6, 0.8),
    new THREE.BoxGeometry(1.6, 0.14, 0.14).translate(0, 0.6, -0.9),
    new THREE.BoxGeometry(1.6, 0.14, 0.14).translate(0, 0.6, 0.9),
    new THREE.CylinderGeometry(0.16, 0.12, 0.6, 8).translate(0.9, 0.95, -0.9),
    new THREE.CylinderGeometry(0.16, 0.12, 0.6, 8).translate(0.9, 0.95, 0.9),
  ]);
  // Arms point into the room from each wall.
  instanced(
    sconceGeometry,
    gilt,
    sconce.map(([x, y, z]) => [x, y, z, x > 0 ? Math.PI : 0]),
    hall,
  );

  // --- Every bulb lit: an emissive flame plus a halo, two draw calls in all -------
  instanced(
    new THREE.SphereGeometry(1, 10, 8).scale(1, 1.5, 1),
    bulbGlow,
    bulbs.map(([x, y, z, r]) => [x, y, z, 0, r, r, r]),
    hall,
  );
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      bulbs.flatMap(([x, y, z]) => [x, y, z]),
      3,
    ),
  );
  const halos = new THREE.Points(
    haloGeometry,
    new THREE.PointsMaterial({
      map: haloTexture(),
      color: new THREE.Color(0xffc98a).multiplyScalar(1.4),
      size: 5,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  halos.renderOrder = 4;
  hall.add(halos);

  const litBulb = bulbGlow.color.clone();
  const coldBulb = new THREE.Color(0x2a2520); // unlit glass
  const lightPower = lights.map((light) => light.intensity);
  return {
    gilt,
    lights,
    bulbCount: bulbs.length,
    /** 0 = curtain closed across the stage, 1 = drawn open into the wings. */
    setCurtain(open) {
      for (const m of curtain) m.scale.x = m.userData.side * (1 - 0.9 * open);
    },
    /** Dim every lamp in the room: 0 = dark, 1 = full house. */
    setHouseLights(level) {
      lights.forEach((light, i) => (light.intensity = lightPower[i] * level));
      bulbGlow.color.lerpColors(coldBulb, litBulb, level);
      halos.material.opacity = level;
      crystal.emissiveIntensity = 0.35 * level;
    },
  };
}
