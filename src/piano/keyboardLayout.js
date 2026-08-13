import { DIM } from "./geometry.js";

export const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/** Shared 88-note geometry contract for keys, hammers, and dampers. */
export function createKeyboardLayout() {
  const whiteWidth = DIM.keyboardWidth / 52;
  const whiteX = new Map();
  let whiteIndex = 0;
  for (let midi = 21; midi <= 108; midi++) {
    if (!BLACK_PITCH_CLASSES.has(midi % 12)) {
      whiteX.set(
        midi,
        -DIM.keyboardWidth / 2 + whiteWidth / 2 + whiteIndex * whiteWidth,
      );
      whiteIndex++;
    }
  }

  return Array.from({ length: 88 }, (_, index) => {
    const midi = index + 21;
    const isBlack = BLACK_PITCH_CLASSES.has(midi % 12);
    let x = whiteX.get(midi);
    if (isBlack) {
      let previous = midi - 1;
      let next = midi + 1;
      while (!whiteX.has(previous)) previous--;
      while (!whiteX.has(next)) next++;
      x = (whiteX.get(previous) + whiteX.get(next)) / 2;
    }
    const keyLength = isBlack ? 0.64 : 1.02;
    const centerZ = isBlack ? 2.24 : 2.54;
    const pivotZ = centerZ - keyLength * 0.42;
    return {
      midi,
      isBlack,
      x,
      width: whiteWidth * (isBlack ? 0.56 : 0.92),
      height: isBlack ? 0.12 : 0.09,
      keyLength,
      centerZ,
      pivotZ,
      restY: isBlack ? DIM.blackKeyTopY : DIM.whiteKeyTopY,
      travelRotation: isBlack ? 0.09 : 0.12,
    };
  });
}
