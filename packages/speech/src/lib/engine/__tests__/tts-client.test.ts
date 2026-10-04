/**
 * What each hosted provider is sent. A request body is a boundary: the
 * provider gets its own language tag (`LANGUAGE_TAG`), never this
 * package's `SpokenLanguage`, which Google and Azure would reject.
 */

import { createTTSClient } from "@speech/lib/engine/tts-client"
import type { FetchImpl } from "@speech/lib/engine/tts-client"
import type { TTSProvider, VoiceConfig } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"
import { describe, expect, it } from "vitest"

function firstVoice(
  provider: TTSProvider,
  language: VoiceConfig["language"]
): VoiceConfig {
  const voice = BUILTIN_VOICES[provider].find(
    (candidate) => candidate.language === language
  )
  if (!voice) throw new Error(`${provider} has no ${language} voice`)
  return voice
}

/** Synthesizes once and hands back the request body the provider got. */
async function bodySent(
  provider: TTSProvider,
  voice: VoiceConfig
): Promise<string> {
  let sent = ""
  const fetchImpl: FetchImpl = (_url, init) => {
    sent = String(init?.body)
    return Promise.resolve(
      new Response(JSON.stringify({ audioContent: "" }), { status: 200 })
    )
  }
  const client = createTTSClient({
    service: { provider, apiUrl: "https://tts.test", apiKey: "k" },
    fetchImpl,
  })
  await client.synthesize("hello", voice)
  return sent
}

describe("hosted request bodies carry the provider's language tag", () => {
  it("sends Google a BCP-47 languageCode", async () => {
    const body: unknown = JSON.parse(
      await bodySent("google", firstVoice("google", "english"))
    )
    expect(body).toMatchObject({ voice: { languageCode: "en-US" } })
  })

  it("sends Azure a BCP-47 xml:lang", async () => {
    const body = await bodySent("azure", firstVoice("azure", "english"))
    expect(body).toContain('xml:lang="en-US"')
    expect(body).not.toContain("english")
  })
})
