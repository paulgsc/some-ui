import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { speakerVoice } from "@topik/lib/topik/adapter/voice-port"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

const speakerSaying = (
  outcome: SpeechOutcome,
  available = true
): Speaker & { say: Mock<Speaker["say"]> } => ({
  available,
  muted: false,
  say: vi.fn<Speaker["say"]>(() => Promise.resolve(outcome)),
  stop: vi.fn(),
  describe: vi.fn(),
  subscribe: vi.fn(() => () => {}),
})

const request = {
  beat: "s1-l1",
  text: "앉아.",
  speaker: "chairman",
  interrupt: false,
}

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

  it("reads a muted, failed or ended line as not presented", async () => {
    const signal = new AbortController().signal
    for (const outcome of [
      { kind: "muted" },
      { kind: "ended" },
      { kind: "failed", error: new Error("x") },
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
  })
})
