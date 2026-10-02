import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cofferSet, repeatSet } from "./surfaces.js";
import { buildStainedGlass } from "./stainedGlass.js";

/**
 * A European court-style interior after the Vienna Musikverein's Golden Hall:
 * gilded columns and cornices, stained-glass lancets between portraits of the
 * great composers, a coffered ceiling, gilded balustrades, crimson drapes, and
 * crystal chandeliers, wall sconces and balcony globes whose every bulb is lit.
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

/** Great composers along the side walls, stage end first: left, then right. */
export const COMPOSERS = [
  ["bach", "Johann Sebastian Bach", "1685 – 1750"],
  ["haydn", "Joseph Haydn", "1732 – 1809"],
  ["mozart", "Wolfgang Amadeus Mozart", "1756 – 1791"],
  ["beethoven", "Ludwig van Beethoven", "1770 – 1827"],
  ["schubert", "Franz Schubert", "1797 – 1828"],
  ["chopin", "Frédéric Chopin", "1810 – 1849"],
  ["liszt", "Franz Liszt", "1811 – 1886"],
  ["debussy", "Claude Debussy", "1862 – 1918"],
];

const SCRIPT = '"Pinyon Script", "Cormorant Garamond", Georgia, cursive';
const SERIF = '"Cormorant Garamond", Georgia, serif';

