import { SONGS, scoreEvents } from "../performance/songs.js";
import { keyLabel } from "../performance/computerKeyboard.js";

/**
 * Two games, played in the music salon (the hall gives way to it round the
 * piano):
 *
 * Falling notes: light columns fall onto the keys of the player's part (the
 * right hand, or both at Hard) and the player strikes each as it lands,
 * judged Perfect or Good by timing, or missed; a combo builds the score.
 * Whatever the player does not play (the other hand, notes out of the
 * computer keyboard's reach) the piano plays for them.
 *
 * Echo: the piano plays a short tune, its keys lit, and the player plays it
 * back; each round adds a note. A wrong note costs a life and the tune is
 * played again.
 *
 * Every input counts: the computer keyboard, a tap on the keys, a MIDI
 * keyboard.
 */
const LEAD_IN = 3; // seconds of score time before the first note lands
const PERFECT = 0.08; // seconds either side, at the player's tempo
const GOOD = 0.2;
const LEVELS = {
  notes: {
    easy: { hands: ["right"], tempo: 0.7 },
    normal: { hands: ["right"], tempo: 1 },
    hard: { hands: ["right", "left"], tempo: 1 },
  },
  echo: {
    easy: { notes: [60, 62, 64, 65, 67], start: 3, gap: 0.75, lives: 3 },
    normal: {
      notes: [60, 62, 64, 65, 67, 69, 71, 72],
      start: 3,
      gap: 0.6,
      lives: 2,
    },
    hard: {
      notes: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
      start: 4,
      gap: 0.5,
      lives: 1,
    },
  },
};
const USER = (group) =>
  group === "computer" || group === "pointer" || group?.startsWith("midi:");
const best = {
  get(key) {
    try {
      return Number(localStorage.getItem(`vgp.best.${key}`)) || 0;
    } catch {
      return 0;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`vgp.best.${key}`, String(value));
    } catch {
      // Private windows may refuse storage: the best is simply not kept.
    }
  },
};

