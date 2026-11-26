/**
 * A WAV read by walking its chunks, never by a fixed offset: a streamed WAV
 * (the phone's recorder, ffmpeg writing to a pipe) carries 0xFFFFFFFF as its
 * RIFF and `data` sizes, so the samples are what the file holds, not what
 * its header says (HOST12, #3554).
 */

/** A PCM WAV's format chunk and samples, and how many bytes a second takes. */
export type Pcm = {
  readonly format: Uint8Array
  readonly data: Uint8Array
  readonly byteRate: number
}

/** A WAV's format and samples, or null for anything not a PCM WAV. */
export function pcmOf(wav: Uint8Array): Pcm | null {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (at: number): string =>
    String.fromCharCode(...wav.subarray(at, at + 4))
  if (wav.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null
  let format: Uint8Array | null = null
  for (let at = 12; at + 8 <= wav.byteLength; ) {
    const size = view.getUint32(at + 4, true)
    const body = wav.subarray(at + 8, Math.min(at + 8 + size, wav.byteLength))
    if (tag(at) === "fmt ") format = body
    else if (tag(at) === "data") {
      if (format === null || format.byteLength < 16) return null
      const fmt = new DataView(format.buffer, format.byteOffset, 16)
      if (fmt.getUint16(0, true) !== 1) return null
      return { format, data: body, byteRate: fmt.getUint32(8, true) }
    }
    at += 8 + size + (size % 2)
  }
  return null
}

/** A take's samples, mixed to one channel, from -1 to 1. */
export type Samples = {
  readonly rate: number
  readonly samples: Float32Array
}

/**
 * A 16-bit PCM WAV's samples, its channels averaged into one; null for
 * any other WAV. Its length is what the `data` chunk holds.
 */
export function samplesOf(wav: Uint8Array): Samples | null {
  const pcm = pcmOf(wav)
  if (pcm === null) return null
  const fmt = new DataView(pcm.format.buffer, pcm.format.byteOffset, 16)
  const channels = fmt.getUint16(2, true)
  const rate = fmt.getUint32(4, true)
  const bits = fmt.getUint16(14, true)
  if (bits !== 16 || channels < 1 || rate <= 0) return null
  const data = new DataView(pcm.data.buffer, pcm.data.byteOffset)
  const frames = Math.floor(pcm.data.byteLength / (2 * channels))
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++)
      sum += data.getInt16((i * channels + c) * 2, true)
    samples[i] = sum / channels / 32768
  }
  return { rate, samples }
}

/** How long a PCM WAV runs, in ms, by its samples; null for anything else. */
export function wavMs(wav: Uint8Array): number | null {
  const pcm = pcmOf(wav)
  if (pcm === null || pcm.byteRate <= 0) return null
  return (pcm.data.byteLength / pcm.byteRate) * 1000
}
