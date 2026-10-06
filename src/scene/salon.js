import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * The music salon, where the games are played: an intimate room in white
 * and gold built round the piano where it stands (the hall is hidden while
 * the salon shows, so the piano never moves). Herringbone parquet and a
 * crimson rug, white boiserie with silk panels in gilt frames, a marble
 * chimneypiece under a tall mirror on the far wall, two windows onto the
 * night with velvet curtains, and a candle chandelier overhead.
 *
 * The player sits at −x looking along +x over the keys, so the chimneypiece
 * faces them beyond the piano.
 */
const X0 = -16; // behind the player
const X1 = 18; // the chimneypiece wall
const Z = 14; // half the room's width
const HEIGHT = 22;

const soup = (parts) =>
  mergeGeometries(
    parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute("uv");
      return flat;
    }),
  );
const box = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A gilt moulding round a w × h panel in the y–z plane (a wall at ±x). */
const frameX = (x, y, z, w, h, t = 0.14) => [
  box(t, t, w + t, x, y + h / 2, z),
  box(t, t, w + t, x, y - h / 2, z),
  box(t, h, t, x, y, z + w / 2),
  box(t, h, t, x, y, z - w / 2),
];
/** The same in the x–y plane (a wall at ±z). */
const frameZ = (x, y, z, w, h, t = 0.14) => [
  box(w + t, t, t, x, y + h / 2, z),
  box(w + t, t, t, x, y - h / 2, z),
  box(t, h, t, x + w / 2, y, z),
  box(t, h, t, x - w / 2, y, z),
];

