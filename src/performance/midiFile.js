/**
 * Reads a Standard MIDI File (formats 0 and 1, metrical time) into the same
 * timed events autoplay plays from the engraved scores: notes as { time,
 * duration, midi, velocity, hand } in seconds from the first note, sustain
 * pedal changes as { time, down }. Percussion (channel 10) and notes off the
 * keyboard are left out; the hands split at middle C.
 */
export function parseMidiFile(buffer) {
  const data = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 14 || tag(0) !== "MThd")
    throw new Error("not a Standard MIDI File");
  const tracks = data.getUint16(10);
  const division = data.getUint16(12);
  if (division & 0x8000) throw new Error("SMPTE-timed files are not supported");

  const tempos = [{ tick: 0, perQuarter: 500000 }]; // µs per quarter note
  const notes = [];
  const pedals = [];
  let name = "";
  let p = 8 + data.getUint32(4);
  for (let t = 0; t < tracks && p + 8 <= bytes.length; t++) {
    const end = Math.min(bytes.length, p + 8 + data.getUint32(p + 4));
    const isTrack = tag(p) === "MTrk";
    p += 8;
    let tick = 0;
    let status = 0;
    const open = new Map(); // `${channel}:${midi}` -> starts, first in first out
    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        const b = bytes[p++];
        value = (value << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return value;
    };
    while (isTrack && p < end) {
      tick += vlq();
      if (bytes[p] & 0x80) status = bytes[p++]; // else running status
      if (status === 0xff) {
        const meta = bytes[p++];
        const length = vlq();
        if (meta === 0x51 && length === 3)
          tempos.push({
            tick,
            perQuarter: (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2],
          });
        if (meta === 0x03 && !name)
          name = new TextDecoder().decode(bytes.subarray(p, p + length));
        p += length;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq();
        continue;
      }
      const type = status & 0xf0;
      const channel = status & 0x0f;
      const a = bytes[p++];
      const b = type === 0xc0 || type === 0xd0 ? 0 : bytes[p++];
      const key = `${channel}:${a}`;
      if (type === 0x90 && b > 0) {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push({ tick, midi: a, velocity: b, channel });
      } else if (type === 0x80 || type === 0x90) {
        const start = open.get(key)?.shift();
        if (start) notes.push({ ...start, end: tick });
      } else if (type === 0xb0 && a === 64 && channel !== 9)
        pedals.push({ tick, channel, value: b });
    }
    // Notes never released end with their track.
    for (const starts of open.values())
      for (const start of starts) notes.push({ ...start, end: tick });
    p = end;
  }

  // Ticks to seconds through the tempo map.
  tempos.sort((x, y) => x.tick - y.tick);
  const seconds = (tick) => {
    let at = 0;
    for (let i = 0; i < tempos.length; i++) {
      const from = tempos[i].tick;
      const to = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
      if (tick <= from) break;
      at += ((Math.min(tick, to) - from) * tempos[i].perQuarter) / division;
    }
    return at / 1e6;
  };
  const played = notes.filter(
    (n) => n.channel !== 9 && n.midi >= 21 && n.midi <= 108,
  );
  if (!played.length) throw new Error("no piano notes in the file");
  const first = Math.min(...played.map((n) => seconds(n.tick)));
  const events = played
    .map((n) => {
      const time = seconds(n.tick) - first;
      return {
        time,
        duration: Math.max(0.05, seconds(n.end) - first - time),
        midi: n.midi,
        velocity: Math.min(0.95, Math.max(0.12, n.velocity / 127)),
        hand: n.midi < 60 ? "left" : "right",
      };
    })
    .sort((x, y) => x.time - y.time);
  // The sustain pedal, down or up. A recorded performance streams every
  // value of a foot easing on and off; read raw at 64, one hovering near the
  // middle flaps the dampers (and their thump) many times a second. So it
  // goes down at 64 and up only below 40, and it is down while any channel
  // holds it (tracks are merged here, in time order).
  const held = new Set();
  const pedal = [];
  for (const { tick, channel, value } of pedals.sort(
    (x, y) => x.tick - y.tick,
  )) {
    const was = held.size > 0;
    if (value >= 64) held.add(channel);
    else if (value < 40) held.delete(channel);
    if (held.size > 0 !== was)
      pedal.push({ time: Math.max(0, seconds(tick) - first), down: !was });
  }
  return { name: name.trim(), events, pedal };
}
