import * as THREE from "three";

/**
 * Wooden concert stage. Returns the top-surface Y so the piano legs and
 * casters can be seated exactly on the floor.
 */
export function createStage(scene, mats) {
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.55, 15),
    new THREE.MeshStandardMaterial({
      map: mats.woodTex,
      roughness: 0.46,
      metalness: 0.02,
    }),
  );
  stage.position.y = -0.32;
  stage.receiveShadow = true;
  scene.add(stage);

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(22.15, 0.15, 15.15),
    new THREE.MeshStandardMaterial({
      color: 0x150d09,
      roughness: 0.35,
    }),
  );
  edge.position.y = -0.61;
  edge.receiveShadow = true;
  scene.add(edge);

  const stageTopY = stage.position.y + 0.275; // top face of the stage box
  return { stage, stageTopY };
}
