/**
 * A stand-in for the browser's `AudioContext`, as the sound port's tests and
 * the handheld's use it: it plays nothing, and its tone ends when the test
 * says so. Test-only.
 */

import type { ToneContext } from "@topik/lib/topik/adapter/sound-port"

export type FakeSource = {
  kind: "oscillator" | "noise"
  type?: string
  hz?: number
  started: boolean
  stopped: boolean
  onended: (() => void) | null
}

/** A context that plays nothing; its tone ends when the test says so. */
export function fakeTones(options: { fail?: Error; resume?: "never" } = {}): {
  factory: () => ToneContext
  /** How many contexts `factory` has made. */
  made: () => number
  sources: Array<FakeSource>
  closed: () => number
  end: () => void
} {
  const sources: Array<FakeSource> = []
  let closed = 0
  let made = 0
  const connect = (): void => undefined
  const gain = {
    setValueAtTime: (): void => undefined,
    exponentialRampToValueAtTime: (): void => undefined,
  }
  const source = (kind: FakeSource["kind"]): FakeSource => {
    const node: FakeSource & Record<string, unknown> = {
      kind,
      started: false,
      stopped: false,
      onended: null,
      connect,
      start: (): void => {
        node.started = true
      },
      stop: (): void => {
        node.stopped = true
      },
      frequency: {
        setValueAtTime: (hz: number): void => {
          node.hz = hz
        },
      },
    }
    sources.push(node)
    return node
  }
  const context = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: (): Promise<void> =>
      options.resume === "never"
        ? new Promise<void>(() => undefined)
        : Promise.resolve(),
    close: (): Promise<void> => {
      closed += 1
      return Promise.resolve()
    },
    createGain: (): object => ({ connect, gain }),
    createOscillator: (): FakeSource => source("oscillator"),
    createBuffer: (_: number, frames: number): object => ({
      getChannelData: (): Float32Array => new Float32Array(frames),
    }),
    createBufferSource: (): FakeSource => source("noise"),
    createBiquadFilter: (): object => ({ connect, frequency: { value: 0 } }),
  }
  return {
    factory: (): ToneContext => {
      made += 1
      if (options.fail) throw options.fail
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a fake: it implements the slice of AudioContext a tone touches, and nothing else
      return context as unknown as ToneContext
    },
    made: (): number => made,
    sources,
    closed: (): number => closed,
    end: (): void => {
      for (const node of sources) node.onended?.()
    },
  }
}
