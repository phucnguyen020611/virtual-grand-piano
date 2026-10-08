import * as THREE from "three";
import { KEY_SPAN, keyLabel } from "../performance/computerKeyboard.js";

/**
 * The computer keys printed on the piano's keys, as a hint: on each key the
 * computer keyboard plays (it moves with the octave), near its front, the
 * letter to press (the upper row's where both rows reach a note). Dark on
 * the ivories, ivory on the ebonies. Each label rides on its key, so it dips
 * when the key is played.
 */
export function createKeyLabels(piano) {
  // Across the ivory's front, clear of the sharps (~0.28 of it shows), and
  // atop the ebony near its front. Long along the key: seen from the bench
  // the key's top is foreshortened about half, so the letters are drawn
  // tall to read upright there.
  const SIZE = { white: [0.094, 0.22], black: [0.056, 0.17] };
  const TALL = 1.9;
  const materials = new Map(); // "letter|black" -> material
  function material(text, onBlack) {
    const id = `${text}|${onBlack}`;
    if (!materials.has(id)) {
      const [w, l] = SIZE[onBlack ? "black" : "white"];
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = Math.round((128 * l) / w);
      const g = c.getContext("2d");
      const size = onBlack ? 104 : 92;
      g.translate(64, c.height / 2);
      g.scale(1, TALL);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${size}px Jost, system-ui, sans-serif`;
      g.lineJoin = "round";
      g.lineWidth = 10;
      g.strokeStyle = onBlack ? "rgba(0,0,0,0.6)" : "rgba(255,250,238,0.85)";
      g.fillStyle = onBlack ? "#f6ecd6" : "#2e2114";
      g.strokeText(text, 0, 0);
      g.fillText(text, 0, 0);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      materials.set(
        id,
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          toneMapped: false,
        }),
      );
    }
    return materials.get(id);
  }

  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shown = [];
  let visible = false;
  let base = 48;

  function relabel() {
    for (const label of shown.splice(0)) label.removeFromParent();
    if (!visible) return;
    for (let offset = 0; offset <= KEY_SPAN; offset++) {
      const key = piano.midiToKey.get(base + offset);
      if (!key) continue;
      key.geometry.boundingBox ?? key.geometry.computeBoundingBox();
      const { max } = key.geometry.boundingBox;
      const { isBlack } = key.userData;
      const [w, l] = SIZE[isBlack ? "black" : "white"];
      const label = new THREE.Mesh(plane, material(keyLabel(offset), isBlack));
      label.scale.set(w, 1, l);
      // The sharp's front slopes back as it rises (see keyboard.js).
      label.position.set(
        0,
        max.y + 0.002,
        max.z - (isBlack ? 0.045 : 0.035) - l / 2,
      );
      label.renderOrder = 2;
      key.add(label);
      shown.push(label);
    }
  }

  return {
    get visible() {
      return visible;
    },
    setVisible(on) {
      visible = on;
      relabel();
    },
    /** The computer keyboard's range moved: `minMidi` is its lowest note. */
    setRange(minMidi) {
      base = minMidi;
      relabel();
    },
  };
}
