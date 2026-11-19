import { TTRState } from "./types";

// Small synthesized sound effects (Web Audio, no audio files).

export type SoundName =
  | "draw"
  | "tickets"
  | "claim"
  | "station"
  | "yourTurn"
  | "lastRound"
  | "gameOver";

const MUTE_KEY = "boardgames.muted";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

// Browsers keep audio suspended until the page gets a user gesture. Call this from
// a click or keypress so later sounds (triggered by other players) can play.
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage unavailable; the setting just won't persist.
  }
}

// One note: frequency in Hz, start offset and duration in seconds.
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.2,
  slideTo?: number,
) {
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Short burst of filtered noise, like a card sliding.
function swish(c: AudioContext, start: number, duration: number, volume = 0.15) {
  const t0 = c.currentTime + start;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, t0);
  filter.frequency.exponentialRampToValueAtTime(4000, t0 + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

export function playSound(name: SoundName, delay = 0) {
  if (isMuted()) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  const d = delay;
  switch (name) {
    case "draw":
      swish(c, d, 0.12);
      break;
    case "tickets":
      swish(c, d, 0.1, 0.12);
      swish(c, d + 0.09, 0.1, 0.12);
      swish(c, d + 0.18, 0.1, 0.12);
      break;
    case "claim":
      // Train "chug" then a confirming two-note.
      tone(c, 110, d, 0.08, "square", 0.12);
      tone(c, 110, d + 0.1, 0.08, "square", 0.12);
      tone(c, 523, d + 0.2, 0.12, "triangle", 0.2);
      tone(c, 784, d + 0.3, 0.2, "triangle", 0.2);
      break;
    case "station":
      tone(c, 392, d, 0.12, "triangle", 0.2);
      tone(c, 523, d + 0.1, 0.25, "triangle", 0.2);
      break;
    case "yourTurn":
      tone(c, 880, d, 0.18, "sine", 0.22);
      tone(c, 1175, d + 0.15, 0.35, "sine", 0.22);
      break;
    case "lastRound":
      // Train whistle.
      tone(c, 587, d, 0.5, "sawtooth", 0.07, 622);
      tone(c, 740, d, 0.5, "sawtooth", 0.07, 784);
      break;
    case "gameOver":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, d + i * 0.14, 0.3, "triangle", 0.2));
      break;
  }
}

// Sounds for what changed between two snapshots of the game, in play order.
export function soundsForChange(
  prev: TTRState,
  next: TTRState,
  playerId: string,
): SoundName[] {
  const sounds: SoundName[] = [];
  const count = (o: Record<string, unknown>) => Object.keys(o).length;
  const totalCards = (st: TTRState) =>
    Object.values(st.hands).reduce((n, h) => n + h.length, 0);
  const offers = (st: TTRState) => Object.values(st.offers).filter(Boolean).length;

  if (count(next.owners) > count(prev.owners)) sounds.push("claim");
  else if (count(next.stations) > count(prev.stations)) sounds.push("station");
  else if (offers(next) > offers(prev) && next.phase !== "setup") sounds.push("tickets");
  else if (totalCards(next) > totalCards(prev)) sounds.push("draw");

  if (next.phase === "finished" && prev.phase !== "finished") {
    sounds.push("gameOver");
    return sounds;
  }
  if (next.lastRoundBy && !prev.lastRoundBy) sounds.push("lastRound");

  const myTurn = (st: TTRState) =>
    st.phase === "playing" && st.order[st.current] === playerId && !st.offers[playerId];
  if (myTurn(next) && !myTurn(prev)) sounds.push("yourTurn");

  return sounds;
}
