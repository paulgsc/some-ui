import { addFailureSink } from "@some-ui/intent-kit"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { feelingTone } from "@some-ui/styles/theme"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createSoundControl,
  feelingSound,
  SOUND_STORAGE_KEY,
} from "@topik/lib/topik/adapter/sound-port"
import { fakeTones } from "@topik/lib/topik/adapter/sound-port/fake-tones"
import type { Mock } from "vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

const fakeSpeaker = (
  outcome: SpeechOutcome = { kind: "heard" },
  availability: "available" | "missing" = "available"
): Speaker & { say: Mock<Speaker["say"]> } => ({
  available: true,
  muted: false,
  say: vi.fn<Speaker["say"]>(() => Promise.resolve(outcome)),
  stop: vi.fn(),
  describe: vi.fn<Speaker["describe"]>(() => ({
    platform: "browser",
    voice: null,
    availability,
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

const request = { feeling: "cringe" }

let detach = (): void => undefined
afterEach(() => {
  detach()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

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
    expect(tones.made()).toBe(0)
    expect(speaker.say).not.toHaveBeenCalled()
  })

  it("makes its context inside the tap, then says the cry once the tone has ended", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker()
    const sound = feelingSound({
      control: on(),
      speaker,
      tones: tones.factory,
    })!
    const stung = sound.sting(request, new AbortController().signal)
    // Synchronously: a phone plays only a context made during the gesture.
    expect(tones.made()).toBe(1)
    await settle()
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

  it("says no cry where no voice speaks Korean", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker({ kind: "heard" }, "missing")
    const sound = feelingSound({
      control: on(),
      speaker,
      tones: tones.factory,
    })!
    const stung = sound.sting(request, new AbortController().signal)
    await settle()
    tones.end()
    expect(await stung).toBe("unavailable")
    expect(speaker.say).not.toHaveBeenCalled()
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

  it("stops the tone, closes its context and says no cry when its signal fires", async () => {
    const tones = fakeTones()
    const speaker = fakeSpeaker()
    const sound = feelingSound({
      control: on(),
      speaker,
      tones: tones.factory,
    })!
    const stop = new AbortController()
    const stung = sound.sting({ feeling: "fury" }, stop.signal)
    await settle()
    stop.abort()
    expect(await stung).toBe("cancelled")
    expect(tones.sources.every(({ stopped }) => stopped)).toBe(true)
    // fury's fall crashes.
    expect(tones.sources.map(({ kind }) => kind)).toContain("noise")
    expect(tones.closed()).toBe(1)
    expect(speaker.say).not.toHaveBeenCalled()
  })

  it("closes a context whose resume never settles, abandoned or past its deadline", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    vi.useFakeTimers()
    const abandoned = fakeTones({ resume: "never" })
    const control = on()
    const stop = new AbortController()
    const first = feelingSound({
      control,
      speaker: fakeSpeaker(),
      tones: abandoned.factory,
    })!.sting(request, stop.signal)
    stop.abort()
    expect(await first).toBe("cancelled")
    expect(abandoned.closed()).toBe(1)

    const late = fakeTones({ resume: "never" })
    const second = feelingSound({
      control,
      speaker: fakeSpeaker(),
      tones: late.factory,
    })!.sting(request, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await second).toBe("unavailable")
    expect(late.closed()).toBe(1)
    // A tone that timed out may play next time: the control stays.
    expect(control.state()).toBe("on")
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
})
