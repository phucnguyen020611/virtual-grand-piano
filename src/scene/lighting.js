import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

/**
 * Product-photography lighting with a single visible overhead fixture. Broad
 * area sources shape reflections, while the fixture's spotlight grounds the
 * piano with soft shadows. The focus rises smoothly with exploded anatomy.
 */
export function createLighting(scene) {
  RectAreaLightUniformsLib.init();

  const lamp = new THREE.Group();
  scene.add(lamp);

  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.45, 0.35, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x111216,
      metalness: 0.62,
      roughness: 0.3,
    }),
  );
  housing.position.set(0, 9.1, -0.6);
  lamp.add(housing);

  const diffuser = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 0.055, 32),
    new THREE.MeshStandardMaterial({
      color: 0xe9d9b8,
      emissive: 0x8a6339,
      emissiveIntensity: 0.65,
      roughness: 0.46,
    }),
  );
  diffuser.position.set(0, 8.895, -0.6);
  lamp.add(diffuser);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 4.5, 12),
    new THREE.MeshStandardMaterial({
      color: 0x101115,
      metalness: 0.6,
      roughness: 0.42,
    }),
  );
  rod.position.set(0, 11.45, -0.6);
  lamp.add(rod);

  const keyLight = new THREE.SpotLight(
    0xffe6bf,
    72,
    22,
    Math.PI * 0.245,
    0.86,
    2,
  );
  keyLight.position.set(0, 8.7, -0.6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00008;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 3;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 30;
  scene.add(keyLight, keyLight.target);

  const keyReflection = new THREE.RectAreaLight(0xffe0b8, 3.6, 8.5, 4.5);
  keyReflection.position.set(-0.8, 7.6, 5.7);
  scene.add(keyReflection);

  const sideReflection = new THREE.RectAreaLight(0xe9bd8b, 2.4, 3.2, 6.5);
  sideReflection.position.set(-6.4, 4.4, 2.8);
  scene.add(sideReflection);

  const coolRim = new THREE.RectAreaLight(0xa9bbdd, 1.4, 4.5, 5.5);
  coolRim.position.set(6.5, 5.3, -4.5);
  scene.add(coolRim);

  // Low, rearward card catches the raised lid without filling the whole room.
  const lidReflection = new THREE.RectAreaLight(0xe8e1d2, 0.12, 10, 1.2);
  lidReflection.position.set(-6.2, 2.1, -5.8);
  scene.add(lidReflection);

  const ambient = new THREE.HemisphereLight(0x3a4153, 0x170f0b, 0.24);
  scene.add(ambient);

  const normalFocus = new THREE.Vector3(0, 1.2, -0.35);
  const explodedFocus = new THREE.Vector3(0, 4.35, -0.65);
  const focus = normalFocus.clone();
  let targetExploded = false;
  let explodedBlend = 0;

  function aimLights() {
    keyLight.target.position.copy(focus);
    keyLight.target.updateMatrixWorld();
    keyReflection.lookAt(focus);
    sideReflection.lookAt(focus);
    coolRim.lookAt(focus);
    lidReflection.lookAt(focus);
  }

  function setExploded(value) {
    targetExploded = value;
  }

  function update(dt) {
    explodedBlend = THREE.MathUtils.damp(
      explodedBlend,
      targetExploded ? 1 : 0,
      2.8,
      dt,
    );
    focus.lerpVectors(normalFocus, explodedFocus, explodedBlend);
    aimLights();
  }

  aimLights();
  return {
    lamp,
    keyLight,
    setExploded,
    update,
    get explodedBlend() {
      return explodedBlend;
    },
  };
}
