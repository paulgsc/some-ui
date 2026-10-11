/**
 * @module part
 *
 * The part a line is read in, when a page voices more than one speaker: a
 * drama's women and men, say. An applet asks for a part, never a voice, and
 * the session keeps what the person chose in Settings:
 *
 * - **A hosted backend** reads a part in a catalogue voice of that gender
 *   for the line's language. When the person's chosen voice is that gender,
 *   it is the one that reads it; the other part gets the catalogue's voice
 *   of the other gender (`hostedVoiceFor`).
 * - **A device backend** (the phone's TTS, the browser's synthesizer) cannot
 *   say which of its voices is a woman's or a man's: neither Android's
 *   `Voice` nor `SpeechSynthesisVoice` reports it. So the person's voice
 *   reads both parts, each at its own pitch (`DEVICE_PART_PITCH`). Whatever
 *   the device voice's own gender, the two parts then sound apart, which is
 *   what a listener needs in order to follow who is speaking.
 *
 * A line with no part (a narrator, a lesson's single voice) is read exactly
 * as before: the chosen voice, at its own pitch.
 */

export type VoicePart = "female" | "male"

/**
 * A device voice's pitch, as a multiple of its own, for each part. Apart
 * enough to tell two speakers by ear, near enough to 1 that neither sounds
 * like a cartoon; Android and Chrome both treat 1 as the voice's own pitch.
 */
export const DEVICE_PART_PITCH: Readonly<Record<VoicePart, number>> = {
  female: 1.12,
  male: 0.8,
}

/** A device line's pitch: `base` (the voice's own), moved for `part`. */
export const devicePitchFor = (
  base: number,
  part: VoicePart | undefined
): number => (part ? base * DEVICE_PART_PITCH[part] : base)
