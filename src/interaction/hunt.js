import * as THREE from "three";
import { buildTreasure } from "../scene/treasures.js";
import { createWalker } from "./walker.js";

/**
 * The treasure hunt: the eight composers whose portraits hang in the hall
 * have each left a keepsake somewhere in the hall or the salon, in eight of
 * sixteen hiding places drawn afresh for each hunt (and kept until it is
 * done). The visitor walks about in the first person (see walker.js; the
 * salon and back by a button), reads a clue for the next one (where it is,
 * and what to look for), asks to be turned toward it if stuck, and, close
 * enough to reach it, clicks a keepsake to collect it and hear its story.
 *
 * Each keepsake is set down where it lies by dropping a ray onto the room
 * from above its place's `drop`.
 */
const REACH = 16; // ~3.4 m from the eye
const COMPOSERS = [
  {
    composer: "bach",
    name: "Johann Sebastian Bach",
    thing: "Bach's coffee cup",
    look: "someone left a cup of coffee.",
    fact: "Bach loved coffee so much that he wrote a little comic opera about it, the Coffee Cantata, around 1734.",
  },
  {
    composer: "haydn",
    name: "Joseph Haydn",
    thing: "Haydn's pocket watch",
    look: "something is ticking.",
    fact: "Haydn's Symphony No. 101 is nicknamed The Clock, for the steady tick-tock that runs through its slow movement.",
  },
  {
    composer: "liszt",
    name: "Franz Liszt",
    thing: "Liszt's white gloves",
    look: "a pair of white gloves was dropped.",
    fact: "It is told that Liszt peeled off his white gloves and dropped them on the floor before he played, and admirers rushed to keep them.",
  },
  {
    composer: "mozart",
    name: "Wolfgang Amadeus Mozart",
    thing: "Mozart's magic flute",
    look: "a flute waits for its player.",
    fact: "Mozart's last opera, The Magic Flute (1791), is about a flute that turns danger into dance.",
  },
  {
    composer: "beethoven",
    name: "Ludwig van Beethoven",
    thing: "Beethoven's ear trumpet",
    look: "a horn for listening lies forgotten.",
    fact: "As he grew deaf, Beethoven used ear trumpets made by Johann Mälzel, who also made the metronome, and he kept on composing.",
  },
  {
    composer: "chopin",
    name: "Frédéric Chopin",
    thing: "Chopin's little dog",
    look: "a little dog sits quietly.",
    fact: "Chopin's Minute Waltz is also called the Waltz of the Little Dog: George Sand's dog, chasing its own tail.",
  },
  {
    composer: "debussy",
    name: "Claude Debussy",
    thing: "Debussy's moon",
    look: "the moon came down to rest.",
    fact: "Clair de lune, moonlight, is the best-loved piece of Debussy's Suite bergamasque.",
  },
  {
    composer: "schubert",
    name: "Franz Schubert",
    thing: "Schubert's spectacles",
    look: "someone has lost their glasses.",
    fact: "Schubert is said to have slept with his glasses on, so he could start writing music the moment he woke.",
  },
];
/** Where things can be hidden: every one within the walker's reach. Left
 *  and right as seen facing the stage (in the salon, facing the fire). */
