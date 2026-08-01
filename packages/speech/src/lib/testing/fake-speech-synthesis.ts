/**
 * A hand-driven stand-in for `speechSynthesis` and
 * `SpeechSynthesisUtterance`.
 *
 * jsdom implements neither. As with the audio-context fake, nothing is
 * spoken and nothing finishes on its own: a test says when an utterance
 * ends, errors, or is cancelled, which is the only way to pin down what the
 * adapter promises in each case.
 */

export type FakeUtterance = {
  text: string
  lang: string
  rate: number
  pitch: number
  volume: number
  onstart: ((event: Event) => void) | null
  onend: ((event: Event) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onboundary:
    | ((event: { charIndex: number; charLength: number }) => void)
    | null
}

export type FakeSpeechSynthesis = {
  speak: (utterance: FakeUtterance) => void
  cancel: () => void
  pause: () => void
  resume: () => void
  getVoices: () => Array<SpeechSynthesisVoice>
  readonly spoken: ReadonlyArray<FakeUtterance>
  readonly paused: boolean
  readonly cancelCount: number
  /** Drives the utterance in flight. */
  start: () => void
  end: () => void
  boundary: (charIndex: number, charLength: number) => void
  error: (reason: string) => void
}

export type FakeSpeechSynthesisHandle = {
  synthesis: SpeechSynthesis
  controls: FakeSpeechSynthesis
  utteranceFactory: (text: string) => SpeechSynthesisUtterance
}

export function createFakeSpeechSynthesis(
  voices: Array<SpeechSynthesisVoice> = []
): FakeSpeechSynthesisHandle {
  const spoken: Array<FakeUtterance> = []
  let paused = false
  let cancelCount = 0

  const controls: FakeSpeechSynthesis = {
    speak: (utterance: FakeUtterance): void => {
      spoken.push(utterance)
    },
    cancel: (): void => {
      cancelCount += 1
      // The real API fires `end` on whatever was in flight. Tests that care
      // drive it explicitly; leaving it silent here keeps "the adapter
      // settled it itself" and "the browser settled it" distinguishable.
    },
    pause: (): void => {
      paused = true
    },
    resume: (): void => {
      paused = false
    },
    getVoices: (): Array<SpeechSynthesisVoice> => voices,
    get spoken(): ReadonlyArray<FakeUtterance> {
      return spoken
    },
    get paused(): boolean {
      return paused
    },
    get cancelCount(): number {
      return cancelCount
    },
    start: (): void => {
      spoken.at(-1)?.onstart?.(new Event("start"))
    },
    end: (): void => {
      spoken.at(-1)?.onend?.(new Event("end"))
    },
    boundary: (charIndex: number, charLength: number): void => {
      spoken.at(-1)?.onboundary?.({ charIndex, charLength })
    },
    error: (reason: string): void => {
      spoken.at(-1)?.onerror?.({ error: reason })
    },
  }

  const utteranceFactory = (text: string): SpeechSynthesisUtterance => {
    const utterance: FakeUtterance = {
      text,
      lang: "",
      rate: 1,
      pitch: 1,
      volume: 1,
      onstart: null,
      onend: null,
      onerror: null,
      onboundary: null,
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a fake utterance: the adapter sets the handlers and reads nothing else off it
    return utterance as unknown as SpeechSynthesisUtterance
  }

  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ditto: the slice of SpeechSynthesis the adapter calls, nothing more
    synthesis: controls as unknown as SpeechSynthesis,
    controls,
    utteranceFactory,
  }
}
