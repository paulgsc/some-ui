/**
 * @vitest-environment jsdom
 *
 * `SpeechProvider`'s mount effect builds a real adapter - an audio context,
 * a network client (see `packages/speech/src/components/speech-provider`).
 * `TTSProvider` wraps the whole app above the router, and where the speech is
 * made depends on whose data this is:
 *
 * - on the device, the browser's own voice (`mode: "static"`), so what a
 *   learner reads aloud never reaches the operator's TTS service;
 * - on the account, the server's speech service;
 * - in the Android app, the phone's own engine (`mode: "static"` with a
 *   `native` backend), in Korean;
 * - while a returning account user's authority is undecided, nothing is built
 *   at all.
 *
 * `children` (the routed app) renders in every case.
 */

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as DataModeModule from "@/lib/data-mode"

const speechProviderSpy = vi.fn()
const speechConfigSpy = vi.fn()

vi.mock("@some-ui/speech", () => ({
  SpeechProvider: ({
    children,
    config,
  }: {
    children?: ReactNode
    config: { mode: string }
  }): ReactNode => {
    speechProviderSpy(config.mode)
    speechConfigSpy(config)
    return children
  },
}))

let deviceBackend = false
vi.mock("@/lib/data-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof DataModeModule>()),
  get DEVICE_BACKEND(): boolean {
    return deviceBackend
  },
}))

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

vi.mock("@/lib/tts-config", () => ({
  describeTTSEndpoint: (): { endpoint: null; source: "unavailable" } => ({
    endpoint: null,
    source: "unavailable",
  }),
  resolveTTSEndpoint: (): undefined => undefined,
}))

let kind: "pending" | "local" | "account" = "pending"
vi.mock("@/lib/authority", () => ({
  useAuthority: (): { kind: typeof kind; epoch: number } => ({
    kind,
    epoch: 0,
  }),
}))

afterEach(() => {
  cleanup()
  speechProviderSpy.mockClear()
  speechConfigSpy.mockClear()
  deviceBackend = false
})

describe("TTSProvider: where the speech is made follows whose data this is", () => {
  const children = <div>routed content</div>

  it("builds nothing while a returning account user's authority is undecided", async () => {
    kind = "pending"
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    screen.getByText("routed content")
    expect(speechProviderSpy).not.toHaveBeenCalled()
  })

  it("speaks with the browser's own voice on the device, so no lesson text leaves it", async () => {
    kind = "local"
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    screen.getByText("routed content")
    expect(speechProviderSpy).toHaveBeenCalledWith("static")
  })

  it("uses the server's speech service on the account", async () => {
    kind = "account"
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    screen.getByText("routed content")
    // The test build is a server build (`DATA_MODE` is "server").
    expect(speechProviderSpy).toHaveBeenCalledWith("server")
  })

  it("speaks Korean with the phone's own engine in the Android app, whatever the account", async () => {
    kind = "account"
    deviceBackend = true
    const { TTSProvider } = await import("@/providers/tts")
    render(<TTSProvider>{children}</TTSProvider>)

    expect(speechConfigSpy).toHaveBeenCalledWith({
      mode: "static",
      language: "korean",
      native: expect.objectContaining({
        engine: expect.any(Object),
        voiceId: undefined,
      }),
    })
  })
})
