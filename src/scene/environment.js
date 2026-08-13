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

  const overhead = reflectionCard(12, 5, 0xffe7c2, 3.2);
  overhead.position.set(0, 8, 0);
  overhead.rotation.x = Math.PI / 2;
  studio.add(overhead);

  const warmSide = reflectionCard(6, 4, 0xc88e58, 1.15);
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
  pmrem.dispose();

  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
