const USER_SOURCE = (group) =>
  group === "computer" || group === "pointer" || group?.startsWith("midi:");

/** In-memory event recorder; recordings are musical events, never audio data. */
export function createPerformanceRecorder(controller) {
  let recording = false;
  let playback = false;
  let startedAt = 0;
  let recordingData = null;
  let playbackIndex = 0;
  let playbackTimer = null;
  let playbackSequence = 0;
  const liveNotes = new Map();
  const liveSustain = new Set();
  const stateListeners = new Set();

  function notify() {
    for (const listener of stateListeners) listener();
  }

  function elapsed() {
    return Math.max(0, Math.round(performance.now() - startedAt));
  }

  function append(event) {
    recordingData.events.push({ t: elapsed(), ...event });
  }

  function observe(event) {
    if (!recording || !USER_SOURCE(event.sourceGroup)) return;
    if (event.type === "noteOn") {
      const id = `n${recordingData.events.length}`;
      liveNotes.set(event.sourceToken, { id, midi: event.midi });
      append({
        type: "noteOn",
        id,
        midi: event.midi,
        velocity: event.velocity,
      });
    } else if (event.type === "noteOff") {
      const note = liveNotes.get(event.sourceToken);
      if (!note) return;
      liveNotes.delete(event.sourceToken);
      append({ type: "noteOff", id: note.id, midi: note.midi });
    } else if (event.type === "sustain") {
      const wasDown = liveSustain.size > 0;
      if (event.down) liveSustain.add(event.sourceToken);
      else liveSustain.delete(event.sourceToken);
      const isDown = liveSustain.size > 0;
      if (wasDown !== isDown) append({ type: "sustain", down: isDown });
    }
  }

  const unsubscribe = controller.addObserver(observe);

  function start() {
    if (recording) return;
    stopPlayback();
    recording = true;
    startedAt = performance.now();
    recordingData = { version: 1, durationMs: 0, events: [] };
    liveNotes.clear();
    liveSustain.clear();
    notify();
  }

  function stop() {
    if (!recording) return recordingData;
    const t = elapsed();
    for (const { id, midi } of liveNotes.values())
      recordingData.events.push({ t, type: "noteOff", id, midi });
    if (liveSustain.size)
      recordingData.events.push({ t, type: "sustain", down: false });
    recordingData.durationMs = t;
    liveNotes.clear();
    liveSustain.clear();
    recording = false;
    notify();
    return recordingData;
  }

  function applyPlaybackEvent(event) {
    if (event.type === "noteOn") {
      controller.noteOn(
        event.midi,
        event.velocity,
        `recording:${playbackSequence}:${event.id}`,
        "recording",
      );
    } else if (event.type === "noteOff") {
      controller.noteOff(
        event.midi,
        `recording:${playbackSequence}:${event.id}`,
      );
    } else if (event.type === "sustain") {
      controller.setSustainForSource(
        "recording:pedal",
        event.down,
        "recording",
      );
    }
  }

  function scheduleNext(playbackStartedAt) {
    if (!playback) return;
    const event = recordingData.events[playbackIndex];
    if (!event) {
      playback = false;
      controller.stopSource("recording");
      notify();
      return;
    }
    const delay = Math.max(
      0,
      event.t - (performance.now() - playbackStartedAt),
    );
    playbackTimer = setTimeout(() => {
      if (!playback) return;
      applyPlaybackEvent(event);
      playbackIndex++;
      scheduleNext(playbackStartedAt);
    }, delay);
  }

  function play() {
    if (recording || !recordingData?.events.length || playback) return false;
    playback = true;
    playbackIndex = 0;
    playbackSequence++;
    scheduleNext(performance.now());
    notify();
    return true;
  }

  function stopPlayback() {
    if (playbackTimer) clearTimeout(playbackTimer);
    playbackTimer = null;
    playback = false;
    controller.stopSource("recording");
    notify();
  }

  return {
    start,
    stop,
    play,
    stopPlayback,
    dispose() {
      stop();
      stopPlayback();
      unsubscribe();
      stateListeners.clear();
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    get data() {
      return recordingData;
    },
    state: () => ({
      recording,
      playback,
      eventCount: recordingData?.events.length || 0,
    }),
  };
}
