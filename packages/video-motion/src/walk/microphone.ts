/**
 * A microphone a walk's page is given in place of the device's (WALK3,
 * #3282): `getUserMedia` for audio answers a stream that plays a canned
 * clip, so the app's own recorder records it, and the recording, kept and
 * playing states show as a person sees them, from the app's own code. Nothing
 * else of the page is changed, and no real microphone is opened: the
 * emulator's is off (`-noaudio`), and nothing of the owner's voice is in a
 * walk.
 *
 * Either stage can be given one (`Walk.microphone`); the script is run in
 * the page before its own scripts.
 */

import { readFileSync } from "node:fs"
import { assertNever } from "@some-ui/core-utils"

/** Where the clip comes from: a closed union, each case read once in `clipOf`. */
export type Microphone =
  /** A made-up voice: a hum whose loudness rises and falls like speech, `seconds` long. */
  | { readonly kind: "murmur"; readonly seconds: number }
  /** A recorded clip the walk names: a WAV file, mock words only. */
  | { readonly kind: "clip"; readonly wav: string }

const RATE = 16_000

/**
 * A mono 16-bit WAV of a murmur: a 140 Hz hum and its harmonics, its
 * loudness shaped into syllables and pauses, the same bytes every time (no
 * randomness), so a level meter moves as it does for a voice.
 */
export function murmurWav(seconds: number): Buffer {
  if (!(seconds > 0 && seconds <= 60)) {
    throw new Error("a murmur lasts more than no time and at most a minute")
  }
  const samples = Math.round(seconds * RATE)
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) {
    const t = i / RATE
    // Syllables at about 4 a second, a pause every 1.5 s.
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t))
    const phrase = t % 1.5 < 1.2 ? 1 : 0
    const pitch = 140 + 12 * Math.sin(2 * Math.PI * 0.5 * t)
    const voice =
      Math.sin(2 * Math.PI * pitch * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * pitch * t) +
      0.25 * Math.sin(2 * Math.PI * 3 * pitch * t)
    const value = 0.35 * syllable * phrase * voice
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32_767),
      i * 2
    )
  }
  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** The clip's bytes. */
export function clipOf(microphone: Microphone): Buffer {
  switch (microphone.kind) {
    case "murmur": {
      return murmurWav(microphone.seconds)
    }
    case "clip": {
      return readFileSync(microphone.wav)
    }
    default: {
      return assertNever(microphone)
    }
  }
}

/**
 * The script that gives the page the microphone: audio `getUserMedia` calls
 * answer a stream of the clip, looped, from an `AudioContext` the page owns;
 * a call for anything else is passed to the browser's own.
 */
export function microphoneScript(microphone: Microphone): string {
  const base64 = clipOf(microphone).toString("base64")
  return `(() => {
  const devices = navigator.mediaDevices
  if (!devices) return
  const own = devices.getUserMedia.bind(devices)
  const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0))
  devices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio || constraints.video) return own(constraints)
    const context = new AudioContext()
    await context.resume()
    const buffer = await context.decodeAudioData(bytes.slice().buffer)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const out = context.createMediaStreamDestination()
    source.connect(out)
    source.start()
    const stream = out.stream
    for (const track of stream.getAudioTracks()) {
      const stop = track.stop.bind(track)
      track.stop = () => { stop(); source.stop(); void context.close() }
    }
    return stream
  }
})()`
}