export function createGames({
  camera,
  controls,
  hall,
  player,
  noteEffects,
  keyboard,
  audio,
  view,
  keyAt,
  onEnter,
  onLeave,
}) {
  const $ = (id) => document.getElementById(id);
  const hud = $("gameHud");
  const statA = [$("gameStatALabel"), $("gameStatA")];
  const statB = [$("gameStatBLabel"), $("gameStatB")];
  const progress = $("gameProgress");
  const call = $("gameCall");
  const tip = $("gameTip");
  const results = $("gameResults");
  const fade = $("cinemaFade");

  let mode = null; // "notes" | "echo" | null
  let level = "easy";
  let songIndex = 0;
  let busy = false; // fading between rooms
  let callTimer = 0;
  const game = {}; // the running game's state
  // On a phone held upright the whole keyboard is too small to play: the
  // camera closes in on the keys the game uses.
  let focus = null; // the middle of the game's keys, in world space
  const shift = view.position.clone().set(0, 0, 0);
  const at = shift.clone();
  const lookAt = shift.clone();
  function focusOn(midis) {
    const middle = Math.round((Math.min(...midis) + Math.max(...midis)) / 2);
    focus = keyAt(middle);
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function fadeTo(opacity) {
    fade.style.transition = "opacity 450ms ease";
    fade.style.opacity = String(opacity);
    await wait(470);
    fade.style.transition = "";
  }
  /** A big word in the middle of the screen, for a moment (or until
   *  replaced when `hold`). */
  function say(text, hold = false) {
    call.textContent = text;
    call.classList.remove("pop");
    void call.offsetWidth; // restart the pop
    call.classList.add("pop");
    callTimer = hold ? Infinity : 0.9;
  }
  function stats(a, b) {
    statA[0].textContent = a[0];
    statA[1].textContent = a[1];
    statB[0].textContent = b[0];
    statB[1].textContent = b[1];
  }

  /** Shift the computer keyboard to reach as many of `midis` as it can. */
  function fitKeyboard(midis) {
    const reach = (base) =>
      midis.filter((m) => m >= base && m <= base + 29).length;
    const { minMidi } = keyboard.range;
    let bestShift = 0;
    for (const k of [-2, -1, 1, 2]) {
      const base = minMidi + 12 * k;
      if (base < 21 || base + 29 > 108) continue;
      if (reach(base) > reach(minMidi + 12 * bestShift)) bestShift = k;
    }
    for (let i = 0; i < Math.abs(bestShift); i++)
      keyboard.shiftOctave(Math.sign(bestShift));
  }

  // --- Falling notes ---------------------------------------------------------
  function startNotes() {
    const { hands, tempo } = LEVELS.notes[level];
    const all = scoreEvents(SONGS[songIndex]);
    fitKeyboard(all.filter((e) => hands.includes(e.hand)).map((e) => e.midi));
    const { minMidi, maxMidi } = keyboard.range;
    const playable = (e) =>
      hands.includes(e.hand) && e.midi >= minMidi && e.midi <= maxMidi;
    Object.assign(game, {
      tempo,
      t: -LEAD_IN,
      notes: all.filter(playable).map((e) => ({ ...e, result: null })),
      backing: all.filter((e) => !playable(e)),
      backed: 0,
      missed: 0, // index: every note before it is judged or missed
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      count: 0,
      end: all.reduce((end, e) => Math.max(end, e.time + e.duration), 0),
      over: false,
    });
    noteEffects.start(game.notes);
    focusOn(game.notes.map((e) => e.midi));
    stats(["Score", "0"], ["Combo", "0"]);
    tip.textContent =
      hands.length > 1
        ? "Both hands: press each key as its light lands."
        : "Right hand: press each key as its light lands. The piano plays the rest.";
  }

  function hitNotes(midi) {
    if (game.t < -GOOD) return;
    let match = null;
    for (let i = game.missed; i < game.notes.length; i++) {
      const note = game.notes[i];
      if (note.time - game.t > GOOD * game.tempo) break;
      if (note.result || note.midi !== midi) continue;
      if (
        !match ||
        Math.abs(note.time - game.t) < Math.abs(match.time - game.t)
      )
        match = note;
    }
    if (!match) return; // a stray note just sounds
    const off = Math.abs(match.time - game.t) / game.tempo;
    match.result = off <= PERFECT ? "perfect" : "good";
    game[match.result]++;
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.score += Math.round(
      (match.result === "perfect" ? 300 : 100) *
        (1 + Math.min(game.combo, 50) / 50),
    );
    say(match.result === "perfect" ? "Perfect!" : "Good");
    stats(
      ["Score", game.score.toLocaleString()],
      ["Combo", String(game.combo)],
    );
  }

  function updateNotes(dt) {
    if (game.over) return;
    const before = game.t;
    game.t += dt * game.tempo;
    if (before < 0 && game.t < 0) {
      const count = Math.ceil((-game.t / LEAD_IN) * 3);
      if (Math.ceil((-before / LEAD_IN) * 3) !== count) say(String(count));
    } else if (before < 0) say("Go!");
    // The piano's part.
    while (
      game.backed < game.backing.length &&
      game.backing[game.backed].time <= game.t
    ) {
      const e = game.backing[game.backed++];
      player.playMidi(
        e.midi,
        e.duration / game.tempo,
        e.velocity * 0.85,
        "game",
      );
    }
    // Notes gone by unplayed.
    while (game.missed < game.notes.length) {
      const note = game.notes[game.missed];
      if (!note.result && game.t - note.time <= GOOD * game.tempo) break;
      if (!note.result) {
        note.result = "miss";
        if (game.combo >= 5) say("Miss");
        game.combo = 0;
        stats(["Score", game.score.toLocaleString()], ["Combo", "0"]);
      }
      game.missed++;
    }
    progress.style.width = `${Math.max(0, Math.min(1, game.t / game.end)) * 100}%`;
    if (game.t > game.end + 1.2) finishNotes();
  }

  function finishNotes() {
    game.over = true;
    noteEffects.stop();
    const total = game.notes.length || 1;
    // Stars by the percentage shown, so 90% always earns three.
    const accuracy = Math.round(
      ((game.perfect + 0.5 * game.good) / total) * 100,
    );
    const stars =
      accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0;
    const key = `notes.${SONGS[songIndex].id}.${level}`;
    const previous = best.get(key);
    if (game.score > previous) best.set(key, game.score);
    showResults({
      stars,
      lines: [
        ["Score", game.score.toLocaleString()],
        ["Accuracy", `${accuracy}%`],
        ["Perfect / Good", `${game.perfect} / ${game.good}`],
        ["Best combo", String(game.maxCombo)],
        [
          "Your best",
          game.score > previous
            ? "New best!"
            : Math.max(previous, game.score).toLocaleString(),
        ],
      ],
    });
  }

  // --- Echo --------------------------------------------------------------------
  function startEcho() {
    const cfg = LEVELS.echo[level];
    fitKeyboard(cfg.notes);
    focusOn(cfg.notes);
    const { minMidi } = keyboard.range;
    Object.assign(game, {
      cfg,
      seq: Array.from({ length: cfg.start - 1 }, () => pick(cfg.notes)),
      lives: cfg.lives,
      remembered: 0,
      phase: "pause",
      clock: 0,
      delay: 0.6,
    });
    tip.textContent = `Your keys: ${cfg.notes
      .map((m) => keyLabel(m - minMidi) ?? "")
      .join(" ")} — or tap the keys that light up.`;
    nextRound();
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  function echoStats() {
    stats(
      ["Notes", String(game.seq.length)],
      ["Lives", `${game.lives} / ${game.cfg.lives}`],
    );
  }
  function nextRound() {
    game.seq.push(pick(game.cfg.notes));
    playTune();
  }
  function playTune() {
    const { gap } = game.cfg;
    game.phase = "demo";
    game.clock = -1.2; // the first light is already falling
    game.played = 0;
    game.events = game.seq.map((midi, i) => ({
      time: i * gap,
      duration: gap * 0.7,
      midi,
      hand: "right",
    }));
    noteEffects.start(game.events);
    echoStats();
    say("Listen…", true);
  }
  function updateEcho(dt) {
    if (game.phase === "pause") {
      game.delay -= dt;
      if (game.delay <= 0) game.next();
      return;
    }
    if (game.phase !== "demo") return;
    game.clock += dt;
    while (
      game.played < game.events.length &&
      game.events[game.played].time <= game.clock
    ) {
      const e = game.events[game.played++];
      player.playMidi(e.midi, game.cfg.gap * 0.8, 0.7, "game");
    }
    const last = game.events.at(-1);
    if (game.clock > last.time + game.cfg.gap) {
      noteEffects.stop();
      game.phase = "turn";
      game.step = 0;
      say("Your turn!", true);
    }
  }
  function pause(seconds, next) {
    game.phase = "pause";
    game.delay = seconds;
    game.next = next;
  }
  function hitEcho(midi) {
    if (game.phase !== "turn") return;
    if (midi === game.seq[game.step]) {
      game.step++;
      if (game.step < game.seq.length) return;
      game.remembered = game.seq.length;
      say(game.seq.length % 5 === 0 ? "Bravo!" : "Great!");
      pause(1.1, nextRound);
      return;
    }
    game.lives--;
    echoStats();
    if (game.lives <= 0) {
      game.phase = "over";
      say("Oh!");
      pause(0.9, finishEcho);
      return;
    }
    say("Oops! Listen again", true);
    pause(1.3, playTune);
  }
  function finishEcho() {
    game.phase = "over";
    const n = game.remembered;
    const start = game.cfg.start;
    const stars = n >= start + 6 ? 3 : n >= start + 3 ? 2 : n >= start ? 1 : 0;
    const key = `echo.${level}`;
    const previous = best.get(key);
    if (n > previous) best.set(key, n);
    showResults({
      stars,
      lines: [
        ["Tune remembered", n ? `${n} notes` : "Not yet"],
        [
          "Your best",
          n > previous ? "New best!" : `${Math.max(previous, n)} notes`,
        ],
      ],
    });
  }

  // --- Results -----------------------------------------------------------------
  function showResults({ stars, lines }) {
    say("");
    const titles = [
      "Keep practising!",
      "Well played!",
      "Bravo!",
      "Magnificent!",
    ];
    $("gameResultsTitle").textContent = titles[stars];
    $("gameStars").replaceChildren(
      ...[0, 1, 2].map((k) => {
        const star = document.createElement("span");
        star.className = k < stars ? "star on" : "star";
        return star;
      }),
    );
    $("gameStars").setAttribute("aria-label", `${stars} of 3 stars`);
    $("gameResultsLines").replaceChildren(
      ...lines.flatMap(([term, value]) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = term;
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    if (stars)
      audio.playEffect("audio/hall/applause.ogg", {
        gain: 0.15 + 0.12 * stars,
      });
    results.showModal();
  }

  // --- Entering and leaving the salon ---------------------------------------------
  function begin() {
    for (const key of Object.keys(game)) delete game[key];
    progress.style.width = "0%";
    if (mode === "notes") startNotes();
    else startEcho();
  }
  async function start(kind, options = {}) {
    if (busy) return;
    busy = true;
    level = options.level ?? level;
    songIndex = options.song ?? songIndex;
    onEnter();
    if (!mode) {
      await fadeTo(1);
      hall.setRoom("salon");
      noteEffects.setLane(true);
      document.body.classList.add("game");
      hud.hidden = false;
      controls.enabled = false;
    }
    mode = kind;
    hud.dataset.mode = kind;
    begin();
    if (fade.style.opacity !== "0") await fadeTo(0);
    busy = false;
  }
  async function leave() {
    if (!mode || busy) return;
    busy = true;
    if (results.open) results.close();
    mode = null;
    noteEffects.stop();
    player.stopSource("game");
    await fadeTo(1);
    hall.setRoom("hall");
    noteEffects.setLane(false);
    document.body.classList.remove("game");
    hud.hidden = true;
    controls.enabled = true;
    say("");
    onLeave();
    await fadeTo(0);
    busy = false;
  }

  player.addObserver((event) => {
    if (!mode || event.type !== "noteOn" || !USER(event.sourceGroup)) return;
    if (mode === "notes") hitNotes(event.midi);
    else hitEcho(event.midi);
  });
  $("gameExitBtn").onclick = leave;
  $("gameAgainBtn").onclick = () => {
    results.close();
    player.stopSource("game");
    begin();
  };
  $("gameBackBtn").onclick = leave;
  results.addEventListener("cancel", (event) => {
    event.preventDefault();
    leave();
  });
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mode && !results.open) leave();
  });

  return {
    get active() {
      return mode !== null;
    },
    /** Score time for the falling columns, or null when none fall. */
    get songTime() {
      if (mode === "notes" && !game.over) return game.t;
      if (mode === "echo" && game.phase === "demo") return game.clock;
      return null;
    },
    /** "notes" or "echo"; options: { level, song } (the song's index). */
    start,
    leave,
    update(dt) {
      if (!mode) return;
      // Upright, close in (zoom 1) and slide along the keys to the game's.
      const upright = camera.aspect < 1;
      const zoom = upright ? 1 : Math.min(1, camera.aspect / 1.6);
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
      shift.set(0, 0, 0);
      if (upright && focus) {
        // Along the keyboard only: it runs along z, side-on on the stage.
        shift.set(0, 0, focus.z - view.target.z);
      }
      at.addVectors(view.position, shift);
      lookAt.addVectors(view.target, shift);
      if (upright) lookAt.y -= 1.1; // the keys up off the screen's foot
      camera.position.copy(at);
      controls.target.copy(lookAt);
      camera.lookAt(lookAt);
      if (callTimer !== Infinity && (callTimer -= dt) <= 0)
        call.classList.remove("pop");
      if (mode === "notes" && game.notes) updateNotes(dt);
      if (mode === "echo" && game.cfg) updateEcho(dt);
    },
  };
}
