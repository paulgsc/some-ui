/**
 * A microphone that hears `durationMs` of speech per take, `bytes` of it:
 * the recorders' tests' and the ui-fit phone page's
 * (`@some-ui/soundbites/fixtures`). It opens at once and never refuses.
 */
import type { Recording, StartRecording, Take } from "@some-ui/voice-capture"

export function fakeMic(durationMs = 4_000, bytes = 5): StartRecording {
  return (): Promise<Recording> =>
    Promise.resolve({
      level: (): number => 0.3,
      finish: (): Promise<Take> =>
        Promise.resolve({
          blob: new Blob(["v".repeat(bytes)], { type: "audio/webm" }),
          mimeType: "audio/webm;codecs=opus",
          durationMs,
        }),
      discard: (): void => undefined,
    })
}
