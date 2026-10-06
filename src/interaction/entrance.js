import * as THREE from "three";

/**
 * The way in. A visit opens before the foyer's closed doors (behind the
 * welcome card). On entering, the camera walks up as the doors swing open,
 * glides through and down the centre aisle (those seated nearby turn to
 * watch), then rises and settles on the piano; the doors close behind.
 * Any key, click or the Skip button cuts to the end; with reduced motion
 * there is no walk at all.
 */
const SECONDS = 12;
const OPEN = [1, 4.2]; // the doors swing open over these seconds…
const CLOSE = [9, 12]; // …and shut again once the camera is well inside
const WATCHED = 3; // from here on, the audience turns to look

const ramp = (t, [a, b]) => THREE.MathUtils.smoothstep(t, a, b);

export function createEntrance({ camera, controls, hall, end, onEnd }) {
  const way = hall.entrance;
  const path = new THREE.CatmullRomCurve3(
    [...way.path, end.position],
    false,
    "centripetal",
  );
  let t = -1; // < 0: waiting in the foyer; SECONDS: done
  const ahead = new THREE.Vector3();
  const look = new THREE.Vector3();

  function finish() {
    if (t >= SECONDS) return;
    t = SECONDS;
    camera.position.copy(end.position);
    controls.target.copy(end.target);
    way.setDoors(0);
    way.setLit(false);
    hall.audience.watch(null);
    controls.enabled = true;
    document.body.classList.remove("entering", "foyer");
    onEnd?.();
  }

  return {
    /** Still in the foyer or on the way in: the camera is not the viewer's. */
    get busy() {
      return t < SECONDS;
    },
    get walking() {
      return t >= 0 && t < SECONDS;
    },
    /** Stand before the closed doors, candles lit. */
    hold() {
      t = -1;
      way.setDoors(0);
      way.setLit(true);
      controls.enabled = false;
      document.body.classList.add("foyer");
    },
    start(instant = false) {
      if (instant) return finish();
      t = 0;
      document.body.classList.add("entering");
    },
    /** Cut to the piano (only once the walk has begun). */
    skip() {
      if (t >= 0) finish();
    },
    update(dt) {
      if (t >= SECONDS) return;
      if (t < 0) {
        camera.position.copy(way.position);
        controls.target.copy(way.target);
        camera.lookAt(way.target);
        return;
      }
      if (t + dt >= SECONDS) return finish();
      t += dt;
      // Cubic in and out along the path's length: a slow walk up while the
      // doors open, a glide down the aisle, a gentle arrival.
      const x = t / SECONDS;
      const u = x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
      path.getPointAt(u, camera.position);
      // Look along the way, from the doors at first to the piano at last.
      path.getPointAt(Math.min(1, u + 0.08), ahead);
      ahead.y -= 1.2;
      look
        .copy(way.target)
        .lerp(ahead, THREE.MathUtils.smoothstep(u, 0, 0.14))
        .lerp(end.target, THREE.MathUtils.smoothstep(u, 0.72, 1));
      controls.target.copy(look);
      camera.lookAt(look);
      way.setDoors(t < CLOSE[0] ? ramp(t, OPEN) : 1 - ramp(t, CLOSE));
      way.setLit(t < CLOSE[1] - 1);
      hall.audience.watch(t > WATCHED ? camera.position : null);
    },
  };
}
