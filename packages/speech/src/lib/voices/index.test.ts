import type { TTSProvider } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"
import {
  DEFAULT_HOSTED_VOICE,
  hostedVoiceFor,
  isTTSProvider,
  languageKeyOf,
  parseHostedVoiceChoice,
  TTS_PROVIDERS,
} from "@speech/lib/voices"
import { describe, expect, it } from "vitest"

const PROVIDERS: ReadonlyArray<TTSProvider> = TTS_PROVIDERS

describe("hostedVoiceFor - the person's choice speaks every line it can", () => {
  it("speaks a line in the chosen voice when the voice speaks its language", () => {
    const voice = hostedVoiceFor(
      { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
      "ko-KR"
    )
    expect(voice?.id).toBe("ko-KR-InJoonNeural")
  })

  it("gives a line the chosen voice cannot read its language's default", () => {
    // An English Edge voice handed Hangul answers with an HTTP 500.
    const voice = hostedVoiceFor(
      { provider: "openai", voiceId: "onyx" },
      "ko-KR"
    )
    expect(voice?.id).toBe("ko-KR-SunHiNeural")
  })

  it("gives a line its language's default when nothing is chosen", () => {
    expect(
      hostedVoiceFor({ provider: "openai", voiceId: null }, "ko")?.id
    ).toBe("ko-KR-SunHiNeural")
    expect(
      hostedVoiceFor({ provider: "openai", voiceId: null }, "en-US")?.id
    ).toBe("onyx")
  })

  it("gives no voice, rather than a wrong one, for a language the provider cannot speak", () => {
    expect(
      hostedVoiceFor({ provider: "google", voiceId: null }, "ko-KR")
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
        expect(languageKeyOf(voice?.language ?? "")).toBe(key)
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
          defaults[languageKeyOf(voice.language)],
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
