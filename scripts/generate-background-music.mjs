// Original BellFive loop, "Pocket Rally". No samples or third-party composition.
// Run: node scripts/generate-background-music.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sampleRate = 22050;
const bpm = 100;
const beat = 60 / bpm;
const bars = 16;
const duration = bars * 4 * beat;
const length = Math.round(duration * sampleRate);
const mix = new Float64Array(length);
const tau = 2 * Math.PI;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
let seed = 51004;
function noise() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
}
// Wrap every note tail into the start of the loop, preserving reverb/release.
function add(at, seconds, voice) {
  const first = Math.round(at * sampleRate);
  const count = Math.round(seconds * sampleRate);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    mix[(first + i) % length] += voice(t, seconds);
  }
}
function envelope(t, seconds, attack, decay) {
  const onset = Math.min(1, t / attack);
  const tail = Math.min(1, (seconds - t) / 0.09);
  return onset * tail * Math.exp(-t / decay);
}
function pluck(midi, at, gain = 0.075) {
  const f = hz(midi);
  const voice = (t, seconds) => {
    const fundamental = Math.sin(tau * f * t);
    const warmPartial = 0.2 * Math.sin(tau * f * 2 * t) * Math.exp(-t * 5);
    return (fundamental + warmPartial) * envelope(t, seconds, 0.014, 0.24) * gain;
  };
  add(at, 0.85, voice);
  add(at + beat * 0.75, 0.85, (t, d) => voice(t, d) * 0.14);
}
function bass(midi, at, seconds) {
  const f = hz(midi);
  add(at, seconds, (t, d) =>
    (Math.sin(tau * f * t) + 0.17 * Math.sin(tau * f * 2 * t)) *
    envelope(t, d, 0.025, 0.4) * 0.09);
}
function chord(notes, at) {
  notes.forEach(midi => {
    const f = hz(midi);
    add(at, beat * 3.8, (t, seconds) =>
      (Math.sin(tau * f * t) + 0.13 * Math.sin(tau * f * 2 * t)) *
      envelope(t, seconds, 0.11, 0.8) * 0.022);
  });
}
function kick(at) {
  add(at, 0.23, (t, d) =>
    Math.sin(tau * (48 * t + 1.8 * (1 - Math.exp(-t * 18)))) *
    envelope(t, d, 0.008, 0.06) * 0.065);
}
function brush(at, gain) {
  let smoothed = 0;
  add(at, 0.08, (t, d) => {
    smoothed = smoothed * 0.72 + noise() * 0.28;
    return smoothed * envelope(t, d, 0.005, 0.023) * gain;
  });
}

const harmony = [
  { root: 36, notes: [48, 55, 59, 64] }, // Cmaj7
  { root: 33, notes: [48, 55, 60, 64] }, // Am7
  { root: 41, notes: [48, 57, 60, 64] }, // Fmaj7
  { root: 43, notes: [50, 55, 59, 64] }, // G6
];
const motifs = [
  [[0,64],[0.75,67],[1.5,69],[2.5,67],[3.25,64]],
  [[0.5,64],[1.25,60],[2,62],[3,64]],
  [[0,65],[1,69],[1.75,67],[2.5,65],[3.5,64]],
  [[0.5,62],[1.5,67],[2.25,64],[3,62]],
  [[0,67],[0.75,64],[1.5,67],[2.75,69]],
  [[0.5,69],[1.25,67],[2,64],[3.25,60]],
  [[0,65],[1,64],[2.25,60],[3,64]],
  [[0.5,62],[1.5,59],[2.5,62]],
];
for (let bar = 0; bar < bars; bar++) {
  const at = bar * 4 * beat;
  const h = harmony[bar % harmony.length];
  chord(h.notes, at);
  bass(h.root, at, beat * 1.2);
  bass(h.root + 7, at + beat * 2.5, beat * 0.9);
  const motif = motifs[bar % motifs.length];
  for (const [offset, midi] of motif) pluck(midi, at + offset * beat, bar < 8 ? 0.071 : 0.061);
  kick(at);
  kick(at + beat * 2);
  for (let b = 0; b < 4; b++) {
    brush(at + (b + 0.55) * beat, b % 2 ? 0.026 : 0.018);
  }
}
// Remove DC offset and normalize conservatively without a discontinuous fade-out.
const mean = mix.reduce((sum, value) => sum + value, 0) / length;
let peak = 0;
for (let i = 0; i < length; i++) { mix[i] -= mean; peak = Math.max(peak, Math.abs(mix[i])); }
const gain = 0.58 / peak;
const wav = Buffer.alloc(44 + length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
let sumSquares = 0;
for (let i = 0; i < length; i++) {
  const value = mix[i] * gain;
  sumSquares += value * value;
  wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}
const output = new URL('../assets/audio/background-music.wav', import.meta.url);
mkdirSync(fileURLToPath(new URL('../assets/audio/', import.meta.url)), { recursive: true });
writeFileSync(output, wav);
console.log(JSON.stringify({ output: fileURLToPath(output), title: 'Pocket Rally', bpm, bars, duration, sampleRate, bytes: wav.length, peak: 0.58, rms: Math.sqrt(sumSquares / length), loopBoundaryDelta: Math.abs(mix[0] - mix[length - 1]) * gain }, null, 2));
