import { createSpeechAdapter } from "@speech/lib/adapters"
import { nativeSpeech } from "@speech/lib/adapters/native"
import { webSpeech } from "@speech/lib/adapters/web-speech"
import { createFakeNativeEngine, flushAsync } from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

/** Each entry's backend, through the session's front door. */

describe("webSpeech", () => {
  it("is the browser's own synthesizer", () => {
    const adapter = createSpeechAdapter({ backend: webSpeech })

    expect(adapter.id).toBe("web-speech")
    adapter.dispose()
  })
})

describe("nativeSpeech", () => {
  it("speaks through the phone's engine the app passes", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createSpeechAdapter({
      language: "korean",
      native: { engine: fake.engine },
      backend: nativeSpeech,
    })

    expect(adapter.id).toBe("native")
    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()
    expect(fake.spoken[0]?.language).toBe("korean")
    adapter.dispose()
  })

  it("refuses to start without an engine, rather than going quiet", () => {
    expect(() => createSpeechAdapter({ backend: nativeSpeech })).toThrow(
      "nativeSpeech speaks through SpeechConfig.native"
    )
  })
})
