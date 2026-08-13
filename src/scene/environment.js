import * as THREE from "three";

function reflectionCard(width, height, color, intensity) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      toneMapped: false,
    }),
  );
}

/**
 * Generates a compact PMREM environment from abstract studio cards. It is
 * intentionally invisible to the camera: its job is to give dielectric
 * lacquer and metal a believable room to reflect without an HDR download.
 */
export function createReflectionEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x090a0d);

  const overhead = reflectionCard(12, 5, 0xffe7c2, 0.65);
  overhead.position.set(0, 8, 0);
  overhead.rotation.x = Math.PI / 2;
  studio.add(overhead);

  // Narrow front card: gives the raised lid and fallboard a long controlled
  // lacquer highlight at the default three-quarter inspection angle.
  const lidStrip = reflectionCard(10, 1.35, 0xf5ead7, 0.26);
  lidStrip.position.set(2.4, 5.8, 6.6);
  lidStrip.rotation.y = Math.PI;
  studio.add(lidStrip);

  const lidBroadHighlight = reflectionCard(10, 1.6, 0xe8e1d2, 0.06);
  lidBroadHighlight.position.set(-7.2, 1.55, -6.5);
  lidBroadHighlight.rotation.y = 0.88;
  studio.add(lidBroadHighlight);

  const warmSide = reflectionCard(6, 4, 0xc88e58, 0.35);
  warmSide.position.set(-7, 2.8, 2.2);
  warmSide.rotation.y = Math.PI / 2;
  studio.add(warmSide);

  const coolRear = reflectionCard(7, 3, 0x7892bc, 0.5);
  coolRear.position.set(3, 4.6, -7);
  studio.add(coolRear);

  const lowFill = reflectionCard(10, 2, 0x442d20, 0.28);
  lowFill.position.set(0, -4, 2);
  lowFill.rotation.x = -Math.PI / 2;
  studio.add(lowFill);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(studio, 0.04, 0.1, 30);
  studio.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material))
      object.material.forEach((m) => m.dispose());
    else object.material?.dispose();
  });
  pmrem.dispose();

  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
