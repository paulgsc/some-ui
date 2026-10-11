import type { SpeechConfig } from "@speech/lib/adapters"
import { createSpeechAdapter } from "@speech/lib/adapters"
import { httpSpeech } from "@speech/lib/adapters/http"
import { nativeSpeech } from "@speech/lib/adapters/native"
import { webSpeech } from "@speech/lib/adapters/web-speech"
import { createFakeNativeEngine, flushAsync } from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

/**
 * Each entry's backend, through the session's front door: what it builds
 * from the config, and the defaults it applies itself. The defaults live
 * here, not in the registry, so a build without the HTTP entry carries
 * none of the HTTP backend's configuration either.
 */

type Sent = { url: string; init: RequestInit | undefined }

/** Speaks one line through `httpSpeech` and returns the request it made. */
async function requestFor(
  config: Omit<SpeechConfig, "adapters">
): Promise<Sent> {
  const sent: Array<Sent> = []
  const adapter = createSpeechAdapter({
    mode: "server",
    ...config,
    adapters: { server: httpSpeech },
    fetchImpl: (url, init) => {
      sent.push({ url: String(url), init })
      return Promise.reject(new Error("no TTS server in tests"))
    },
  })
  await adapter.speak("hello").catch(() => undefined)
  adapter.dispose()
  const [request] = sent
  if (!request) throw new Error("httpSpeech sent no request")
  return request
}

function header(sent: Sent, name: string): string | undefined {
  return new Headers(sent.init?.headers).get(name) ?? undefined
}

/** One field of the request's JSON body. */
function bodyField(sent: Sent, field: string): unknown {
  const parsed: unknown = JSON.parse(String(sent.init?.body))
  return typeof parsed === "object" && parsed !== null
    ? Reflect.get(parsed, field)
    : undefined
}

describe("httpSpeech", () => {
  it("defaults to the openai-edge endpoint the compose file publishes", async () => {
    const sent = await requestFor({})

    expect(sent.url).toBe("http://localhost:5050/v1/audio/speech")
    expect(bodyField(sent, "response_format")).toBe("mp3")
  })

  it("takes the endpoint, key and format from config", async () => {
    const sent = await requestFor({
      endpoint: "https://tts.internal/v1/audio/speech",
      apiKey: "from-config",
      format: "wav",
    })

    expect(sent.url).toBe("https://tts.internal/v1/audio/speech")
    expect(header(sent, "Authorization")).toBe("Bearer from-config")
    expect(bodyField(sent, "response_format")).toBe("wav")
  })

  it("takes the provider from the hosted choice", async () => {
    const sent = await requestFor({
      hosted: { provider: "azure", voiceId: "en-US-GuyNeural" },
      apiKey: "azure-key",
    })

    expect(header(sent, "Ocp-Apim-Subscription-Key")).toBe("azure-key")
  })

  it("speaks each line in the chosen voice when it speaks the line's language", async () => {
    const sent: Array<unknown> = []
    const adapter = createSpeechAdapter({
      mode: "server",
      hosted: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
      adapters: { server: httpSpeech },
      fetchImpl: (_url, init) => {
        sent.push(JSON.parse(String(init?.body)).voice)
        return Promise.reject(new Error("no TTS server in tests"))
      },
    })

    await adapter
      .speak("안녕하세요", { language: "korean" })
      .catch(() => undefined)
    await adapter.speak("hello", { language: "english" }).catch(() => undefined)
    adapter.dispose()

    // InJoon cannot read English, so the English line gets English's
    // declared default rather than Hangul's voice.
    expect(sent).toEqual(["ko-KR-InJoonNeural", "onyx"])
    // And it says so, by name, for whoever is asking what they will hear.
    expect(adapter.describe("korean")).toEqual({
      platform: "hosted",
      voice: "In-Joon (Korean Male)",
      availability: "available",
    })
    expect(adapter.describe("english").voice).toBe("Onyx")
  })

  it("reads a line's part in the chosen voice when it is that gender, else the catalogue's", async () => {
    const sent: Array<unknown> = []
    const adapter = createSpeechAdapter({
      mode: "server",
      hosted: { provider: "openai", voiceId: "ko-KR-SunHiNeural" },
      adapters: { server: httpSpeech },
      fetchImpl: (_url, init) => {
        sent.push(JSON.parse(String(init?.body)).voice)
        return Promise.reject(new Error("no TTS server in tests"))
      },
    })

    for (const part of ["female", "male", undefined] as const) {
      await adapter
        .speak("앉아.", { language: "korean", part })
        .catch(() => undefined)
    }
    adapter.dispose()

    expect(sent).toEqual([
      "ko-KR-SunHiNeural",
      "ko-KR-InJoonNeural",
      "ko-KR-SunHiNeural",
    ])
  })
})

describe("webSpeech", () => {
  it("is the browser's own synthesizer", () => {
    const adapter = createSpeechAdapter({
      mode: "static",
      adapters: { static: webSpeech },
    })

    expect(adapter.id).toBe("web-speech")
    adapter.dispose()
  })
})

describe("nativeSpeech", () => {
  it("speaks through the phone's engine the app passes", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createSpeechAdapter({
      mode: "static",
      language: "korean",
      native: { engine: fake.engine },
      adapters: { static: nativeSpeech },
    })

    expect(adapter.id).toBe("native")
    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()
    expect(fake.spoken[0]?.language).toBe("korean")
    adapter.dispose()
  })

  it("refuses to start without an engine, rather than going quiet", () => {
    expect(() =>
      createSpeechAdapter({
        mode: "static",
        adapters: { static: nativeSpeech },
      })
    ).toThrow("nativeSpeech speaks through SpeechConfig.native")
  })
})
