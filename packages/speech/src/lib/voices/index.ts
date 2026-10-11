/**
 * @module voices
 *
 * Which hosted voice speaks a line. Hosted voices only: the device's own
 * synthesizers (the browser's `speechSynthesis`, a phone's TTS engine) are
 * someone else's API with someone else's voices, and they take a language,
 * never one of ours.
 *
 * Every hosted voice is in `BUILTIN_VOICES`, known at compile time, so a
 * voice here is a closed type end to end: `HostedVoiceOf<P>` is the union of
 * provider `P`'s ids, and a choice pairs a provider with one of its own
 * voices. A stored string becomes a choice in exactly one place,
 * `parseHostedVoiceChoice`, where the app reads its settings.
 *
 * The rule a line follows, and the reason this module exists: **the person's
 * choice speaks every line in its language.** A line in another language
 * gets that language's declared default (`DEFAULT_HOSTED_VOICE`), and a
 * language the provider has no voice for gets none, which the adapter
 * reports as a failure rather than handing the text to a voice that cannot
 * read it (an English Edge voice given Hangul answers with an HTTP 500).
 * Nothing falls back to "the first voice in the list".
 *
 * A line read in a part (`lib/part`) keeps that rule where it can: the voice
 * above reads it when it is the part's gender, and otherwise the provider's
 * voice of that gender in the same language does. A provider with none reads
 * it in the voice above, so a part never costs a line its voice.
 */

import type { SpokenLanguage } from "@speech/lib/language"
import type { VoicePart } from "@speech/lib/part"
import type { TTSProvider, VoiceConfig } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"

/** Every hosted provider, in the order a picker lists them. */
export const TTS_PROVIDERS: ReadonlyArray<TTSProvider> = [
  "openai",
  "elevenlabs",
  "google",
  "azure",
  "custom",
]

/** For values read from storage, which are strings whatever the type says. */
export function isTTSProvider(value: unknown): value is TTSProvider {
  return TTS_PROVIDERS.some((provider) => provider === value)
}

/** One of provider `P`'s voices. */
export type HostedVoiceOf<P extends TTSProvider> =
  (typeof BUILTIN_VOICES)[P][number]["id"]

/** Any provider's voice. */
export type HostedVoiceId = HostedVoiceOf<TTSProvider>

/**
 * A provider and, optionally, the voice a person chose from it. A voice of
 * another provider does not type-check.
 */
export type HostedVoiceChoice = {
  [P in TTSProvider]: {
    readonly provider: P
    readonly voiceId: HostedVoiceOf<P> | null
  }
}[TTSProvider]

/**
 * The voice a language gets when the person's choice does not speak it.
 * Each value must be a voice of its own provider, which the type checks,
 * and must speak that language, which the tests do.
 */
export const DEFAULT_HOSTED_VOICE: {
  readonly [P in TTSProvider]: Readonly<
    Partial<Record<SpokenLanguage, HostedVoiceOf<P>>>
  >
} = {
  elevenlabs: { english: "rachel" },
  openai: { english: "onyx", korean: "ko-KR-SunHiNeural" },
  google: { english: "en-US-Wavenet-D" },
  azure: { english: "en-US-JennyNeural" },
  custom: {},
}

export function hostedVoicesOf(
  provider: TTSProvider
): ReadonlyArray<VoiceConfig> {
  return BUILTIN_VOICES[provider]
}

function findVoice(
  provider: TTSProvider,
  id: string | null | undefined
): VoiceConfig | null {
  if (!id) return null
  return hostedVoicesOf(provider).find((voice) => voice.id === id) ?? null
}

function choiceOf<P extends TTSProvider>(
  provider: P,
  voiceId: string | null | undefined
): { readonly provider: P; readonly voiceId: HostedVoiceOf<P> | null } {
  const voices: ReadonlyArray<{ readonly id: HostedVoiceOf<P> }> =
    BUILTIN_VOICES[provider]
  return {
    provider,
    voiceId: voices.find((voice) => voice.id === voiceId)?.id ?? null,
  }
}

/**
 * A provider and a stored voice id, as a choice: the id when it is one of
 * that provider's voices, otherwise no choice. The boundary where a string
 * from storage stops being a string.
 */
export function parseHostedVoiceChoice(
  provider: TTSProvider,
  voiceId: string | null | undefined
): HostedVoiceChoice {
  // One arm per provider, so each pairing is checked against that
  // provider's own catalogue.
  switch (provider) {
    case "elevenlabs": {
      return choiceOf("elevenlabs", voiceId)
    }
    case "openai": {
      return choiceOf("openai", voiceId)
    }
    case "google": {
      return choiceOf("google", voiceId)
    }
    case "azure": {
      return choiceOf("azure", voiceId)
    }
    case "custom": {
      return choiceOf("custom", voiceId)
    }
    default: {
      return assertNever(provider)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled TTS provider: ${JSON.stringify(value)}`)
}

/**
 * The voice that speaks a line in `language`: the chosen voice when it
 * speaks that language, else the language's default, else none. With no
 * `language`, the chosen voice, else English's default. With a `part`, that
 * voice when it is the part's gender, else the provider's first voice of the
 * part's gender in the same language, else that voice anyway.
 */
export function hostedVoiceFor(
  choice: HostedVoiceChoice,
  language: SpokenLanguage | undefined,
  part?: VoicePart
): VoiceConfig | null {
  const chosen = findVoice(choice.provider, choice.voiceId)
  const wanted = language ?? chosen?.language ?? "english"
  const defaults: Readonly<Partial<Record<SpokenLanguage, string>>> =
    DEFAULT_HOSTED_VOICE[choice.provider]
  const voice =
    chosen?.language === wanted
      ? chosen
      : findVoice(choice.provider, defaults[wanted])
  if (!voice || !part || voice.gender === part) return voice
  return (
    hostedVoicesOf(choice.provider).find(
      (other) => other.language === voice.language && other.gender === part
    ) ?? voice
  )
}
