import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { box } from "../piano/geometry.js";

/** A stationary padded pianist's bench, clear of keys/pedals in both modes. */
export function createBench(mats, stageTopY) {
  const bench = new THREE.Group();
  bench.name = "pianist-bench";
  bench.position.set(0, stageTopY, 5.1);

  box(2.48, 0.14, 1.22, mats.blackLacquer, bench, 0, 0.83);
  const cushion = new THREE.Mesh(
    new RoundedBoxGeometry(2.6, 0.22, 1.34, 2, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x28231f, roughness: 0.78 }),
  );
  cushion.position.y = 0.99;
  cushion.castShadow = cushion.receiveShadow = true;
  bench.add(cushion);

  const legGeometry = new THREE.BoxGeometry(0.14, 0.8, 0.14);
  for (const x of [-1.08, 1.08]) {
    for (const z of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(legGeometry, mats.blackLacquer);
      leg.position.set(x, 0.4, z);
      leg.castShadow = leg.receiveShadow = true;
      bench.add(leg);
    }
  }
  return bench;
}
