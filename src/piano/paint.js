import * as THREE from "three";

/**
 * Paint your own piano: the case (and the bench) in white, to be painted
 * with a brush, by dragging over it.
 *
 * The case's faces carry UVs every which way (scene units on the extruded
 * parts, 0…1 on the boxes, overlapping), so the paint is not laid on them.
 * Instead every vertex remembers where it stood, and which way it faced, in
 * the stage set's frame when painting began (`paintPos`, `paintNormal`), and
 * the paint is projected onto the case from six sides, like six sheets of
 * paper: above, below, left, right, front and back. A face takes its colour
 * from the sheets it faces, blended by how squarely it faces them. Since the
 * remembered positions travel with each part, paint on the lid stays on the
 * lid as it opens and closes.
 *
 * The six sheets share one canvas, three across and two down.
 */
const TILE = 512;
const PAD = 0.02; // of a tile, against bleeding into the next
const BASE = "#f6f3ec"; // the white the case starts from
// Sheet for each axis and sign: +x, -x, +y, -y, +z, -z.
const SHEETS = [
  [0, 1],
  [2, 3],
  [4, 5],
];

export function createPaint({ lacquer, root, camera, canvas, controls }) {
  const atlas = document.createElement("canvas");
  atlas.width = TILE * 3;
  atlas.height = TILE * 2;
  const g = atlas.getContext("2d");
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  function blank() {
    g.fillStyle = BASE;
    g.fillRect(0, 0, atlas.width, atlas.height);
    texture.needsUpdate = true;
  }
  blank();

  // The painted case: the lacquer's gloss, the paint for its colour.
  const material = lacquer.clone();
  material.color.set(0xffffff);
  material.map = null;
  material.metalness = 0;
  material.roughness = 0.22;
  material.clearcoat = 1;
  material.userData.painted = true; // inspection leaves it be (see there)
  const uniforms = {
    paintMap: { value: texture },
    paintMin: { value: new THREE.Vector3() },
    paintSize: { value: 1 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 paintPos;
        attribute vec3 paintNormal;
        varying vec3 vPaintPos;
        varying vec3 vPaintNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vPaintPos = paintPos;
        vPaintNormal = paintNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D paintMap;
        uniform vec3 paintMin;
        uniform float paintSize;
        varying vec3 vPaintPos;
        varying vec3 vPaintNormal;
        vec4 sheet(float i, vec2 uv) {
          vec2 cell = vec2(mod(i, 3.0), floor(i / 3.0));
          uv = ${PAD.toFixed(3)} + clamp(uv, 0.0, 1.0) * ${(1 - 2 * PAD).toFixed(3)};
          return texture2D(paintMap, (cell + uv) / vec2(3.0, 2.0));
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 pn = normalize(vPaintNormal);
        vec3 w = pow(abs(pn), vec3(4.0));
        w /= w.x + w.y + w.z;
        vec3 q = (vPaintPos - paintMin) / paintSize;
        vec4 paint =
          sheet(pn.x > 0.0 ? 0.0 : 1.0, q.zy) * w.x +
          sheet(pn.y > 0.0 ? 2.0 : 3.0, q.xz) * w.y +
          sheet(pn.z > 0.0 ? 4.0 : 5.0, q.xy) * w.z;
        diffuseColor.rgb *= paint.rgb;`,
      );
  };

  // Remember where every lacquered vertex stands now, in the stage set's
  // frame (shared geometries are copied first: each part needs its own).
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.material === lacquer) meshes.push(o);
  });
  let baked = false;
  function bake() {
    if (baked) return;
    baked = true;
    root.updateMatrixWorld(true);
    const toRoot = root.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const local = new THREE.Matrix4();
    const turn = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      mesh.geometry = mesh.geometry.clone();
      const { position, normal } = mesh.geometry.attributes;
      local.multiplyMatrices(toRoot, mesh.matrixWorld);
      turn.getNormalMatrix(local);
      const at = new Float32Array(position.count * 3);
      const facing = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i)
          .applyMatrix4(local)
          .toArray(at, i * 3);
        box.expandByPoint(v);
        v.fromBufferAttribute(normal, i).applyMatrix3(turn).normalize();
        v.toArray(facing, i * 3);
      }
      mesh.geometry.setAttribute("paintPos", new THREE.BufferAttribute(at, 3));
      mesh.geometry.setAttribute(
        "paintNormal",
        new THREE.BufferAttribute(facing, 3),
      );
    }
    const size = box.getSize(new THREE.Vector3());
    uniforms.paintMin.value.copy(box.min).subScalar(0.05);
    uniforms.paintSize.value = Math.max(size.x, size.y, size.z) + 0.1;
  }

  /** Show the painted case (or the lacquer again). */
  function wear(on) {
    if (on) bake();
    for (const mesh of meshes) mesh.material = on ? material : lacquer;
  }

  // The brush.
  let colour = "#c0392b";
  let radius = 0.18; // scene units (~4 cm)
  let erasing = false;
  let active = false; // painting, not looking about
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const last = new Map(); // sheet -> [x, y] of the stroke so far
  const pos = new THREE.Vector3();
  const facing = new THREE.Vector3();
  let stroke = null; // pointer id

  /** Where on the canvas (px) a point falls on sheet `i`, from (u, v). */
  const onSheet = (i, u, v) => [
    ((i % 3) + PAD + Math.min(1, Math.max(0, u)) * (1 - 2 * PAD)) * TILE,
    atlas.height -
      (Math.floor(i / 3) + PAD + Math.min(1, Math.max(0, v)) * (1 - 2 * PAD)) *
        TILE,
  ];
  function dab(event) {
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return last.clear();
    const { paintPos, paintNormal } = hit.object.geometry.attributes;
    const { a, b, c } = hit.face;
    THREE.Triangle.getInterpolatedAttribute(
      paintPos,
      a,
      b,
      c,
      hit.barycoord,
      pos,
    );
    THREE.Triangle.getInterpolatedAttribute(
      paintNormal,
      a,
      b,
      c,
      hit.barycoord,
      facing,
    ).normalize();
    const q = pos
      .clone()
      .sub(uniforms.paintMin.value)
      .divideScalar(uniforms.paintSize.value);
    const coords = [
      [q.z, q.y],
      [q.x, q.z],
      [q.x, q.y],
    ];
    const width =
      ((2 * radius) / uniforms.paintSize.value) * TILE * (1 - 2 * PAD);
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = width;
    g.strokeStyle = g.fillStyle = erasing ? BASE : colour;
    // Onto every sheet the surface faces at all, so edges stay painted.
    for (let axis = 0; axis < 3; axis++) {
      const n = facing.getComponent(axis);
      const sheet = SHEETS[axis][n > 0 ? 0 : 1];
      if (Math.abs(n) < 0.25) {
        last.delete(sheet);
        continue;
      }
      const [x, y] = onSheet(sheet, ...coords[axis]);
      const from = last.get(sheet) ?? [x, y];
      g.beginPath();
      g.moveTo(...from);
      g.lineTo(x, y);
      g.stroke();
      last.set(sheet, [x, y]);
    }
    texture.needsUpdate = true;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!active || event.button !== 0 || stroke !== null) return;
    stroke = event.pointerId;
    last.clear();
    dab(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (active) canvas.style.cursor = "crosshair";
    if (event.pointerId === stroke) dab(event);
  });
  const lift = (event) => {
    if (event.pointerId !== stroke) return;
    stroke = null;
    last.clear();
    save();
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

  // What is painted is kept for the next visit.
  function save() {
    try {
      localStorage.setItem("vgp.paint", atlas.toDataURL("image/webp", 0.92));
    } catch {
      // Storage full or blocked: the painting lasts for this visit.
    }
  }
  try {
    const saved = localStorage.getItem("vgp.paint");
    if (saved) {
      const image = new Image();
      image.onload = () => {
        g.drawImage(image, 0, 0);
        texture.needsUpdate = true;
      };
      image.src = saved;
    }
  } catch {
    // Storage blocked: a white case.
  }

  return {
    wear,
    get active() {
      return active;
    },
    /** Paint with a drag (`on`), or look about as usual. */
    setActive(on) {
      active = on;
      controls.enableRotate = !on;
      if (!on) canvas.style.cursor = "";
    },
    setColour(value) {
      colour = value;
      erasing = false;
    },
    setErasing(on) {
      erasing = on;
    },
    /** Brush radius in scene units. */
    setSize(value) {
      radius = value;
    },
    clear() {
      blank();
      save();
    },
  };
}
