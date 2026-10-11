import type { TTSProvider } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"
import {
  DEFAULT_HOSTED_VOICE,
  hostedVoiceFor,
  isTTSProvider,
  parseHostedVoiceChoice,
  TTS_PROVIDERS,
} from "@speech/lib/voices"
import { describe, expect, it } from "vitest"

const PROVIDERS: ReadonlyArray<TTSProvider> = TTS_PROVIDERS

describe("hostedVoiceFor - the person's choice speaks every line it can", () => {
  it("speaks a line in the chosen voice when the voice speaks its language", () => {
    const voice = hostedVoiceFor(
      { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
      "korean"
    )
    expect(voice?.id).toBe("ko-KR-InJoonNeural")
  })

  it("gives a line the chosen voice cannot read its language's default", () => {
    // An English Edge voice handed Hangul answers with an HTTP 500.
    const voice = hostedVoiceFor(
      { provider: "openai", voiceId: "onyx" },
      "korean"
    )
    expect(voice?.id).toBe("ko-KR-SunHiNeural")
  })

  it("gives a line its language's default when nothing is chosen", () => {
    expect(
      hostedVoiceFor({ provider: "openai", voiceId: null }, "korean")?.id
    ).toBe("ko-KR-SunHiNeural")
    expect(
      hostedVoiceFor({ provider: "openai", voiceId: null }, "english")?.id
    ).toBe("onyx")
  })

  it("gives no voice, rather than a wrong one, for a language the provider cannot speak", () => {
    expect(
      hostedVoiceFor({ provider: "google", voiceId: null }, "korean")
    ).toBeNull()
  })

  it("speaks a line with no language in the chosen voice", () => {
    expect(
      hostedVoiceFor(
        { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
        undefined
      )?.id
    ).toBe("ko-KR-InJoonNeural")
  })
})

describe("hostedVoiceFor - a part keeps the person's choice where it can", () => {
  it("reads a part in the chosen voice when it is the part's gender", () => {
    const choice = {
      provider: "openai",
      voiceId: "ko-KR-InJoonNeural",
    } as const
    expect(hostedVoiceFor(choice, "korean", "male")?.id).toBe(
      "ko-KR-InJoonNeural"
    )
  })

  it("reads the other part in the same language's voice of that gender", () => {
    const chosen = {
      provider: "openai",
      voiceId: "ko-KR-InJoonNeural",
    } as const
    expect(hostedVoiceFor(chosen, "korean", "female")?.id).toBe(
      "ko-KR-SunHiNeural"
    )
    const none = { provider: "openai", voiceId: null } as const
    expect(hostedVoiceFor(none, "korean", "male")?.id).toBe(
      "ko-KR-InJoonNeural"
    )
  })
})

describe("DEFAULT_HOSTED_VOICE", () => {
  it.each(PROVIDERS)(
    "%s: every default is a voice of that provider in that language",
    (provider) => {
      const defaults: Readonly<Partial<Record<string, string>>> =
        DEFAULT_HOSTED_VOICE[provider]
      for (const [key, id] of Object.entries(defaults)) {
        const voice = BUILTIN_VOICES[provider].find(
          (candidate) => candidate.id === id
        )
        expect(voice, `${provider}.${key}`).toBeDefined()
        expect(voice?.language).toBe(key)
      }
    }
  )

  it.each(PROVIDERS)(
    "%s: every language the catalogue speaks has a default",
    (provider) => {
      const defaults: Readonly<Partial<Record<string, string>>> =
        DEFAULT_HOSTED_VOICE[provider]
      for (const voice of BUILTIN_VOICES[provider]) {
        expect(
          defaults[voice.language],
          `${provider}: ${voice.id}`
        ).toBeDefined()
      }
    }
  )
})

describe("parseHostedVoiceChoice - where a stored string stops being one", () => {
  it("keeps a voice of the provider", () => {
    expect(parseHostedVoiceChoice("openai", "ko-KR-InJoonNeural")).toEqual({
      provider: "openai",
      voiceId: "ko-KR-InJoonNeural",
    })
  })

  it("drops a voice of another provider, and anything else", () => {
    expect(parseHostedVoiceChoice("google", "ko-KR-InJoonNeural")).toEqual({
      provider: "google",
      voiceId: null,
    })
    expect(parseHostedVoiceChoice("openai", "not-a-voice").voiceId).toBeNull()
    expect(parseHostedVoiceChoice("openai", "").voiceId).toBeNull()
  })
})

describe("isTTSProvider", () => {
  it("accepts every provider and nothing else", () => {
    for (const provider of Object.keys(BUILTIN_VOICES)) {
      expect(isTTSProvider(provider)).toBe(true)
    }
    expect(isTTSProvider("polly")).toBe(false)
    expect(isTTSProvider(undefined)).toBe(false)
  })
})
