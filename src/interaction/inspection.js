import * as THREE from "three";

/**
 * Raycast-based part inspection, exploded-view labels and mode switching.
 *
 * @param renderer  WebGLRenderer (for the canvas + pointer mapping)
 * @param camera    active camera
 * @param piano     { parts, explodeItems } from createPiano
 * @param dom       { partName, partText, partMeta, labelRoot }
 * @param onPlayKey callback(midi) when a playable key is clicked
 */
export function createInspection(renderer, camera, piano, dom, onPlayKey) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const v3 = new THREE.Vector3();
  let exploded = false;

  // Build floating DOM labels, one per exploded system.
  const labels = piano.explodeItems.map(([group, , name]) => {
    const el = document.createElement("div");
    el.className = "label3d";
    el.textContent = name;
    dom.labelRoot.appendChild(el);
    return { group, el };
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
    for (const { group, el } of labels) {
      group.getWorldPosition(v3);
      v3.y += 1.0;
      v3.project(camera);
      const visible = v3.z < 1 && v3.z > -1;
      el.style.display = visible ? "block" : "none";
      el.style.left = (v3.x * 0.5 + 0.5) * innerWidth + "px";
      el.style.top = (-v3.y * 0.5 + 0.5) * innerHeight + "px";
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
