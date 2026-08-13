import * as THREE from "three";

const GAP = 0.32;
const FRAMING_MARGIN = 1.14;
const CAMERA_EXPANSION = 1.04;
const CAMERA_POSITION_EPSILON = 0.018;
const CAMERA_TARGET_EPSILON = 0.012;

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
  const explodedBounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const explodedSize = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const normalTarget = new THREE.Vector3(0, 1.25, -0.4);
  const normalDefaultTarget = normalTarget.clone();
  const normalDefaultPosition = new THREE.Vector3(9.2, 6.4, 11.5);
  const defaultCameraDirection = new THREE.Vector3()
    .subVectors(normalDefaultPosition, normalDefaultTarget)
    .normalize();
  const cameraDirection = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const components = piano.explodedComponents.map((definition) => ({
    ...definition,
    assembled: captureTransform(definition.object),
    exploded: null,
    bounds: new THREE.Box3().setFromObject(definition.object),
  }));
  const byId = new Map(
    components.map((component) => [component.id, component]),
  );
  let targetExploded = false;
  let cameraAssisted = false;
  let normalDistance = normalDefaultPosition.distanceTo(normalDefaultTarget);
  let explodedDistance = 0;
  let requiredFitDistance = 0;
  let widthFitDistance = 0;
  let heightFitDistance = 0;
  const baseMaxDistance = controls.maxDistance;

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

    explodedBounds.makeEmpty();
    components.forEach((component) => {
      applyTransform(component.object, component.exploded);
      component.object.updateMatrixWorld(true);
      const componentBounds = new THREE.Box3().setFromObject(component.object);
      explodedBounds.union(componentBounds);
    });
    validateExplodedLayout(components);
    components.forEach((component) =>
      applyTransform(component.object, component.assembled),
    );
    piano.group.updateMatrixWorld(true);
    desiredTarget.copy(explodedBounds.getCenter(center));
    explodedBounds.getSize(explodedSize);
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
      if (cameraDirection.lengthSq() === 0)
        cameraDirection.copy(defaultCameraDirection);
      explodedDistance = getExplodedCameraDistance(normalDistance);
    }
    targetExploded = value;
    cameraAssisted = true;
  }

  /**
   * Fit the cached exploded Box3 to the current perspective camera. The eight
   * corners account for the view direction and box depth while the vertical
   * and horizontal FOV terms provide the height/width requirements.
   */
  function updateFitDistance() {
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const verticalTan = Math.tan(halfVerticalFov);
    const horizontalTan = verticalTan * camera.aspect;
    const forwardX = -cameraDirection.x;
    const forwardY = -cameraDirection.y;
    const forwardZ = -cameraDirection.z;
    const right = new THREE.Vector3()
      .set(forwardX, forwardY, forwardZ)
      .cross(camera.up)
      .normalize();
    const up = new THREE.Vector3()
      .crossVectors(right, new THREE.Vector3(forwardX, forwardY, forwardZ))
      .normalize();
    const xs = [explodedBounds.min.x, explodedBounds.max.x];
    const ys = [explodedBounds.min.y, explodedBounds.max.y];
    const zs = [explodedBounds.min.z, explodedBounds.max.z];

    widthFitDistance = 0;
    heightFitDistance = 0;
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const px = x - desiredTarget.x;
          const py = y - desiredTarget.y;
          const pz = z - desiredTarget.z;
          const depth = px * forwardX + py * forwardY + pz * forwardZ;
          const horizontal = Math.abs(
            px * right.x + py * right.y + pz * right.z,
          );
          const vertical = Math.abs(px * up.x + py * up.y + pz * up.z);
          widthFitDistance = Math.max(
            widthFitDistance,
            (horizontal * FRAMING_MARGIN) / horizontalTan - depth,
          );
          heightFitDistance = Math.max(
            heightFitDistance,
            (vertical * FRAMING_MARGIN) / verticalTan - depth,
          );
        }
      }
    }
    requiredFitDistance = Math.max(widthFitDistance, heightFitDistance, 0.1);
    controls.maxDistance = Math.max(
      baseMaxDistance,
      requiredFitDistance * 1.08,
    );
    return requiredFitDistance;
  }

  function getExplodedCameraDistance(sourceDistance) {
    return Math.max(sourceDistance * CAMERA_EXPANSION, updateFitDistance());
  }

  function currentCameraDistance() {
    return camera.position.distanceTo(controls.target);
  }

  controls.addEventListener("start", () => {
    cancelCameraAssist();
  });

  function cancelCameraAssist() {
    cameraAssisted = false;
  }

  function updateCamera(dt) {
    if (!cameraAssisted) return;
    const target = targetExploded ? desiredTarget : normalTarget;
    const distance = targetExploded ? explodedDistance : normalDistance;
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
      .copy(target)
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
    if (
      camera.position.distanceToSquared(desiredCameraPosition) <
        CAMERA_POSITION_EPSILON * CAMERA_POSITION_EPSILON &&
      controls.target.distanceToSquared(target) <
        CAMERA_TARGET_EPSILON * CAMERA_TARGET_EPSILON
    ) {
      camera.position.copy(desiredCameraPosition);
      controls.target.copy(target);
      cameraAssisted = false;
    }
  }

  function handleResize() {
    if (!targetExploded) return;
    const fitDistance = updateFitDistance();
    if (cameraAssisted)
      explodedDistance = Math.max(explodedDistance, fitDistance);
    if (currentCameraDistance() + CAMERA_POSITION_EPSILON < fitDistance) {
      explodedDistance = Math.max(explodedDistance, fitDistance);
      cameraAssisted = true;
    }
  }

  function resetCamera() {
    cancelCameraAssist();
    if (targetExploded) {
      cameraDirection.copy(defaultCameraDirection);
      explodedDistance = getExplodedCameraDistance(
        normalDefaultPosition.distanceTo(normalDefaultTarget),
      );
      controls.target.copy(desiredTarget);
      camera.position
        .copy(desiredTarget)
        .addScaledVector(cameraDirection, explodedDistance);
    } else {
      controls.target.copy(normalDefaultTarget);
      camera.position.copy(normalDefaultPosition);
    }
    controls.update();
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
    cancelCameraAssist,
    handleResize,
    resetCamera,
    getCameraFitDiagnostics() {
      return {
        boundsSize: explodedSize.toArray(),
        widthFitDistance,
        heightFitDistance,
        requiredFitDistance,
        chosenDistance: explodedDistance,
      };
    },
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
