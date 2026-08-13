import * as THREE from "three";

/**
 * Raycast-based part inspection, exploded-view labels, and hover feedback.
 *
 * @param renderer  WebGLRenderer (for the canvas + pointer mapping)
 * @param camera    active camera
 * @param piano     { parts, explodedComponents } from createPiano
 * @param dom       { partName, partText, partMeta, labelRoot }
 * @param onPlayKey callback(midi) when a playable key is clicked
 */
export function createInspection(renderer, camera, piano, dom, onPlayKey) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const v3 = new THREE.Vector3();
  const labelBounds = new THREE.Box3();
  const placedLabels = [];
  const highlightedMaterials = new Map();
  let exploded = false;
  let hovered = null;

  // Build floating DOM labels, one per bounds-aware exploded component.
  const labels = piano.explodedComponents.map((component) => {
    const el = document.createElement("div");
    el.className = "label3d";
    el.textContent = component.label;
    dom.labelRoot.appendChild(el);
    return { component, el };
  });

  function ownerOf(o) {
    let p = o;
    while (p) {
      if (p.userData?.pianoKey) return p;
      if (p.userData?.owner) return p.userData.owner;
      if (p.userData?.inspectable) return p;
      p = p.parent;
    }
    return null;
  }

  function selectPart(o) {
    const target = ownerOf(o);
    if (!target) return;
    dom.partName.textContent = target.userData.partName || "Piano component";
    dom.partText.textContent =
      target.userData.partText || "Individually modeled grand-piano component.";
    dom.partMeta.textContent = target.userData.partCategory || "Piano anatomy";
  }

  function pointerNDC(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function setHover(target) {
    if (hovered === target) return;
    highlightedMaterials.forEach((intensity, material) => {
      material.emissiveIntensity = intensity;
    });
    highlightedMaterials.clear();
    labels.forEach(({ component, el }) => {
      el.classList.toggle("emphasis", component.object === target);
    });
    hovered = target;
    if (!target || target.userData?.pianoKey) return;
    target.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => {
        if (!material?.emissive || highlightedMaterials.has(material)) return;
        highlightedMaterials.set(material, material.emissiveIntensity);
        material.emissiveIntensity = material.emissiveIntensity + 0.13;
      });
    });
  }

  let down = { x: 0, y: 0 };
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; // ignore drags
    pointerNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(piano.parts.children, true)[0];
    if (!hit) return;
    const o = hit.object;
    if (o.userData.pianoKey) {
      onPlayKey(o.userData.midi);
      selectPart(o);
    } else selectPart(o);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    pointerNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(piano.parts.children, true)[0];
    const target = hit ? ownerOf(hit.object) : null;
    renderer.domElement.style.cursor = target ? "pointer" : "grab";
    setHover(target);
  });

  function setMode(v, btns) {
    exploded = v;
    if (btns) {
      btns.normalBtn.classList.toggle("active", !v);
      btns.explodeBtn.classList.toggle("active", v);
    }
    labels.forEach((l) => l.el.classList.toggle("show", v));
    dom.partMeta.textContent = v ? "Exploded inspection" : "Selected component";
    if (v) {
      dom.partName.textContent = "Exploded anatomy";
      dom.partText.textContent =
        "Major piano systems are spatially separated while remaining individually selectable and orbitable.";
    }
  }

  function updateLabels() {
    placedLabels.length = 0;
    const ordered = [...labels].sort(
      (a, b) => b.component.priority - a.component.priority,
    );
    for (const { component, el } of ordered) {
      labelBounds.setFromObject(component.object);
      labelBounds.getCenter(v3);
      v3.y = labelBounds.max.y + 0.16;
      v3.project(camera);
      const visible =
        v3.z < 1 &&
        v3.z > -1 &&
        v3.x > -1.08 &&
        v3.x < 1.08 &&
        v3.y > -1.08 &&
        v3.y < 1.08;
      el.style.display = visible ? "block" : "none";
      if (!visible) continue;
      const x = (v3.x * 0.5 + 0.5) * innerWidth;
      let y = (-v3.y * 0.5 + 0.5) * innerHeight;
      const width = el.offsetWidth || 88;
      const height = el.offsetHeight || 24;
      for (let attempt = 0; attempt < 5; attempt++) {
        const rect = {
          left: x - width / 2,
          right: x + width / 2,
          top: y - height / 2,
          bottom: y + height / 2,
        };
        const collision = placedLabels.some(
          (placed) =>
            rect.left < placed.right &&
            rect.right > placed.left &&
            rect.top < placed.bottom &&
            rect.bottom > placed.top,
        );
        if (!collision) {
          placedLabels.push(rect);
          break;
        }
        y += attempt % 2 ? -18 : 18;
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  return {
    labels,
    selectPart,
    setMode,
    updateLabels,
    get exploded() {
      return exploded;
    },
  };
}
