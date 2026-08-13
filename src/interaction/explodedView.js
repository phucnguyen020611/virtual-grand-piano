import * as THREE from "three";

const GAP = 0.32;

function captureTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function applyTransform(object, transform) {
  object.position.copy(transform.position);
  object.quaternion.copy(transform.quaternion);
  object.scale.copy(transform.scale);
}

function copyTransform(transform) {
  return {
    position: transform.position.clone(),
    quaternion: transform.quaternion.clone(),
    scale: transform.scale.clone(),
  };
}

/**
 * Bounds-aware vertical assembly presentation. Every component keeps an
 * immutable assembled transform and a separately computed exploded transform.
 */
export function createExplodedView({ piano, camera, controls }) {
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const normalTarget = new THREE.Vector3(0, 1.25, -0.4);
  const cameraDirection = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const components = piano.explodedComponents.map((definition) => ({
    ...definition,
    assembled: captureTransform(definition.object),
    exploded: null,
    bounds: new THREE.Box3().setFromObject(definition.object),
    labelAnchor: new THREE.Vector3(),
  }));
  const byId = new Map(
    components.map((component) => [component.id, component]),
  );
  let targetExploded = false;
  let cameraAssisted = false;
  let normalDistance = 0;

  function setExplodedPosition(component, y, z = 0) {
    component.exploded = copyTransform(component.assembled);
    component.exploded.position.y += y - component.bounds.min.y;
    component.exploded.position.z += z;
  }

  function buildLayout() {
    const rim = byId.get("rim");
    rim.exploded = copyTransform(rim.assembled);
    let stackTop = rim.bounds.max.y + 0.52;
    for (const id of [
      "soundboard",
      "plate",
      "strings",
      "action",
      "musicDesk",
      "lid",
    ]) {
      const component = byId.get(id);
      setExplodedPosition(component, stackTop);
      stackTop += component.bounds.max.y - component.bounds.min.y + GAP;
    }
    setExplodedPosition(
      byId.get("keyboard"),
      byId.get("keyboard").bounds.min.y - 0.14,
      1.2,
    );
    setExplodedPosition(
      byId.get("pedals"),
      byId.get("pedals").bounds.min.y - 0.45,
      0.55,
    );
    setExplodedPosition(byId.get("legs"), byId.get("legs").bounds.min.y - 0.4);

    const explodedBounds = new THREE.Box3().makeEmpty();
    components.forEach((component) => {
      applyTransform(component.object, component.exploded);
      component.object.updateMatrixWorld(true);
      const componentBounds = new THREE.Box3().setFromObject(component.object);
      explodedBounds.union(componentBounds);
      component.labelAnchor.copy(componentBounds.getCenter(center));
      component.labelAnchor.y = componentBounds.max.y + 0.16;
    });
    validateExplodedLayout(components);
    components.forEach((component) =>
      applyTransform(component.object, component.assembled),
    );
    piano.group.updateMatrixWorld(true);
    desiredTarget.copy(explodedBounds.getCenter(center));
  }

  function validateExplodedLayout(items) {
    if (!import.meta.env?.DEV) return;
    const overlaps = [];
    const first = new THREE.Box3();
    const second = new THREE.Box3();
    const intersection = new THREE.Box3();
    const expectedBoundsOverlap = new Set(["pedals:legs"]);
    for (let i = 0; i < items.length; i++) {
      first.setFromObject(items[i].object);
      for (let j = i + 1; j < items.length; j++) {
        if (expectedBoundsOverlap.has(`${items[i].id}:${items[j].id}`))
          continue;
        second.setFromObject(items[j].object);
        intersection.copy(first).intersect(second);
        if (
          !intersection.isEmpty() &&
          intersection.max.y - intersection.min.y > 0.04 &&
          intersection.max.x - intersection.min.x > 0.04 &&
          intersection.max.z - intersection.min.z > 0.04
        ) {
          overlaps.push([items[i].id, items[j].id]);
        }
      }
    }
    if (overlaps.length) {
      console.warn(
        "Exploded component bounds overlap.",
        JSON.stringify(overlaps),
      );
    }
  }

  function setExploded(value) {
    if (targetExploded === value) return;
    if (value) {
      normalTarget.copy(controls.target);
      cameraOffset.subVectors(camera.position, controls.target);
      normalDistance = cameraOffset.length();
      cameraDirection.copy(cameraOffset).normalize();
    }
    targetExploded = value;
    cameraAssisted = true;
  }

  controls.addEventListener("start", () => {
    cameraAssisted = false;
  });

  function updateCamera(dt) {
    if (!cameraAssisted) return;
    const target = targetExploded ? desiredTarget : normalTarget;
    const distance = normalDistance * (targetExploded ? 1.24 : 1);
    controls.target.x = THREE.MathUtils.damp(
      controls.target.x,
      target.x,
      3.1,
      dt,
    );
    controls.target.y = THREE.MathUtils.damp(
      controls.target.y,
      target.y,
      3.1,
      dt,
    );
    controls.target.z = THREE.MathUtils.damp(
      controls.target.z,
      target.z,
      3.1,
      dt,
    );
    desiredCameraPosition
      .copy(controls.target)
      .addScaledVector(cameraDirection, distance);
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      desiredCameraPosition.x,
      3.1,
      dt,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      desiredCameraPosition.y,
      3.1,
      dt,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      desiredCameraPosition.z,
      3.1,
      dt,
    );
  }

  function update(dt) {
    const alpha = 1 - Math.exp(-5.2 * dt);
    for (const component of components) {
      const target = targetExploded ? component.exploded : component.assembled;
      component.object.position.lerp(target.position, alpha);
      component.object.quaternion.slerp(target.quaternion, alpha);
      component.object.scale.lerp(target.scale, alpha);
    }
    updateCamera(dt);
  }

  buildLayout();
  return {
    components,
    setExploded,
    update,
    get exploded() {
      return targetExploded;
    },
    get isTransitioning() {
      return components.some(
        (component) =>
          component.object.position.distanceTo(
            targetExploded
              ? component.exploded.position
              : component.assembled.position,
          ) > 0.01,
      );
    },
  };
}
