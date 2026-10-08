import * as THREE from "three";

/**
 * Walking about in the first person. The room says where one can stand
 * (`floorsAt(x, z)`: the floors there, or none at a wall or a seat); the
 * walker keeps to the floor nearest its feet, climbs no more than a step
 * and steps down no more than one (so the stage's edge and the balconies'
 * rails hold it: the way up is the stairs), and does not walk into
 * `obstacles` (boxes, such as the piano and its bench).
 *
 * W A S D or the arrows to walk (the left and right arrows turn), Shift to
 * hurry; drag to look about. On a touch screen, a stick at the left to walk
 * and a drag anywhere else to look.
 */
const EYE = 7.4; // ~1.55 m above the floor, in scene units (~0.21 m)
const SPEED = 9; // ~1.9 m/s; Shift for ~1.8 times
const STEP = 1; // the most a stride climbs or drops
const TURN = 2; // radians per second, on the arrow keys
const RADIUS = 0.7; // round an obstacle
const KEYS = {
  KeyW: [1, 0, 0],
  ArrowUp: [1, 0, 0],
  KeyS: [-1, 0, 0],
  ArrowDown: [-1, 0, 0],
  KeyA: [0, -1, 0],
  KeyD: [0, 1, 0],
  ArrowLeft: [0, 0, 1],
  ArrowRight: [0, 0, -1],
};

export function createWalker({ camera, canvas, room, stick }) {
  const feet = new THREE.Vector3();
  // The eye follows the feet up and down a step smoothly (a tier, a stair),
  // not in one jump: taken at a stride, each is ~15 cm.
  let eyeY = 0;
  let yaw = 0; // 0: looking along -z
  let pitch = 0;
  let turnTo = null; // { yaw, pitch }: a head turn in progress
  let obstacles = [];
  let active = false;
  const held = new Set();
  const velocity = new THREE.Vector2();
  let hurry = false;
  const push = new THREE.Vector2(); // the touch stick, -1…1 each way

  /** The floor to stand on at (x, z) from `from` (the feet's height), or
   *  null if none is within a step of it, or something stands in the way. */
  function standAt(x, z, from) {
    for (const box of obstacles)
      if (
        x > box.min.x - RADIUS &&
        x < box.max.x + RADIUS &&
        z > box.min.z - RADIUS &&
        z < box.max.z + RADIUS
      )
        return null;
    let best = null;
    for (const y of room.floorsAt(x, z))
      if (
        y <= from + STEP &&
        y >= from - STEP &&
        (best === null || Math.abs(y - from) < Math.abs(best - from))
      )
        best = y;
    return best;
  }

  // Looking: a drag on the scene turns the head.
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (active) drag = [event.clientX, event.clientY];
  });
  addEventListener("pointermove", (event) => {
    if (!drag || !active) return;
    const speed = event.pointerType === "touch" ? 0.006 : 0.004;
    yaw -= (event.clientX - drag[0]) * speed;
    pitch = THREE.MathUtils.clamp(
      pitch - (event.clientY - drag[1]) * speed,
      -1.2,
      1.2,
    );
    drag = [event.clientX, event.clientY];
    turnTo = null;
  });
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointercancel", () => (drag = null));

  // Walking: keys, or the touch stick.
  addEventListener("keydown", (event) => {
    hurry = event.shiftKey;
    if (!active || !KEYS[event.code]) return;
    if (event.target.closest?.("input, select, textarea, dialog")) return;
    event.preventDefault();
    held.add(event.code);
  });
  addEventListener("keyup", (event) => {
    hurry = event.shiftKey;
    held.delete(event.code);
  });
  addEventListener("blur", () => held.clear());
  if (stick) {
    const knob = stick.firstElementChild;
    let id = null;
    const move = (event) => {
      const box = stick.getBoundingClientRect();
      const r = box.width / 2;
      push.set(
        (event.clientX - box.left - r) / r,
        (event.clientY - box.top - r) / r,
      );
      if (push.length() > 1) push.normalize();
      knob.style.transform = `translate(${push.x * r * 0.5}px, ${push.y * r * 0.5}px)`;
    };
    stick.addEventListener("pointerdown", (event) => {
      id = event.pointerId;
      stick.setPointerCapture(id);
      move(event);
    });
    stick.addEventListener("pointermove", (event) => {
      if (event.pointerId === id) move(event);
    });
    const release = () => {
      id = null;
      push.set(0, 0);
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
  }

  const look = new THREE.Vector3();
  function place() {
    camera.position.set(feet.x, eyeY, feet.z);
    look.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(look.add(camera.position));
    return look;
  }

  return {
    get active() {
      return active;
    },
    /** The eye, for reaching things. */
    get eye() {
      return camera.position;
    },
    /** Stand at `at` (on the floor there) facing `face` (a point). */
    start(at, face, things = []) {
      obstacles = things.map((thing) => new THREE.Box3().setFromObject(thing));
      const floors = room.floorsAt(at.x, at.z);
      feet.set(at.x, floors[0] ?? at.y, at.z);
      eyeY = feet.y + EYE;
      yaw = Math.atan2(-(face.x - at.x), -(face.z - at.z));
      pitch = 0;
      turnTo = null;
      velocity.set(0, 0);
      active = true;
      place();
    },
    stop() {
      active = false;
      held.clear();
    },
    /** Turn the head toward `point`, smoothly. */
    face(point) {
      const d = point.clone().sub(camera.position);
      turnTo = {
        yaw: Math.atan2(-d.x, -d.z),
        pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
      };
    },
    /** The camera, placed where the walker is; `target` gets the look. */
    update(dt, target) {
      if (!active) return;
      let ahead = push.lengthSq() ? -push.y : 0;
      let side = push.lengthSq() ? push.x : 0;
      let turn = 0;
      for (const code of held) {
        const [a, s, t] = KEYS[code];
        ahead += a;
        side += s;
        turn += t;
      }
      ahead = THREE.MathUtils.clamp(ahead, -1, 1);
      side = THREE.MathUtils.clamp(side, -1, 1);
      if (turn) turnTo = null;
      yaw += turn * TURN * dt;
      if (turnTo) {
        const ease = 1 - Math.exp(-5 * dt);
        const dy = Math.atan2(
          Math.sin(turnTo.yaw - yaw),
          Math.cos(turnTo.yaw - yaw),
        );
        yaw += dy * ease;
        pitch += (turnTo.pitch - pitch) * ease;
        if (Math.abs(dy) < 0.002 && Math.abs(turnTo.pitch - pitch) < 0.002)
          turnTo = null;
      }
      // Ease into a stride and out of it.
      const speed = SPEED * (hurry ? 1.8 : 1);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const wishX = (fx * ahead - fz * side) * speed;
      const wishZ = (fz * ahead + fx * side) * speed;
      velocity.lerp({ x: wishX, y: wishZ }, 1 - Math.exp(-10 * dt));
      // Each way on its own, so a wall or a seat is slid along, not stuck to.
      const x = feet.x + velocity.x * dt;
      let y = standAt(x, feet.z, feet.y);
      if (y !== null) feet.set(x, y, feet.z);
      else velocity.x = 0;
      const z = feet.z + velocity.y * dt;
      y = standAt(feet.x, z, feet.y);
      if (y !== null) feet.set(feet.x, y, z);
      else velocity.y = 0;
      eyeY = THREE.MathUtils.damp(eyeY, feet.y + EYE, 14, dt);
      target.copy(place());
    },
  };
}
