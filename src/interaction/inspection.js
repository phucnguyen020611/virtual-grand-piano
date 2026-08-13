import * as THREE from "three";

/**
 * Raycast-based part inspection, exploded-view labels, and hover feedback.
 *
 * @param renderer  WebGLRenderer (for the canvas + pointer mapping)
 * @param camera    active camera
 * @param piano     { parts, explodedComponents } from createPiano
 * @param dom       { partName, partText, partMeta, labelRoot }
 * @param onPlayKey callback(midi) when a playable key is clicked
 * @param onPedal callback(type, down) while a pedal is pointer-held
 */
export function createInspection(
  renderer,
  camera,
  piano,
  dom,
  onPlayKey,
  onPedal = () => {},
) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const v3 = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraToAnchor = new THREE.Vector3();
  const labelBounds = new THREE.Box3();
  const placedLabels = [];
  const originalMaterials = new Map();
  const temporaryMaterials = new Map();
  const labelOffsets = [0, 18, -18, 36, -36, 54, -54];
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

  function pedalOf(o) {
    let p = o;
    while (p) {
      if (p.userData?.pedalType) return p.userData.pedalType;
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
    originalMaterials.forEach((material, mesh) => {
      mesh.material = material;
    });
    temporaryMaterials.forEach((material) => material.dispose());
    originalMaterials.clear();
    temporaryMaterials.clear();
    labels.forEach(({ component, el }) => {
      el.classList.toggle("emphasis", component.object === target);
    });
    hovered = target;
    if (!target || target.userData?.pianoKey) return;
    target.traverse((child) => {
      if (!child.isMesh) return;
      const source = child.material;
      const materials = Array.isArray(source) ? source : [source];
      const highlighted = materials.map((material) => {
        if (!material) return material;
        let clone = temporaryMaterials.get(material);
        if (!clone) {
          clone = material.clone();
          if (clone.emissive) {
            clone.emissiveIntensity = (clone.emissiveIntensity || 0) + 0.13;
          }
          temporaryMaterials.set(material, clone);
        }
        return clone;
      });
      originalMaterials.set(child, source);
      child.material = Array.isArray(source) ? highlighted : highlighted[0];
    });
  }

  let down = { x: 0, y: 0 };
  let activePedal = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
    pointerNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(piano.parts.children, true)[0];
    activePedal = hit ? pedalOf(hit.object) : null;
    if (activePedal) {
      e.preventDefault();
      renderer.domElement.setPointerCapture?.(e.pointerId);
      onPedal(activePedal, true);
      selectPart(hit.object);
    }
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (activePedal) {
      e.preventDefault();
      onPedal(activePedal, false);
      activePedal = null;
      return;
    }
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
  renderer.domElement.addEventListener("pointercancel", () => {
    if (!activePedal) return;
    onPedal(activePedal, false);
    activePedal = null;
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    pointerNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(piano.parts.children, true)[0];
    const target = hit ? ownerOf(hit.object) : null;
    renderer.domElement.style.cursor = target ? "pointer" : "grab";
    setHover(target);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    renderer.domElement.style.cursor = "grab";
    setHover(null);
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
    camera.getWorldDirection(cameraForward);
    const ordered = [...labels].sort(
      (a, b) =>
        b.component.priority - a.component.priority ||
        (a.component.id < b.component.id ? -1 : 1),
    );
    for (const { component, el } of ordered) {
      labelBounds.setFromObject(component.object);
      labelBounds.getCenter(v3);
      v3.y = labelBounds.max.y + 0.16;
      cameraToAnchor.subVectors(v3, camera.position);
      const anchorDistance = cameraToAnchor.length();
      const inFront = cameraToAnchor.dot(cameraForward) > 0;
      if (
        !inFront ||
        anchorDistance < camera.near ||
        anchorDistance > camera.far
      ) {
        el.style.display = "none";
        continue;
      }
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
      const preferredY = (-v3.y * 0.5 + 0.5) * innerHeight;
      const width = el.offsetWidth || 88;
      const height = el.offsetHeight || 24;
      let placed = null;
      for (const offset of labelOffsets) {
        const y = preferredY + offset;
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
        const onScreen =
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight;
        if (!collision && onScreen) {
          placed = { rect, y };
          break;
        }
      }
      if (!placed) {
        el.style.display = "none";
        continue;
      }
      placedLabels.push(placed.rect);
      el.style.display = "block";
      el.style.left = `${x}px`;
      el.style.top = `${placed.y}px`;
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
