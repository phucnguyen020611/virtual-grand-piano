import * as THREE from "three";

/**
 * Cinema mode: the camera is handed to a director who cuts between slow,
 * eased shots of the hall (each a move from one framing to another, through
 * an optional waypoint), dipping to black at every cut, while the screen is
 * letterboxed to 2.39:1 and the HUD steps aside. A finale shot can close the
 * film before it ends by itself. With reduced motion, every shot holds still.
 *
 * A shot: { from: [position, target], to: [position, target], via?: position,
 *           seconds }
 */
const DIP = 0.45; // seconds of black either side of a cut

export function createCinematic({ camera, controls, onEnd }) {
  const fade = document.querySelector("#cinemaFade");
  const caption = document.querySelector("#cinemaCaption");
  let shots = [];
  let index = 0;
  let t = 0; // seconds into the current shot
  let active = false;
  let ending = false; // playing the finale, then stopping
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  function begin(i) {
    index = i;
    t = 0;
  }

  function stop() {
    if (!active) return;
    active = false;
    ending = false;
    controls.enabled = true;
    document.body.classList.remove("cinema");
    fade.style.opacity = "0";
    onEnd?.();
  }

  return {
    get active() {
      return active;
    },
    /** Roll the shots in order, round and round, under `title`. */
    start(list, title) {
      shots = list;
      active = true;
      ending = false;
      controls.enabled = false;
      caption.textContent = title;
      document.body.classList.add("cinema");
      begin(0);
    },
    stop,
    /** Cut to `shot` and end the film when it is done. */
    finale(shot) {
      if (!active) return;
      shots = [shot];
      ending = true;
      begin(0);
    },
    update(dt, still = false) {
      if (!active) return;
      const shot = shots[index];
      t += dt;
      if (t >= shot.seconds) {
        if (ending) return stop();
        begin((index + 1) % shots.length);
        return;
      }
      const u = still ? 0.5 : t / shot.seconds;
      const e = u * u * (3 - 2 * u); // ease in and out
      const [p0, t0] = shot.from;
      const [p1, t1] = shot.to;
      if (shot.via) {
        // A curved move: quadratic Bézier through the waypoint.
        a.lerpVectors(p0, shot.via, e);
        b.lerpVectors(shot.via, p1, e);
        position.lerpVectors(a, b, e);
      } else position.lerpVectors(p0, p1, e);
      target.lerpVectors(t0, t1, e);
      camera.position.copy(position);
      controls.target.copy(target);
      camera.lookAt(target);
      // Dip to black into and out of every cut.
      const edge = Math.min(t, shot.seconds - t);
      fade.style.opacity = String(Math.max(0, 1 - edge / DIP));
    },
  };
}
