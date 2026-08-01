/**
 * A hand-driven stand-in for `AudioContext`.
 *
 * jsdom has no Web Audio, and a real one would make playback tests depend
 * on wall-clock audio duration. This one plays nothing and finishes only
 * when a test says so, which is what makes "did that promise settle, and
 * when?" observable at all.
 */

export type FakeSourceNode = {
  buffer: AudioBuffer | null
  playbackRate: { value: number }
  onended: ((event: Event) => void) | null
  started: boolean
  stopped: boolean
  connect: () => void
  disconnect: () => void
  start: (when?: number) => void
  stop: () => void
  /** Fires `onended`, as the real node does when the buffer runs out. */
  finish: () => void
}

export type FakeAudioContext = {
  state: AudioContextState
  currentTime: number
  destination: unknown
  createBufferSource: () => FakeSourceNode
  createGain: () => {
    gain: { value: number }
    connect: () => void
    disconnect: () => void
  }
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>
  resume: () => Promise<void>
  suspend: () => Promise<void>
  close: () => Promise<void>
  /** Every source node handed out, newest last. */
  readonly sources: ReadonlyArray<FakeSourceNode>
  /** Ends the utterance in flight the way a real buffer ending would. */
  finishCurrent: () => void
}

export type FakeAudioContextOptions = {
  /** Make `decodeAudioData` reject, to exercise the failure path. */
  decodeError?: Error
  /** Hold `decodeAudioData` open until the returned release is called. */
  blockDecode?: boolean
  duration?: number
}

export type FakeAudioContextHandle = {
  factory: () => AudioContext
  /** The contexts created so far - one per player, in creation order. */
  readonly contexts: ReadonlyArray<FakeAudioContext>
  readonly current: FakeAudioContext | undefined
  /** Releases a blocked `decodeAudioData`. */
  releaseDecode: () => void
}

export function createFakeAudioContextHandle(
  options: FakeAudioContextOptions = {}
): FakeAudioContextHandle {
  const contexts: Array<FakeAudioContext> = []
  let releaseDecode: () => void = () => undefined

  const build = (): FakeAudioContext => {
    const sources: Array<FakeSourceNode> = []

    const context: FakeAudioContext = {
      state: "running",
      currentTime: 0,
      destination: {},
      createBufferSource: (): FakeSourceNode => {
        const node: FakeSourceNode = {
          buffer: null,
          playbackRate: { value: 1 },
          onended: null,
          started: false,
          stopped: false,
          connect: () => undefined,
          disconnect: () => undefined,
          start: () => {
            node.started = true
          },
          stop: () => {
            node.stopped = true
          },
          finish: () => {
            node.onended?.(new Event("ended"))
          },
        }
        sources.push(node)
        return node
      },
      createGain: () => ({
        gain: { value: 1 },
        connect: () => undefined,
        disconnect: () => undefined,
      }),
      decodeAudioData: async (): Promise<AudioBuffer> => {
        if (options.blockDecode) {
          await new Promise<void>((resolve) => {
            releaseDecode = resolve
          })
        }
        if (options.decodeError) throw options.decodeError
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a fake decoded buffer: the player reads only `duration`, and constructing a real AudioBuffer needs the Web Audio jsdom does not have
        return { duration: options.duration ?? 1 } as AudioBuffer
      },
      resume: (): Promise<void> => {
        context.state = "running"
        return Promise.resolve()
      },
      suspend: (): Promise<void> => {
        context.state = "suspended"
        return Promise.resolve()
      },
      close: (): Promise<void> => {
        context.state = "closed"
        return Promise.resolve()
      },
      get sources(): ReadonlyArray<FakeSourceNode> {
        return sources
      },
      finishCurrent: (): void => {
        sources.at(-1)?.finish()
      },
    }

    return context
  }

  return {
    factory: (): AudioContext => {
      const context = build()
      contexts.push(context)
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the whole point of a fake: it implements the slice of AudioContext the player touches, and nothing else
      return context as unknown as AudioContext
    },
    get contexts(): ReadonlyArray<FakeAudioContext> {
      return contexts
    },
    get current(): FakeAudioContext | undefined {
      return contexts.at(-1)
    },
    releaseDecode: (): void => releaseDecode(),
  }
}
