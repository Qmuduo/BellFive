import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 22_050;
const outputDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/audio');

function writeWav(name, durationSeconds, sampleAt) {
  const sampleCount = Math.ceil(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, sampleAt(index / sampleRate, index)));
    buffer.writeInt16LE(Math.round(sample * (sample < 0 ? 32_768 : 32_767)), 44 + index * 2);
  }

  writeFileSync(path.join(outputDirectory, name), buffer);
}

function createDeterministicXorshiftNoise() {
  let state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function writeNotes(name, notes, noteDuration, gapDuration, amplitude) {
  const duration = notes.length * noteDuration + (notes.length - 1) * gapDuration;
  writeWav(name, duration, time => {
    const noteAndGap = noteDuration + gapDuration;
    const noteIndex = Math.floor(time / noteAndGap);
    if (noteIndex >= notes.length) return 0;
    const localTime = time - noteIndex * noteAndGap;
    if (localTime >= noteDuration) return 0;
    return amplitude * Math.exp(-localTime * 4) * Math.sin(2 * Math.PI * notes[noteIndex] * localTime);
  });
}

mkdirSync(outputDirectory, { recursive: true });

const noiseSample = createDeterministicXorshiftNoise();
writeWav('card-flip.wav', 0.12, time => {
  const envelope = Math.exp(-time * 38);
  const noiseEnvelope = Math.exp(-time * 65);
  return (
    0.65 * envelope * Math.sin(2 * Math.PI * 900 * time) +
    0.35 * envelope * Math.sin(2 * Math.PI * 1_900 * time) +
    0.08 * noiseEnvelope * noiseSample()
  );
});

writeNotes('victory.wav', [523.25, 659.25, 783.99], 0.18, 0.02, 0.28);
writeNotes('defeat.wav', [392, 261.63], 0.28, 0.04, 0.24);

console.log(`Generated game sound effects in ${outputDirectory}`);
