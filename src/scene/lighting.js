import * as THREE from "three";

/** Concert lighting: an overhead lamp fixture plus key, fill, rim and
 *  hemisphere lights, and a pair of warm footlights for lacquer reflections. */
export function createLighting(scene) {
  const lamp = new THREE.Group();
  scene.add(lamp);

  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.45, 0.35, 24),
    new THREE.MeshStandardMaterial({
      color: 0x171719,
      metalness: 0.82,
      roughness: 0.22,
    }),
  );
  shade.position.set(0, 9.1, -0.6);
  lamp.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.CylinderGeometry(1.92, 1.92, 0.06, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf6ddb0,
      emissive: 0xe6b865,
      emissiveIntensity: 3.0,
      roughness: 0.22,
    }),
  );
  bulb.position.set(0, 8.9, -0.6);
  lamp.add(bulb);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 4.5, 12),
    new THREE.MeshStandardMaterial({
      color: 0x0d0d0e,
      metalness: 0.15,
      roughness: 0.28,
    }),
  );
  rod.position.set(0, 11.45, -0.6);
  lamp.add(rod);

  const keyLight = new THREE.SpotLight(
    0xffe6bd,
    165,
    26,
    Math.PI * 0.22,
    0.54,
    1.5,
  );
  keyLight.position.set(0, 8.72, -0.6);
  keyLight.target.position.set(0.2, 0.4, -0.3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00014;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 26;
  scene.add(keyLight, keyLight.target);

  const fill = new THREE.SpotLight(0xdce7ff, 38, 20, Math.PI * 0.27, 0.72, 1.4);
  fill.position.set(-7, 5, 7);
  fill.target.position.set(0, 1, 0);
  scene.add(fill, fill.target);

  const warmRim = new THREE.SpotLight(
    0xffbd76,
    28,
    18,
    Math.PI * 0.3,
    0.8,
    1.6,
  );
  warmRim.position.set(6, 4, -7);
  warmRim.target.position.set(0, 1, -1);
  scene.add(warmRim, warmRim.target);

  scene.add(new THREE.HemisphereLight(0x32333c, 0x140b06, 1.05));

  for (const s of [-1, 1]) {
    const p = new THREE.PointLight(0xf1c98d, 4.5, 8, 2);
    p.position.set(s * 6, 0.25, 5.4);
    scene.add(p);
  }

  return { lamp, keyLight };
}
