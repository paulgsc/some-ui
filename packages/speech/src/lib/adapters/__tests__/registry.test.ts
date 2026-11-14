import type { SpeechAdapter } from "@speech/lib/adapters"
import { createSpeechAdapter } from "@speech/lib/adapters"
import { webSpeech } from "@speech/lib/adapters/web-speech"
import { createControllableAdapter } from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

/**
 * The session's front door builds the one backend the app passes, from the
 * config it is given, and hands back whatever that backend built: there is
 * no other backend to fall back on.
 */

describe("createSpeechAdapter", () => {
  it("hands the config to the factory it is given", () => {
    let seen: string | undefined
    const adapter = createSpeechAdapter({
      language: "korean",
      backend: (config) => {
        seen = config.language
        return createControllableAdapter()
      },
    })

    expect(seen).toBe("korean")
    adapter.dispose()
  })

  it("takes a backend token from an entry as readily as a factory", () => {
    const adapter = createSpeechAdapter({ backend: webSpeech })

    expect(adapter.id).toBe("web-speech")
    adapter.dispose()
  })

  it("hands back a backend that cannot speak as it is, so the session can say so", () => {
    const silent: SpeechAdapter = {
      ...createControllableAdapter(),
      supported: false,
    }

    expect(createSpeechAdapter({ backend: () => silent })).toBe(silent)
  })
})
