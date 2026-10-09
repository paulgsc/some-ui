import { addFailureSink } from "@some-ui/intent-kit"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { feelingTone } from "@some-ui/styles/theme"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { ToneContext } from "@topik/lib/topik/adapter/sound-port"
import {
  createSoundControl,
  feelingSound,
  SOUND_STORAGE_KEY,
} from "@topik/lib/topik/adapter/sound-port"
import type { Mock } from "vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

type FakeSource = {
  kind: "oscillator" | "noise"
  type?: string
  hz?: number
  started: boolean
  stopped: boolean
  onended: (() => void) | null
}

/** A context that plays nothing; its tone ends when the test says so. */
function fakeTones(options: { fail?: Error } = {}): {
  factory: Mock<() => ToneContext>
  sources: Array<FakeSource>
  closed: () => number
  end: () => void
} {
  const sources: Array<FakeSource> = []
  let closed = 0
  const connect = (): void => undefined
  const gain = {
    setValueAtTime: (): void => undefined,
    exponentialRampToValueAtTime: (): void => undefined,
  }
  const source = (kind: FakeSource["kind"]): FakeSource => {
    const made: FakeSource & Record<string, unknown> = {
      kind,
      started: false,
      stopped: false,
      onended: null,
      connect,
      start: (): void => {
        made.started = true
      },
      stop: (): void => {
        made.stopped = true
      },
      frequency: {
        setValueAtTime: (hz: number): void => {
          made.hz = hz
        },
      },
    }
    sources.push(made)
    return made
  }
  const context = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: (): Promise<void> => Promise.resolve(),
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
    factory: vi.fn((): ToneContext => {
      if (options.fail) throw options.fail
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a fake: it implements the slice of AudioContext a tone touches, and nothing else
      return context as unknown as ToneContext
    }),
    sources,
    closed: (): number => closed,
    end: (): void => {
      for (const made of sources) made.onended?.()
    },
  }
}

const fakeSpeaker = (
  outcome: SpeechOutcome = { kind: "heard" }
): Speaker & { say: Mock<Speaker["say"]> } => ({
  available: true,
  muted: false,
  say: vi.fn<Speaker["say"]>(() => Promise.resolve(outcome)),
  stop: vi.fn(),
  describe: vi.fn<Speaker["describe"]>(() => ({
    platform: "browser",
    voice: null,
    availability: "available",
  })),
  subscribe: vi.fn(() => () => {}),
})

const settle = async (): Promise<void> => {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
}

const on = (): ReturnType<typeof createSoundControl> => {
  const control = createSoundControl(memoryStorage())
  control.set(true)
  return control
}

const request = { scene: "s6", feeling: "cringe" }

let detach = (): void => undefined
afterEach(() => detach())

describe("createSoundControl", () => {
  it("is off until turned on, and is remembered on the device", () => {
    const storage = memoryStorage()
    const control = createSoundControl(storage)
    expect(control.state()).toBe("off")
    control.set(true)
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe("on")
    expect(createSoundControl(storage).state()).toBe("on")
  })

  it("still toggles when the device refuses to keep it", () => {
    const control = createSoundControl({
      getItem: () => null,
      setItem: (): void => {
        throw new Error("quota")
      },
    })
    control.set(true)
    expect(control.state()).toBe("on")
  })
})

describe("feelingSound", () => {
  it("is no port where nothing can play a tone", () => {
    expect(
      feelingSound({ control: on(), speaker: fakeSpeaker(), tones: null })
    ).toBeNull()
  })

  it("plays no tone and no cry with sound off", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker()
    const sound = feelingSound({
      control: createSoundControl(memoryStorage()),
      speaker,
      tones: tones.factory,
    })!
    expect(sound.audible()).toBe(false)
    expect(await sound.sting(request, new AbortController().signal)).toBe(
      "unavailable"
    )
    expect(tones.factory).not.toHaveBeenCalled()
    expect(speaker.say).not.toHaveBeenCalled()
  })

  it("plays the feeling's tone, then says its cry once the tone has ended", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker()
    const sound = feelingSound({
      control: on(),
      speaker,
      tones: tones.factory,
    })!
    const stung = sound.sting(request, new AbortController().signal)
    await settle()
    // cringe falls a semitone onto its register.
    expect(tones.sources.map(({ hz }) => hz)).toEqual(
      feelingTone("cringe").notes.map(({ hz }) => hz)
    )
    expect(tones.sources.every(({ started }) => started)).toBe(true)
    expect(speaker.say).not.toHaveBeenCalled()

    tones.end()
    expect(await stung).toBe("presented")
    expect(
      speaker.say.mock.calls.map(([text, { urgency }]) => [text, urgency])
    ).toEqual([["아이고…", "next"]])
    expect(tones.closed()).toBe(1)
  })

  it("stops the tone, and says no cry, when its signal fires", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker()
    const sound = feelingSound({
      control: on(),
      speaker,
      tones: tones.factory,
    })!
    const stop = new AbortController()
    const stung = sound.sting({ scene: "s5", feeling: "fury" }, stop.signal)
    await settle()
    stop.abort()
    expect(await stung).toBe("cancelled")
    expect(tones.sources.every(({ stopped }) => stopped)).toBe(true)
    // fury's fall crashes.
    expect(tones.sources.map(({ kind }) => kind)).toContain("noise")
    expect(speaker.say).not.toHaveBeenCalled()
  })

  it("reports a failure, and withdraws the control when sound cannot play here", async () => {
    const failures: Array<string> = []
    detach = addFailureSink(({ port, error }) =>
      failures.push(`${port}: ${error.kind}`)
    )
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const control = on()
    const sound = feelingSound({
      control,
      speaker: fakeSpeaker(),
      tones: fakeTones({
        fail: new DOMException("no audio", "NotSupportedError"),
      }).factory,
    })!
    expect(await sound.sting(request, new AbortController().signal)).toBe(
      "unavailable"
    )
    expect(failures).toEqual(["web audio tone: unavailable"])
    expect(control.state()).toBe("withdrawn")
    expect(sound.audible()).toBe(false)
  })

  it("reports a cry the speech session failed to say", async () => {
    const failures: Array<string> = []
    detach = addFailureSink(({ port }) => failures.push(port))
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const tones = fakeTones()
    const sound = feelingSound({
      control: on(),
      speaker: fakeSpeaker({ kind: "failed", error: new Error("tts") }),
      tones: tones.factory,
    })!
    const stung = sound.sting(request, new AbortController().signal)
    await settle()
    tones.end()
    expect(await stung).toBe("unavailable")
    expect(failures).toEqual(["speech session"])
  })
})