export const PLACES = [
  {
    room: "hall",
    drop: [-12, 12, -23.2],
    where: "On the gilded ledge below the organ pipes, on the left:",
  },
  {
    room: "hall",
    drop: [12, 12, -23.2],
    where: "On the gilded ledge below the organ pipes, on the right:",
  },
  {
    room: "hall",
    drop: [1.6, 6, 14.3],
    where: "On the steps up to the stage:",
  },
  {
    room: "hall",
    drop: [-22, 3, 9],
    where: "At the front of the stage, on the left:",
  },
  {
    room: "hall",
    drop: [24, 3, -12],
    where: "At the back of the stage, on the right:",
  },
  {
    room: "hall",
    drop: [-12, 3, 15],
    where: "In front of the first row, on the left:",
  },
  {
    room: "hall",
    drop: [0.4, 14, 94],
    where: "At the very back of the centre aisle, by the doors:",
  },
  {
    room: "hall",
    drop: [-31, 10, 40],
    where: "Along the left wall, under the balcony:",
  },
  {
    room: "hall",
    drop: [31, 10, 56],
    where: "Along the right wall, under the balcony:",
  },
  {
    room: "hall",
    drop: [-31.5, 40, 60],
    where: "Up the stairs at the back, on the left balcony:",
  },
  {
    room: "hall",
    drop: [31.5, 40, 74.5],
    where: "Up the stairs at the back, on the right balcony:",
  },
  {
    room: "salon",
    drop: [17, 7.6, 1.2],
    where: "In the salon, up on the mantelpiece:",
  },
  {
    room: "salon",
    drop: [4.5, 5, 12.4],
    where: "In the salon, under the window nearer the fire:",
  },
  {
    room: "salon",
    drop: [-4.5, 5, 12.4],
    where: "In the salon, under the window farther from the fire:",
  },
  {
    room: "salon",
    drop: [-13, 5, -11],
    where: "In the salon, in the corner behind the pianist:",
  },
  {
    room: "salon",
    drop: [13.5, 3, -7],
    where: "In the salon, on the floor beside the fireplace:",
  },
];
/** Where the walker stands, and what it faces, on arriving in each room. */
const ARRIVE = {
  hall: [new THREE.Vector3(0, 0, 46), new THREE.Vector3(0, 6, 0)],
  salon: [new THREE.Vector3(-9, 0, 7), new THREE.Vector3(17, 6, 0)],
  stage: [new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 8, 60)],
};

/** Eight places drawn from the sixteen, one for each composer. */
function draw() {
  const order = PLACES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Object.fromEntries(COMPOSERS.map((c, i) => [c.composer, order[i]]));
}
/** The hunt in hand: what is found, and where everything was hidden. */
const store = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem("vgp.hunt"));
      const found = new Set(
        saved.found.filter((id) => COMPOSERS.some((c) => c.composer === id)),
      );
      const places = saved.places;
      if (COMPOSERS.every((c) => PLACES[places[c.composer]]))
        return { found, places };
    } catch {
      // Nothing kept (or kept in an older form): a fresh hunt.
    }
    return { found: new Set(), places: draw() };
  },
  save({ found, places }) {
    try {
      localStorage.setItem(
        "vgp.hunt",
        JSON.stringify({ found: [...found], places }),
      );
    } catch {
      // Private windows may refuse storage: the hunt lasts for this visit.
    }
  },
};

