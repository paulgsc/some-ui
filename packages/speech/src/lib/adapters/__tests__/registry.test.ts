import type { SpeechAdapter } from "@speech/lib/adapters"
import { createSpeechAdapter } from "@speech/lib/adapters"
import { createControllableAdapter } from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

describe("createSpeechAdapter", () => {
  it("hands the config to the factory, and its adapter back as it is", () => {
    let seen: string | undefined
    const silent: SpeechAdapter = {
      ...createControllableAdapter(),
      supported: false,
    }
    const adapter = createSpeechAdapter({
      language: "korean",
      backend: (config) => {
        seen = config.language
        return silent
      },
    })

    expect(seen).toBe("korean")
    // No fallback: a backend that cannot speak is the session's to report.
    expect(adapter).toBe(silent)
  })
})
