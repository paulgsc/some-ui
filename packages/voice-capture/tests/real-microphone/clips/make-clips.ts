/**
 * Writes the two clips the real-microphone suite plays as Chromium's
 * microphone (`--use-file-for-fake-audio-capture`), byte for byte the same
 * on every run: `node make-clips.ts` from this directory.
 *
 * - `speech.wav`: two seconds of syllables, a voiced buzz with its
 *   harmonics, gliding in pitch, between short gaps. Synthesized, not a
 *   recording of a person; what it has to do is read as talking on the
 *   recorder's meter (above `HEARD_FLOOR`) through Chromium's echo
 *   cancellation and noise suppression, which damp a steady tone.
 * - `silence.wav`: two seconds of zeros.
 *
 * Both are mono, 16-bit PCM at 8 kHz: 32 KB each.
 */
import { writeFileSync } from "node:fs"

const RATE = 8_000
const SECONDS = 2

/** A RIFF/WAVE file of 16-bit mono samples in -1..1. */
function wav(samples: Float64Array): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, at) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    data.writeInt16LE(Math.round(clamped * 32_767), at * 2)
  })
  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** Syllables: [start s, length s, pitch from Hz, pitch to Hz]. */
const SYLLABLES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.05, 0.22, 130, 160],
  [0.33, 0.18, 170, 140],
  [0.58, 0.26, 120, 180],
  [0.92, 0.16, 190, 150],
  [1.15, 0.24, 140, 115],
  [1.46, 0.2, 160, 200],
  [1.72, 0.22, 175, 130],
]

function speech(): Float64Array {
  const samples = new Float64Array(RATE * SECONDS)
  for (const [start, length, from, to] of SYLLABLES) {
    let phase = 0
    const first = Math.round(start * RATE)
    const count = Math.round(length * RATE)
    for (let at = 0; at < count; at += 1) {
      const progress = at / count
      phase += (2 * Math.PI * (from + (to - from) * progress)) / RATE
      // Rises and falls over the syllable.
      const envelope = Math.sin(Math.PI * progress) ** 0.6
      let voiced = 0
      for (let harmonic = 1; harmonic <= 12; harmonic += 1)
        voiced += Math.sin(harmonic * phase) / harmonic
      samples[first + at] = 0.2 * envelope * (voiced / 2)
    }
  }
  return samples
}

const here = import.meta.dirname
writeFileSync(`${here}/speech.wav`, wav(speech()))
writeFileSync(`${here}/silence.wav`, wav(new Float64Array(RATE * SECONDS)))
