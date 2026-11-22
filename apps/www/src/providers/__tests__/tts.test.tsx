/**
 * @vitest-environment jsdom
 *
 * `SpeechProvider` builds a real adapter on mount, and which one depends on
 * the device the app runs on:
 *
 * - on the web, signed in or not, the browser's own voice;
 * - in the Android app, the phone's own engine, in Korean, and no other
 *   backend.
 *
 * `children` (the routed app) renders in every case.
 */

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const speechConfigSpy = vi.fn()

vi.mock("@some-ui/speech", () => ({
  SpeechProvider: ({
    children,
    config,
  }: {
    children?: ReactNode
    config: unknown
  }): ReactNode => {
    speechConfigSpy(config)
    return children
  },
}))

// Each backend is its own entry; which one a build passes is the point.
vi.mock("@some-ui/speech/web-speech", () => ({ webSpeech: "web backend" }))
vi.mock("@some-ui/speech/native", () => ({ nativeSpeech: "native backend" }))

vi.mock("@/lib/tenant", () => ({
  useSettings: (): { data: undefined } => ({ data: undefined }),
}))

vi.mock("@/lib/audio-preferences/use-audio-preferences", () => ({
  useAudioPreferences: (): {
    preferences: { speech: { enabled: boolean } }
  } => ({
    preferences: { speech: { enabled: false } },
  }),
}))

afterEach(() => {
  cleanup()
  speechConfigSpy.mockClear()
  vi.unstubAllEnvs()
})

describe("TTSProvider: the voice is the device's own", () => {
  const children = <div>routed content</div>

  it("speaks with the browser's own voice on the web", async () => {
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    screen.getByText("routed content")
    expect(speechConfigSpy).toHaveBeenCalledWith({ backend: "web backend" })
  })

  it("speaks Korean with the phone's own engine in the Android app", async () => {
    // Read where it is branched on (src/vite-env.d.ts), at render.
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    screen.getByText("routed content")
    expect(speechConfigSpy).toHaveBeenCalledWith({
      language: "korean",
      native: expect.objectContaining({
        engine: expect.any(Object),
        voiceId: undefined,
      }),
      backend: "native backend",
    })
  })
})
