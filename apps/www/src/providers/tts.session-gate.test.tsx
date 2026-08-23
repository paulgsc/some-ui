/**
 * @vitest-environment jsdom
 *
 * `TTSProvider` wraps the whole app above the router (see `providers/index`),
 * so it mounts on the public landing page and the passkey screen too. Before
 * this test existed, its `useSettings()`/`useAudioPreferences()` calls had no
 * `enabled` gate, so it fetched tenant settings before there was a session to
 * fetch them for - the same class of bug `use-study-nudge` had.
 */

import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const useSettingsSpy = vi.fn()
const useAudioPreferencesSpy = vi.fn()

vi.mock("@/lib/tenant", () => ({
  useSettings: (options?: { enabled?: boolean }): { data: undefined } => {
    useSettingsSpy(options)
    return { data: undefined }
  },
}))

vi.mock("@/lib/audio-preferences/use-audio-preferences", () => ({
  useAudioPreferences: (options?: {
    enabled?: boolean
  }): { preferences: { speech: { enabled: boolean } } } => {
    useAudioPreferencesSpy(options)
    return { preferences: { speech: { enabled: false } } }
  },
}))

vi.mock("@some-ui/speech", () => ({
  SpeechProvider: ({ children }: { children?: ReactNode }): ReactNode =>
    children,
}))

vi.mock("@/lib/tts-config", () => ({
  describeTTSEndpoint: (): { endpoint: null; source: "unavailable" } => ({
    endpoint: null,
    source: "unavailable",
  }),
  resolveTTSEndpoint: (): undefined => undefined,
}))

let hasSession = false
vi.mock("@/lib/auth-session", () => ({
  useHasDecorativeSession: (): boolean => hasSession,
}))

describe("TTSProvider: gates tenant settings on session", () => {
  it("does not enable the settings query before sign-in", async () => {
    hasSession = false
    const { TTSProvider } = await import("./tts")
    render(<TTSProvider>{null}</TTSProvider>)

    expect(useSettingsSpy).toHaveBeenCalledWith({ enabled: false })
    expect(useAudioPreferencesSpy).toHaveBeenCalledWith({ enabled: false })
  })

  it("enables both once a session exists", async () => {
    hasSession = true
    vi.resetModules()
    const { TTSProvider } = await import("./tts")
    render(<TTSProvider>{null}</TTSProvider>)

    expect(useSettingsSpy).toHaveBeenCalledWith({ enabled: true })
    expect(useAudioPreferencesSpy).toHaveBeenCalledWith({ enabled: true })
  })
})