/** An ebony nameplate: the composer's name in glowing gilt script. */
function plaqueTexture(name, dates, aniso) {
  const [w, h] = [1024, 300];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  const gilt = g.createLinearGradient(0, 40, 0, h - 40);
  gilt.addColorStop(0, "#fff1c4");
  gilt.addColorStop(0.5, "#f0c66a");
  gilt.addColorStop(1, "#b98a3a");
  const draw = () => {
    g.clearRect(0, 0, w, h);
    const ebony = g.createLinearGradient(0, 0, 0, h);
    ebony.addColorStop(0, "#1d150e");
    ebony.addColorStop(1, "#0c0806");
    g.fillStyle = ebony;
    g.fillRect(0, 0, w, h);
    // A double gilt rule with a dot at each corner.
    g.strokeStyle = "#c99a45";
    g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.lineWidth = 2;
    g.strokeRect(30, 30, w - 60, h - 60);
    g.fillStyle = "#e9c46f";
    for (const [x, y] of [
      [30, 30],
      [w - 30, 30],
      [30, h - 30],
      [w - 30, h - 30],
    ]) {
      g.beginPath();
      g.arc(x, y, 7, 0, 2 * Math.PI);
      g.fill();
    }
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    // The name, twice over a gold blur: the glow, then the crisp letters.
    g.font = `400 ${name.length > 18 ? 104 : 118}px ${SCRIPT}`;
    g.shadowColor = "rgba(255, 200, 110, 0.95)";
    for (const blur of [34, 12]) {
      g.shadowBlur = blur;
      g.fillStyle = gilt;
      g.fillText(name, w / 2, 172, w - 120);
    }
    g.shadowBlur = 10;
    g.font = `600 34px ${SERIF}`;
    g.letterSpacing = "6px";
    g.fillStyle = "#e9c46f";
    g.fillText(`— ${dates.replace(" – ", " · ")} —`, w / 2, 242);
    g.letterSpacing = "0px";
    g.shadowBlur = 0;
    texture.needsUpdate = true;
  };
  draw();
  // Redraw once the script and serif faces have arrived.
  document.fonts
    ?.load(`118px ${SCRIPT}`)
    .then(() => document.fonts.load(`600 34px ${SERIF}`))
    .then(draw);
  return texture;
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
    landing, // the stairs' head at the back of each balcony
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
  // Frosted opal glass round a lit filament: a hot core where the lamp shows
  // through, warming to amber at the rim, so each globe reads round.
  const bulbGlow = new THREE.ShaderMaterial({
    uniforms: { level: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * mat3(instanceMatrix) * normal;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float level;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        vec3 lit = mix(vec3(0.62, 0.3, 0.1), vec3(1.0, 0.86, 0.62) * 1.15, pow(facing, 1.3))
          + vec3(1.0, 0.92, 0.75) * pow(facing, 16.0) * 0.9;
        vec3 cold = vec3(0.17, 0.15, 0.13) * (0.45 + 0.55 * facing);
        gl_FragColor = vec4(mix(cold, lit, level), 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
  // Every lamp's [x, y, z, radius, round]: candle flames unless round.
  const bulbs = [];
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
    columns.map(([x, z]) => [x, balconyY + 1.1, z]),
    hall,
  );
  // A ledge along the dado's top for the bases to stand on; under the
  // balconies it disappears into the deck.
  for (const side of [-1, 1]) {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, length), gilt);
    ledge.position.set(side * (halfWidth - 0.9), balconyY + 0.25, midZ);
    hall.add(ledge);
  }

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

  // --- Between the columns: lit stained-glass lancets alternate with the
  // great composers' portraits in gilt frames --------------------------------------
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
  const windows = [];
  const portraits = [];
  for (let i = 0; i < columnZ.length - 1; i++)
    for (const side of [-1, 1]) {
      const bay = [
        side * (halfWidth - 0.08),
        balconyY + 9,
        (columnZ[i] + columnZ[i + 1]) / 2,
        -side * (Math.PI / 2),
      ];
      if (i % 2) portraits.push([...bay, side]);
      else windows.push(bay);
    }
  const glass = buildStainedGlass(hall, windows, arch, room.glowWall);
  instanced(
    new THREE.ExtrudeGeometry(frameShape, { depth: 0.3, bevelEnabled: false }),
    gilt,
    windows,
    hall,
  );

  // Portraits: 6 × 7.5 canvases (4:5) in moulded gilt frames, with nameplates.
  const [pw, ph, rail] = [6, 7.5, 0.7];
  const outer = new THREE.Shape();
  outer.moveTo(-pw / 2 - rail, -ph / 2 - rail);
  outer.lineTo(pw / 2 + rail, -ph / 2 - rail);
  outer.lineTo(pw / 2 + rail, ph / 2 + rail);
  outer.lineTo(-pw / 2 - rail, ph / 2 + rail);
  const opening = new THREE.Path();
  opening.moveTo(-pw / 2, -ph / 2);
  opening.lineTo(-pw / 2, ph / 2);
  opening.lineTo(pw / 2, ph / 2);
  opening.lineTo(pw / 2, -ph / 2);
  outer.holes.push(opening);
  const portraitFrame = new THREE.ExtrudeGeometry(outer, {
    depth: 0.3,
    bevelThickness: 0.15,
    bevelSize: 0.18,
    bevelSegments: 3,
  });
  const canvasGeometry = new THREE.PlaneGeometry(pw, ph);
  const plaqueGeometry = new THREE.PlaneGeometry(6.4, 1.875); // 1024 × 300
  const loader = new THREE.TextureLoader();
  // Each wall takes its four sitters in order from the stage end.
  const sitters = { [-1]: COMPOSERS.slice(0, 4), 1: COMPOSERS.slice(4) };
  const paintings = [];
  const portraitMaps = {}; // sitter's name → their portrait
  const plates = [];
  for (const [x, y, z, yaw, side] of portraits) {
    const [file, name, dates] = sitters[side].shift();
    const piece = new THREE.Group();
    piece.position.set(x, y + 7.5, z);
    piece.rotation.y = yaw;
    hall.add(piece);
    piece.add(new THREE.Mesh(portraitFrame, gilt));
    const map = loader.load(
      `${import.meta.env.BASE_URL}art/composers/${file}.jpg`,
    );
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = aniso;
    portraitMaps[name] = map;
    // A faint glow of its own, as if under a picture light.
    const paint = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      roughness: 0.75,
    });
    paintings.push(paint);
    const canvas = new THREE.Mesh(canvasGeometry, paint);
    canvas.position.z = 0.12;
    canvas.name = `portrait-${file}`;
    piece.add(canvas);
    // Its own light, like the portrait: the gilt script glows on the ebony.
    const plaqueMap = plaqueTexture(name, dates, aniso);
    const plate = new THREE.MeshStandardMaterial({
      map: plaqueMap,
      emissiveMap: plaqueMap,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      roughness: 0.45,
      metalness: 0.2,
    });
    plates.push(plate);
    const plaque = new THREE.Mesh(plaqueGeometry, plate);
    plaque.position.set(0, -ph / 2 - rail - 1.2, 0.08);
    piece.add(plaque);
  }

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
  const railVelvet = new THREE.MeshPhysicalMaterial({
    ...repeatSet(velvet, 1, 60),
    roughness: 1,
    sheen: 1,
    sheenColor: 0xe0707e,
  });
  // A gilt rail with its velvet cushion, from (x0, z0) to (x1, z1).
  const railRun = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    for (const [size, h, y, material] of [
      [0.7, 0.3, 3, gilt],
      [0.62, 0.22, 3.25, railVelvet],
    ]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w || size, h, d || size),
        material,
      );
      m.position.set((x0 + x1) / 2, balconyY + y, (z0 + z1) / 2);
      hall.add(m);
    }
  };
  const endZ = balconyZ0 + 0.5;
  const headZ = backZ - landing; // the rail stops for the stairs
  for (const side of [-1, 1]) {
    for (let z = endZ; z < headZ; z += 0.85)
      balusters.push([side * railX, balconyY + 0.5, z]);
    // Close the balcony's open end back to the wall.
    for (let x = railX + 0.85; x < halfWidth - 0.3; x += 0.85)
      balusters.push([side * x, balconyY + 0.5, endZ]);
    railRun(side * railX, balconyZ0, side * railX, headZ);
    railRun(side * (railX - 0.35), endZ, side * halfWidth, endZ);
    // Opal globes on turned brass lamp posts along the rail.
    for (let z = balconyZ0 + 4; z < headZ - 1; z += 8)
      bulbs.push([side * railX, balconyY + 4.75, z, 0.4, true]);
  }
  instanced(baluster, gilt, balusters, hall);
  instanced(
    new THREE.LatheGeometry(
      [
        [0.24, 0],
        [0.24, 0.08],
        [0.1, 0.16],
        [0.07, 0.4],
        [0.13, 0.55],
        [0.06, 0.7],
        [0.06, 0.85],
        // The gallery cup the globe sits in.
        [0.2, 0.92],
        [0.24, 1.05],
        [0.2, 1.06],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    ),
    gilt,
    bulbs.map(([x, , z]) => [x, balconyY + 3.36, z]),
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
  const sleeves = []; // ivory candle sleeves under every flame
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
        bulbs.push([x, y + 1.25, bz, 0.2]);
        sleeves.push([x, y + 0.7, bz]);
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

  // --- Two-branch candle sconces below the balconies ---------------------------------
  // A cast shield on the wall; two scrolled arms curl out and up to drip pans,
  // each holding a candle sleeve and its flame.
  const sconce = [];
  for (let i = 0; i < columnZ.length - 1; i++)
    for (const side of [-1, 1]) {
      const z = (columnZ[i] + columnZ[i + 1]) / 2;
      if (room.doorBays?.includes(z)) continue; // a doorway stands there
      const x = side * halfWidth;
      const y = floorY(z) + 12;
      sconce.push([x, y, z]);
      for (const dz of [-0.95, 0.95]) {
        bulbs.push([x - side * 1.1, y + 1.55, z + dz, 0.22]);
        sleeves.push([x - side * 1.1, y + 1.05, z + dz]);
      }
    }
  const sconceParts = [
    new THREE.SphereGeometry(1, 16, 12).scale(0.12, 0.85, 0.42),
    new THREE.SphereGeometry(0.16, 12, 8).translate(0.12, -0.95, 0),
  ];
  for (const dz of [-0.95, 0.95])
    sconceParts.push(
      new THREE.TubeGeometry(
        new THREE.CubicBezierCurve3(
          new THREE.Vector3(0.1, 0.1, 0),
          new THREE.Vector3(0.9, -0.5, dz * 0.2),
          new THREE.Vector3(1.2, 0.1, dz),
          new THREE.Vector3(1.1, 0.68, dz),
        ),
        16,
        0.06,
        6,
      ),
      new THREE.LatheGeometry(
        [
          [0.05, 0],
          [0.2, 0.08],
          [0.24, 0.14],
          [0.1, 0.12],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        14,
      ).translate(1.1, 0.66, dz),
    );
  // Arms point into the room from each wall.
  instanced(
    mergeGeometries(sconceParts.map((g) => (g.index ? g.toNonIndexed() : g))),
    gilt,
    sconce.map(([x, y, z]) => [x, y, z, x > 0 ? Math.PI : 0]),
    hall,
  );
  instanced(
    new THREE.CylinderGeometry(0.075, 0.08, 0.6, 10),
    ivory,
    sleeves,
    hall,
  );

  // --- Every bulb lit: an emissive flame plus a halo, two draw calls in all -------
  instanced(
    new THREE.SphereGeometry(1, 16, 12).scale(1, 1.5, 1),
    bulbGlow,
    bulbs.map(([x, y, z, r, round]) => [x, y, z, 0, r, round ? r / 1.5 : r, r]),
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

  const lightPower = lights.map((light) => light.intensity);
  return {
    gilt,
    portraitMaps,
    lights,
    bulbCount: bulbs.length,
    /** 0 = curtain closed across the stage, 1 = drawn open into the wings. */
    setCurtain(open) {
      for (const m of curtain) m.scale.x = m.userData.side * (1 - 0.9 * open);
    },
    /** Animate the stained glass. */
    update: glass.update,
    setGlow: glass.setGlow,
    setBeams: glass.setBeams,
    setDaylight: glass.setDaylight,
    /** Dim every lamp in the room: 0 = dark, 1 = full house. */
    setHouseLights(level) {
      lights.forEach((light, i) => (light.intensity = lightPower[i] * level));
      bulbGlow.uniforms.level.value = level;
      halos.material.opacity = level;
      crystal.emissiveIntensity = 0.35 * level;
      glass.setLevel(level);
      for (const m of paintings) m.emissiveIntensity = 0.4 * level;
      for (const m of plates) m.emissiveIntensity = level;
    },
  };
}