export function createHunt({
  camera,
  controls,
  canvas,
  hall,
  audio,
  obstacles,
  onEnter,
  onLeave,
}) {
  const $ = (id) => document.getElementById(id);
  const hud = $("huntHud");
  const fade = $("cinemaFade");
  const card = $("huntFound");
  const walker = createWalker({
    camera,
    canvas,
    room: hall,
    stick: $("walkStick"),
  });
  let notice = 0; // seconds a notice stays in place of the clue
  const hunt = store.load(); // { found, places }
  const { found } = hunt;
  let active = false;
  let busy = false;
  let room = "hall";
  let clock = 0;

  // Set each keepsake down on whatever lies beneath its drop point.
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  ray.camera = camera; // the rooms hold sprites (glows) too
  const crowd = new Set(hall.audience.meshes);
  hall.group.parent.updateMatrixWorld(true);
  const resting = PLACES.map((place) => {
    ray.set(new THREE.Vector3(...place.drop), down);
    const hit = ray
      .intersectObject(hall.rooms[place.room], true)
      .find((h) => !crowd.has(h.object) && !h.object.isSprite);
    return hit?.point ?? new THREE.Vector3(...place.drop);
  });
  const items = COMPOSERS.map((info) => {
    const item = buildTreasure(info.composer);
    item.visible = false;
    item.userData.info = info;
    return item;
  });
  /** Set every keepsake down in its place, turned toward the room. */
  function hide() {
    for (const item of items) {
      const index = hunt.places[item.userData.composer];
      const place = PLACES[index];
      const at = resting[index];
      const middle = place.room === "hall" ? [0, 40] : [0, 0];
      item.userData.place = place;
      delete item.userData.taken;
      item.position.copy(at);
      item.scale.setScalar(1);
      item.rotation.y =
        Math.atan2(middle[0] - at.x, middle[1] - at.z) +
        (Math.random() - 0.5) * 0.8;
      hall.rooms[place.room].add(item);
    }
  }
  hide();
  const waiting = () =>
    items.filter((item) => !found.has(item.userData.composer));

  // The bar: how many, a slot for each composer, the clue for the next.
  const slots = $("huntSlots");
  slots.replaceChildren(
    ...COMPOSERS.map((info) => {
      const slot = document.createElement("span");
      slot.className = "huntSlot";
      slot.dataset.composer = info.composer;
      slot.title = info.name;
      slot.textContent = info.name.split(" ").at(-1).slice(0, 2); // Ba, Be…
      return slot;
    }),
  );
  function show() {
    $("huntCount").textContent = `${found.size} / ${COMPOSERS.length}`;
    for (const slot of slots.children)
      slot.classList.toggle("found", found.has(slot.dataset.composer));
    const next =
      waiting().find((item) => item.userData.place.room === room) ??
      waiting()[0];
    // Where, then what to look for: each its own phrase (to translate).
    const phrase = (text) =>
      Object.assign(document.createElement("span"), { textContent: text });
    if (next)
      $("huntClue").replaceChildren(
        phrase(next.userData.place.where),
        " ",
        phrase(next.userData.info.look),
      );
    else $("huntClue").textContent = "You found every treasure. Bravo!";
    $("huntHintBtn").disabled = !next;
    $("huntRoomBtn").textContent =
      room === "hall" ? "Go to the salon" : "Back to the hall";
    document.querySelector("#huntProgress").textContent =
      `${found.size} of ${COMPOSERS.length} found`;
    document.querySelector("#huntStartBtn").textContent =
      found.size === COMPOSERS.length
        ? "Hide them again"
        : found.size
          ? "Carry on the hunt"
          : "Start the hunt";
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function fadeTo(opacity) {
    fade.style.transition = "opacity 450ms ease";
    fade.style.opacity = String(opacity);
    await wait(470);
    fade.style.transition = "";
  }
  /** Through a dip to black to `next` room ("hall" or "salon"), standing
   *  at `arrive` there (the room's own arrival by default). */
  async function goTo(next, arrive = ARRIVE[next]) {
    busy = true;
    await fadeTo(1);
    room = next;
    hall.setRoom(next);
    audio.setRoom(next);
    walker.start(...arrive, obstacles);
    show();
    await fadeTo(0);
    busy = false;
  }

  async function start() {
    if (active || busy) return;
    if (found.size === COMPOSERS.length) {
      // Hide them all again, somewhere new.
      found.clear();
      hunt.places = draw();
      store.save(hunt);
      hide();
    }
    store.save(hunt); // the places stand until the hunt is done
    onEnter();
    active = true;
    busy = true;
    await fadeTo(1);
    controls.enabled = false;
    document.body.classList.add("hunt");
    hud.hidden = false;
    for (const item of waiting()) item.visible = true;
    walker.start(...ARRIVE.hall, obstacles);
    show();
    await fadeTo(0);
    busy = false;
    canvas.focus({ preventScroll: true });
  }
  async function leave() {
    if (!active || busy) return;
    if (card.open) card.close();
    active = false;
    busy = true;
    await fadeTo(1);
    walker.stop();
    for (const item of items) item.visible = false;
    if (room !== "hall") {
      room = "hall";
      hall.setRoom("hall");
      audio.setRoom("hall");
    }
    document.body.classList.remove("hunt");
    hud.hidden = true;
    controls.enabled = true;
    show();
    onLeave();
    await fadeTo(0);
    busy = false;
  }
  /** "Show me": turn toward the next keepsake (in its room). */
  async function hint() {
    const item =
      waiting().find((i) => i.userData.place.room === room) ?? waiting()[0];
    if (!item || busy) return;
    if (item.userData.place.room !== room) await goTo(item.userData.place.room);
    walker.face(
      item.getWorldPosition(new THREE.Vector3()).setY(item.position.y + 0.5),
    );
  }
  /** A word in place of the clue for a moment. */
  function say(text) {
    $("huntClue").textContent = text;
    notice = 2.5;
  }

  // A click, not a drag, on a keepsake (or its sparkle) collects it.
  const pointer = new THREE.Vector2();
  let pressed = null;
  canvas.addEventListener("pointerdown", (event) => {
    pressed = active ? [event.clientX, event.clientY] : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pressed || busy || card.open) return;
    const moved = Math.hypot(
      event.clientX - pressed[0],
      event.clientY - pressed[1],
    );
    pressed = null;
    if (moved > 6) return;
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const shown = items.filter(
      (item) => item.visible && item.userData.taken === undefined,
    );
    const hit = ray.intersectObjects(shown, true)[0];
    if (!hit) return;
    let item = hit.object;
    while (!item.userData.info) item = item.parent;
    if (hit.distance > REACH) say("Come closer to pick it up.");
    else collect(item);
  });

  function collect(item) {
    const spot = item.userData.info;
    item.userData.taken = 0; // seconds into its lift
    found.add(spot.composer);
    store.save(hunt);
    audio.playEffect("audio/hall/chime.ogg", { gain: 0.3, rate: 1.5 });
    $("huntFoundComposer").textContent = spot.name;
    $("huntFoundTitle").textContent = spot.thing;
    $("huntFoundFact").textContent = spot.fact;
    const all = found.size === COMPOSERS.length;
    $("huntOnBtn").textContent = all ? "Back to the hall" : "Keep looking";
    if (all)
      audio.playEffect("audio/hall/applause.ogg", {
        gain: 0.45,
        crowd: room === "hall",
      });
    show();
    setTimeout(() => card.showModal(), 650);
  }
  $("huntOnBtn").onclick = () => {
    card.close();
    if (found.size === COMPOSERS.length) leave();
  };
  $("huntHintBtn").onclick = hint;
  $("huntRoomBtn").onclick = () =>
    !busy &&
    goTo(
      room === "hall" ? "salon" : "hall",
      room === "salon" ? ARRIVE.stage : ARRIVE.salon,
    );
  $("huntExitBtn").onclick = leave;
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active && !card.open) leave();
  });
  show();

  return {
    get active() {
      return active;
    },
    /** The room the hunt is in ("hall" or "salon"). */
    get room() {
      return room;
    },
    start,
    leave,
    update(dt) {
      clock += dt;
      if (active && !busy && !card.open) walker.update(dt, controls.target);
      if (notice > 0 && (notice -= dt) <= 0) show();
      for (const item of items) {
        if (!item.visible) continue;
        const { glint } = item.userData;
        // The sparkle breathes, each in its own time.
        const breath = 0.5 + 0.5 * Math.sin(clock * 2.4 + item.id);
        glint.scale.setScalar(1.1 + 0.7 * breath);
        glint.material.opacity = 0.45 + 0.55 * breath;
        // A found keepsake rises, shrinks and is gone.
        if (item.userData.taken === undefined) continue;
        const t = (item.userData.taken += dt) / 0.6;
        item.position.y += dt * 2.5;
        item.scale.setScalar(Math.max(0, 1 - t * t));
        if (t >= 1) item.visible = false;
      }
    },
  };
}
