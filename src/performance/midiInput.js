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

  function updateStatus(status) {
    onStatus({
      status,
      supported: "requestMIDIAccess" in navigator,
      selectedId,
      selectedName: selectedInput?.name || null,
      inputs: access
        ? [...access.inputs.values()].map((input) => ({
            id: input.id,
            name: input.name || "MIDI input",
            state: input.state,
          }))
        : [],
    });
  }

  function releaseDevice(id) {
    heldTokens.delete(id);
    controller.stopSource(deviceGroup(id));
  }

  function releaseChannel(id, channel) {
    const notes = heldTokens.get(id);
    if (!notes) return;
    for (const [token, midi] of [...notes]) {
      if (!token.includes(`:${channel}:`)) continue;
      notes.delete(token);
      controller.noteOff(midi, token);
    }
    controller.setSustainForSource(
      `${deviceGroup(id)}:${channel}:cc64`,
      false,
      deviceGroup(id),
    );
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
    } else if (note === 123 || note === 120) {
      releaseChannel(id, channel);
    }
  }

  function select(id) {
    if (!access) return;
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
    if (selectedId && !access.inputs.has(selectedId)) {
      releaseDevice(selectedId);
      selectedId = null;
      selectedInput = null;
    }
    if (!selectedId && access.inputs.size === 1)
      select(access.inputs.values().next().value.id);
    else updateStatus(access.inputs.size ? "select-device" : "no-devices");
  }

  function handleStateChange(event) {
    if (
      event.port?.type === "input" &&
      event.port.state === "disconnected" &&
      event.port.id === selectedId
    ) {
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
    connectedInputs: () =>
      access ? [...access.inputs.values()].map((input) => input.name) : [],
    selectedInput: () => selectedInput?.name || null,
    get supported() {
      return "requestMIDIAccess" in navigator;
    },
  };
}
