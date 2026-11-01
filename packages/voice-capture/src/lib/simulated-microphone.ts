/**
 * The one simulated microphone every screen's tests share: a
 * `StartRecording` that answers each opening as its script says, on the
 * timers a test fakes, and counts the streams it holds open the way the
 * real recorder (`../lib/recorder.ts`) holds them: from the opening's
 * answer until `finish` or `discard` is called.
 *
 * Each opening takes the next script from the queue (`script`), and the
 * default once it is empty: opens at once, hears speech, finishes at once.
 * An opening `on cue` waits for `answer`, for tests that order things by
 * hand.
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  Recording,
  RecordingFailure,
  StartRecording,
  Take,
} from "./recorder"
import { RecordingError } from "./recorder"

/** How the microphone answers one opening. */
export type MicOpen =
  | { readonly kind: "after"; readonly ms: number }
  | { readonly kind: "never" }
  | {
      readonly kind: "refuse"
      readonly reason: RecordingFailure
      readonly ms: number
    }
  /** Waits for `answer`. */
  | { readonly kind: "cue" }

/** How a recording answers `finish`. */
export type MicFinish =
  | { readonly kind: "after"; readonly ms: number }
  | { readonly kind: "never" }
  | { readonly kind: "fail"; readonly ms: number }

export type MicScript = {
  readonly open: MicOpen
  readonly finish: MicFinish
  /** The input's level, 0 (silence) to 1, for every read. */
  readonly level: number
  /** Whether the level is measured; true when absent. */
  readonly metered?: boolean | undefined
  /** How long the take says it ran; the clock's time open when absent. */
  readonly durationMs?: number | undefined
  /** How many bytes it hands back: 0 is a recorder that wrote nothing. */
  readonly bytes: number
}

/** Opens at once, hears speech, finishes at once. */
export const SPEAKING: MicScript = {
  open: { kind: "after", ms: 0 },
  finish: { kind: "after", ms: 0 },
  level: 0.3,
  bytes: 5,
}

export type SimulatedMicrophone = {
  readonly startRecording: StartRecording
  /** The next openings answer as these say, in order. */
  readonly script: (...scripts: ReadonlyArray<MicScript>) => void
  /** Answers the opening that has waited longest on cue. */
  readonly answer: (how: "open" | RecordingFailure) => void
  /** Streams held open now. */
  readonly open: () => number
  /** Openings asked for so far. */
  readonly asked: () => number
  /** Recordings let go without keeping anything. */
  readonly discarded: () => number
}

export function simulatedMicrophone(ports: {
  /** Milliseconds since the epoch: the test's clock. */
  readonly now: () => number
  readonly fallback?: MicScript | undefined
}): SimulatedMicrophone {
  const queue: Array<MicScript> = []
  const cued: Array<(how: "open" | RecordingFailure) => void> = []
  let open = 0
  let asked = 0
  let discarded = 0

  const recording = (script: MicScript): Recording => {
    open += 1
    const openedAt = ports.now()
    let held = true
    const letGo = (): void => {
      if (held) open -= 1
      held = false
    }
    return {
      level: () => (held ? script.level : 0),
      metered: () => held && script.metered !== false,
      finish: (): Promise<Take> => {
        const durationMs = script.durationMs ?? ports.now() - openedAt
        // Stops and releases the microphone at once, as the real one does;
        // only the hand-over waits.
        letGo()
        const { finish } = script
        if (finish.kind === "never") return new Promise<Take>(() => undefined)
        return new Promise<Take>((resolve, reject) => {
          setTimeout(() => {
            if (finish.kind === "fail") {
              reject(new Error("the recorder lost the take"))
              return
            }
            resolve({
              blob: new Blob(["v".repeat(script.bytes)], {
                type: "audio/webm",
              }),
              mimeType: "audio/webm;codecs=opus",
              durationMs,
            })
          }, finish.ms)
        })
      },
      discard: (): void => {
        if (held) discarded += 1
        letGo()
      },
    }
  }

  return {
    startRecording: (): Promise<Recording> => {
      asked += 1
      const script = queue.shift() ?? ports.fallback ?? SPEAKING
      const { open: answer } = script
      switch (answer.kind) {
        case "never": {
          return new Promise<Recording>(() => undefined)
        }
        case "cue": {
          return new Promise<Recording>((resolve, reject) => {
            cued.push((how) => {
              if (how === "open") resolve(recording(script))
              else reject(new RecordingError(how))
            })
          })
        }
        case "refuse": {
          return new Promise<Recording>((_, reject) => {
            setTimeout(
              () => reject(new RecordingError(answer.reason)),
              answer.ms
            )
          })
        }
        case "after": {
          return new Promise<Recording>((resolve) => {
            setTimeout(() => resolve(recording(script)), answer.ms)
          })
        }
        default: {
          return assertNever(answer)
        }
      }
    },
    script: (...scripts): void => {
      queue.push(...scripts)
    },
    answer: (how): void => {
      cued.shift()?.(how)
    },
    open: () => open,
    asked: () => asked,
    discarded: () => discarded,
  }
}
