import * as THREE from "three";

/**
 * Wooden concert stage. Returns the top-surface Y so the piano legs and
 * casters can be seated exactly on the floor.
 */
export function createStage(scene, mats) {
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.55, 15),
    new THREE.MeshPhysicalMaterial({
      color: 0x75685d,
      map: mats.woodTex,
      roughness: 0.8,
      metalness: 0,
      clearcoat: 0,
      envMapIntensity: 0.03,
    }),
  );
  stage.position.y = -0.32;
  stage.receiveShadow = true;
  scene.add(stage);

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(22.15, 0.15, 15.15),
    new THREE.MeshStandardMaterial({
      color: 0x140d09,
      roughness: 0.5,
    }),
  );
  edge.position.y = -0.61;
  edge.receiveShadow = true;
  scene.add(edge);

  const stageTopY = stage.position.y + 0.275; // top face of the stage box
  return { stage, stageTopY };
}