/** The night beyond the windows: deep blue, a few stars, a moonlit glow. */
function nightTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#0b1430");
  sky.addColorStop(0.7, "#1c2a52");
  sky.addColorStop(1, "#3a3a5a");
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 256);
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#fff";
  for (let k = 0; k < 40; k++) {
    g.globalAlpha = 0.3 + rand() * 0.7;
    g.fillRect(rand() * 128, rand() * 170, 1.2, 1.2);
  }
  g.globalAlpha = 1;
  // Glazing bars.
  g.fillStyle = "#e9dfc8";
  for (const x of [42, 85]) g.fillRect(x, 0, 3, 256);
  for (const y of [64, 128, 192]) g.fillRect(0, y, 128, 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** A crimson rug with a gilt border and a cream inner line. */
function rugTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#c79a4a";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#6e1420";
  g.fillRect(14, 14, 228, 228);
  g.strokeStyle = "#e6d3a8";
  g.lineWidth = 3;
  g.strokeRect(26, 26, 204, 204);
  g.strokeStyle = "rgba(199,154,74,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(128, 128, 70, 48, 0, 0, Math.PI * 2);
  g.stroke();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/**
 * @param room { floorY, gilt, plaster(w, h), damask(w, h), parquet(w, h),
 *   velvet (a velvet texture set for the curtains) }
 */
export function buildSalon(scene, room) {
  const { floorY: F, gilt } = room;
  const group = new THREE.Group();
  group.name = "salon";
  group.visible = false;
  scene.add(group);
  const add = (geometry, material, name) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = `salon-${name}`;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xf3ebda,
    roughness: 0.45,
  });
  const marble = new THREE.MeshStandardMaterial({
    color: 0xe8e2d8,
    roughness: 0.2,
  });
  const width = X1 - X0;
  const midX = (X0 + X1) / 2;

  // Floor, rug, ceiling.
  add(
    new THREE.PlaneGeometry(width, 2 * Z)
      .rotateX(-Math.PI / 2)
      .translate(midX, F, 0),
    room.parquet(width, 2 * Z),
    "floor",
  );
  add(
    new THREE.PlaneGeometry(22, 16)
      .rotateX(-Math.PI / 2)
      .translate(3, F + 0.02, 0),
    new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }),
    "rug",
  );
  add(
    new THREE.PlaneGeometry(width, 2 * Z)
      .rotateX(Math.PI / 2)
      .translate(midX, F + HEIGHT, 0),
    room.plaster(width, 2 * Z),
    "ceiling",
  );

  // Walls: each faces into the room.
  add(
    new THREE.PlaneGeometry(2 * Z, HEIGHT)
      .rotateY(-Math.PI / 2)
      .translate(X1, F + HEIGHT / 2, 0),
    room.plaster(2 * Z, HEIGHT),
    "far-wall",
  );
  add(
    new THREE.PlaneGeometry(2 * Z, HEIGHT)
      .rotateY(Math.PI / 2)
      .translate(X0, F + HEIGHT / 2, 0),
    room.plaster(2 * Z, HEIGHT),
    "near-wall",
  );
  for (const s of [-1, 1])
    add(
      new THREE.PlaneGeometry(width, HEIGHT)
        .rotateY(s > 0 ? Math.PI : 0)
        .translate(midX, F + HEIGHT / 2, s * Z),
      room.plaster(width, HEIGHT),
      "side-wall",
    );

  // Silk panels in gilt frames: three down each side, flanking the mirror.
  const silk = [];
  const giltParts = [];
  for (const s of [-1, 1]) {
    for (const x of [-9, 0, 9]) {
      // The windows stand at x = ±4.5 on the +z wall; panels go between.
      if (s > 0 && x === 0) continue;
      silk.push(
        new THREE.PlaneGeometry(5, 10)
          .rotateY(s > 0 ? Math.PI : 0)
          .translate(x, F + 8, s * (Z - 0.03)),
      );
      giltParts.push(...frameZ(x, F + 8, s * (Z - 0.08), 5, 10, 0.18));
    }
    silk.push(
      new THREE.PlaneGeometry(5, 10)
        .rotateY(-Math.PI / 2)
        .translate(X1 - 0.03, F + 8, s * 9.5),
    );
    giltParts.push(...frameX(X1 - 0.08, F + 8, s * 9.5, 5, 10, 0.18));
  }
  add(
    mergeGeometries(silk.map((g) => g.toNonIndexed())),
    room.damask(5, 10),
    "silk",
  );
  // Dado rail, skirting and cornice all round.
  for (const s of [-1, 1]) {
    giltParts.push(
      box(width, 0.16, 0.14, midX, F + 2.2, s * (Z - 0.07)),
      box(width, 0.5, 0.2, midX, F + 0.25, s * (Z - 0.1)),
      box(width, 0.6, 0.6, midX, F + HEIGHT - 0.3, s * (Z - 0.3)),
    );
  }
  for (const x of [X0, X1]) {
    const inward = x < 0 ? 1 : -1;
    giltParts.push(
      box(0.14, 0.16, 2 * Z, x + inward * 0.07, F + 2.2, 0),
      box(0.2, 0.5, 2 * Z, x + inward * 0.1, F + 0.25, 0),
      box(0.6, 0.6, 2 * Z, x + inward * 0.3, F + HEIGHT - 0.3, 0),
    );
  }

  // The chimneypiece: marble jambs and shelf, a dark hearth with embers,
  // and a tall mirror in a gilt frame above it.
  const chimney = [
    box(1.2, 5, 1.4, X1 - 0.7, F + 2.5, -3.6),
    box(1.2, 5, 1.4, X1 - 0.7, F + 2.5, 3.6),
    box(1.6, 1.0, 8.6, X1 - 0.8, F + 5.5, 0),
    box(2.0, 0.35, 9.4, X1 - 1.0, F + 6.15, 0), // the mantel shelf
    box(2.4, 0.3, 9.6, X1 - 1.2, F + 0.15, 0), // the hearthstone
  ];
  add(soup(chimney), marble, "chimneypiece");
  add(
    box(0.3, 4.6, 6.0, X1 - 0.2, F + 2.6, 0),
    new THREE.MeshStandardMaterial({ color: 0x16100c, roughness: 1 }),
    "hearth",
  );
  const embers = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 0.55, 0.18),
    toneMapped: false,
  });
  add(
    new THREE.SphereGeometry(1, 12, 6)
      .scale(0.5, 0.35, 2.0)
      .translate(X1 - 0.9, F + 0.45, 0),
    embers,
    "embers",
  );
  const mirror = new THREE.MeshStandardMaterial({
    color: 0xc9d0d6,
    metalness: 1,
    roughness: 0.05,
  });
  mirror.userData.keepEnv = true;
  add(
    new THREE.PlaneGeometry(6.4, 11)
      .rotateY(-Math.PI / 2)
      .translate(X1 - 0.12, F + 12.2, 0),
    mirror,
    "mirror",
  );
  giltParts.push(
    ...frameX(X1 - 0.18, F + 12.2, 0, 6.4, 11, 0.4),
    // A crest atop the mirror's frame.
    new THREE.SphereGeometry(0.7, 16, 10)
      .scale(0.4, 1, 1.4)
      .translate(X1 - 0.3, F + 18.2, 0),
  );
  // Candelabra on the mantel, three lights each.
  const flames = [];
  for (const s of [-1, 1]) {
    const [x, z] = [X1 - 1.0, s * 3.4];
    giltParts.push(
      new THREE.CylinderGeometry(0.06, 0.28, 1.6, 10).translate(x, F + 7.1, z),
      box(0.12, 0.12, 1.4, x, F + 7.8, z),
    );
    for (const dz of [-0.7, 0, 0.7]) {
      giltParts.push(
        new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8).translate(
          x,
          F + 8.2,
          z + dz,
        ),
      );
      flames.push([x, F + 8.65, z + dz]);
    }
  }

  // Two windows onto the night, on the right-hand wall, with curtains.
  const night = new THREE.MeshBasicMaterial({ map: nightTexture() });
  const curtainCloth = new THREE.MeshStandardMaterial({
    color: 0x7a1424,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const drape = new THREE.PlaneGeometry(1.8, 13, 12, 1);
  const p = drape.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 7) * 0.12);
  drape.computeVertexNormals();
  const drapes = [];
  for (const x of [-4.5, 4.5]) {
    add(
      new THREE.PlaneGeometry(4, 10)
        .rotateY(Math.PI)
        .translate(x, F + 8, Z - 0.04),
      night,
      "window",
    );
    giltParts.push(...frameZ(x, F + 8, Z - 0.1, 4, 10, 0.3));
    for (const s of [-1, 1])
      drapes.push(
        drape
          .clone()
          .rotateY(Math.PI)
          .translate(x + s * 2.6, F + 7.6, Z - 0.5),
      );
    giltParts.push(box(6.6, 0.25, 0.25, x, F + 14.2, Z - 0.5)); // the pole
  }
  add(
    mergeGeometries(drapes.map((g) => g.toNonIndexed())),
    curtainCloth,
    "curtains",
  );

  // The chandelier: a gilt ring of eight candles on a stem, crystal drops.
  const [cx, cy] = [2, F + 15.5];
  giltParts.push(
    new THREE.CylinderGeometry(0.08, 0.08, HEIGHT - 15.5 + F, 8).translate(
      cx,
      (cy + F + HEIGHT) / 2 + 0.6,
      0,
    ),
    new THREE.TorusGeometry(2.2, 0.1, 8, 40)
      .rotateX(Math.PI / 2)
      .translate(cx, cy, 0),
    new THREE.SphereGeometry(0.55, 16, 12).translate(cx, cy - 0.4, 0),
    new THREE.SphereGeometry(0.25, 12, 8).translate(cx, cy - 1.1, 0),
  );
  const sleeves = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const [x, z] = [cx + Math.cos(a) * 2.2, Math.sin(a) * 2.2];
    giltParts.push(
      new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6)
        .rotateZ(Math.PI / 2)
        .rotateY(-a)
        .translate((x + cx) / 2, cy, z / 2),
    );
    sleeves.push(
      new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8).translate(x, cy + 0.4, z),
    );
    flames.push([x, cy + 0.95, z]);
  }
  add(soup(sleeves), ivory, "candles");
  add(soup(giltParts), gilt, "gilt");
  add(
    soup(
      flames.map(([x, y, z]) =>
        new THREE.SphereGeometry(0.11, 8, 6)
          .scale(1, 1.6, 1)
          .translate(x, y, z),
      ),
    ),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.8, 1.25, 0.6),
      toneMapped: false,
    }),
    "flames",
  );

  // One warm light: the chandelier's candles and the fire, together.
  const light = new THREE.PointLight(0xffd8a8, 0, 60, 2);
  light.position.set(cx, cy - 1, 0);
  const fire = new THREE.PointLight(0xff8a40, 0, 16, 2);
  fire.position.set(X1 - 2, F + 1.5, 0);
  scene.add(light, fire);
  let clock = 0;

  return {
    group,
    get visible() {
      return group.visible;
    },
    /** Show the salon (its candles lit) or put it away. */
    setVisible(on) {
      group.visible = on;
      light.intensity = on ? 380 : 0;
      fire.intensity = on ? 40 : 0;
    },
    /** The fire flickers. */
    update(dt) {
      if (!group.visible) return;
      clock += dt;
      fire.intensity =
        40 * (0.8 + 0.12 * Math.sin(clock * 9) + 0.08 * Math.sin(clock * 23));
    },
  };
}
