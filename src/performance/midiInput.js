const MIN_MIDI = 21;
const MAX_MIDI = 108;

/** Event-driven Web MIDI bridge. It never talks to audio directly. */
export function createMidiInput({ controller, onStatus = () => {} }) {
  let access = null;
  let selectedId = null;
  let selectedInput = null;
  const heldTokens = new Map();

  function deviceGroup(id) {
    return `midi:${id}`;
  }

  function availableInputs() {
    return access
      ? [...access.inputs.values()].filter(
          (input) => input.state !== "disconnected",
        )
      : [];
  }

  function updateStatus(status) {
    onStatus({
      status,
      supported: "requestMIDIAccess" in navigator,
      selectedId,
      selectedName: selectedInput?.name || null,
      inputs: access
        ? availableInputs().map((input) => ({
            id: input.id,
            name: input.name || "MIDI input",
            state: input.state,
          }))
        : [],
    });
  }

  function releaseDevice(id) {
    heldTokens.delete(id);
    controller.releaseSource(deviceGroup(id));
  }

  function releaseChannel(id, channel) {
    const notes = heldTokens.get(id);
    if (!notes) return;
    for (const [token, midi] of [...notes]) {
      if (!token.includes(`:${channel}:`)) continue;
      notes.delete(token);
      controller.noteOff(midi, token);
    }
  }

  function forceReleaseChannel(id, channel) {
    const notes = heldTokens.get(id);
    if (!notes) return;
    const tokens = new Set(
      [...notes.keys()].filter((token) => token.includes(`:${channel}:`)),
    );
    for (const token of tokens) notes.delete(token);
    controller.releaseSource(deviceGroup(id), {
      force: true,
      tokens,
      releaseSustain: false,
    });
  }

  function onMessage(event) {
    const [status, note, value = 0] = event.data;
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const id = selectedInput?.id;
    if (!id) return;
    const group = deviceGroup(id);
    const token = `${group}:${channel}:${note}`;
    const notes = heldTokens.get(id) || new Map();
    heldTokens.set(id, notes);

    if (command === 0x90 && value > 0) {
      if (note < MIN_MIDI || note > MAX_MIDI || notes.has(token)) return;
      notes.set(token, note);
      controller.noteOn(note, value / 127, token, group);
      return;
    }
    if (command === 0x80 || (command === 0x90 && value === 0)) {
      if (!notes.has(token)) return;
      notes.delete(token);
      controller.noteOff(note, token);
      return;
    }
    if (command !== 0xb0) return;
    if (note === 64) {
      controller.setSustainForSource(
        `${group}:${channel}:cc64`,
        value >= 64,
        group,
      );
    } else if (note === 123) {
      releaseChannel(id, channel);
    } else if (note === 120) {
      forceReleaseChannel(id, channel);
    }
  }

  function select(id) {
    if (!access) return;
    if (!id) {
      updateStatus(availableInputs().length ? "select-device" : "no-devices");
      return;
    }
    if (selectedInput) {
      selectedInput.onmidimessage = null;
      if (selectedInput.id !== id) releaseDevice(selectedInput.id);
    }
    selectedInput = access.inputs.get(id) || null;
    selectedId = selectedInput?.id || null;
    if (selectedInput) selectedInput.onmidimessage = onMessage;
    updateStatus(selectedInput ? "connected" : "no-devices");
  }

  function refresh() {
    if (!access) return;
    const inputs = availableInputs();
    if (!inputs.some((input) => input.id === selectedId)) {
      if (selectedId) releaseDevice(selectedId);
      if (selectedInput) selectedInput.onmidimessage = null;
      selectedId = null;
      selectedInput = null;
    }
    if (selectedInput) updateStatus("connected");
    else if (inputs.length === 1) select(inputs[0].id);
    else updateStatus(inputs.length ? "select-device" : "no-devices");
  }

  function handleStateChange(event) {
    if (
      event.port?.type === "input" &&
      event.port.state === "disconnected" &&
      event.port.id === selectedId
    ) {
      if (selectedInput) selectedInput.onmidimessage = null;
      releaseDevice(selectedId);
      selectedId = null;
      selectedInput = null;
    }
    refresh();
  }

  async function connect() {
    if (!("requestMIDIAccess" in navigator)) {
      updateStatus("unavailable");
      return;
    }
    try {
      access = await navigator.requestMIDIAccess();
      access.onstatechange = handleStateChange;
      refresh();
    } catch {
      updateStatus("denied");
    }
  }

  updateStatus("off");
  return {
    connect,
    select,
    connectedInputs: () => availableInputs().map((input) => input.name),
    selectedInput: () => selectedInput?.name || null,
    get supported() {
      return "requestMIDIAccess" in navigator;
    },
  };
}
