import { addFailureSink } from "@some-ui/intent-kit"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { speakerVoice } from "@topik/lib/topik/adapter/voice-port"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

const speakerSaying = (
  outcome: SpeechOutcome,
  available = true,
  { muted = false, voice = "available" } = {}
): Speaker & { say: Mock<Speaker["say"]> } => ({
  available,
  muted,
  say: vi.fn<Speaker["say"]>(() => Promise.resolve(outcome)),
  stop: vi.fn(),
  describe: vi.fn<Speaker["describe"]>(() => ({
    platform: "browser",
    voice: null,
    availability: voice === "missing" ? "missing" : "available",
  })),
  subscribe: vi.fn(() => () => {}),
})

const request = {
  beat: "s1-l1",
  text: "앉아.",
  speaker: "chairman",
  gender: null,
  interrupt: false,
} as const

describe("speakerVoice", () => {
  it("is no port at all when nothing can speak", () => {
    expect(speakerVoice(null)).toBeNull()
    expect(speakerVoice(speakerSaying({ kind: "heard" }, false))).toBeNull()
  })

  it("says the beat in Korean; a replay cuts in, a reached line waits", async () => {
    const speaker = speakerSaying({ kind: "heard" })
    const voice = speakerVoice(speaker)!
    const signal = new AbortController().signal
    expect(await voice.voice(request, signal)).toBe("presented")
    await voice.voice({ ...request, interrupt: true }, signal)
    expect(
      speaker.say.mock.calls.map(([text, options]) => [text, options.urgency])
    ).toEqual([
      ["앉아.", "next"],
      ["앉아.", "now"],
    ])
  })

  it("reads a character in their gender's part, and narration in the chosen voice as it is", async () => {
    const speaker = speakerSaying({ kind: "heard" })
    const voice = speakerVoice(speaker)!
    const signal = new AbortController().signal
    await voice.voice({ ...request, gender: "male" }, signal)
    await voice.voice({ ...request, gender: "female" }, signal)
    await voice.voice({ ...request, speaker: null }, signal)
    expect(speaker.say.mock.calls.map(([, options]) => options.part)).toEqual([
      "male",
      "female",
      undefined,
    ])
  })

  it("reads a muted, failed or ended line as not presented, and reports a failed one", async () => {
    const failures: Array<unknown> = []
    const detach = addFailureSink(({ error }) => failures.push(error.cause))
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const failed = new Error("x")
    const signal = new AbortController().signal
    for (const outcome of [
      { kind: "muted" },
      { kind: "ended" },
      { kind: "failed", error: failed },
    ] as const) {
      expect(
        await speakerVoice(speakerSaying(outcome))!.voice(request, signal)
      ).toBe("unavailable")
    }
    expect(
      await speakerVoice(speakerSaying({ kind: "preempted" }))!.voice(
        request,
        signal
      )
    ).toBe("cancelled")
    detach()
    expect(failures).toEqual([failed])
  })

  it("is audible unless muted or without a Korean voice", () => {
    const heard = { kind: "heard" } as const
    expect(speakerVoice(speakerSaying(heard))!.audible()).toBe(true)
    expect(
      speakerVoice(speakerSaying(heard, true, { muted: true }))!.audible()
    ).toBe(false)
    expect(
      speakerVoice(speakerSaying(heard, true, { voice: "missing" }))!.audible()
    ).toBe(false)
  })
})
