/**
 * @vitest-environment jsdom
 *
 * `SpeechProvider`'s mount effect builds a real adapter - an audio context,
 * a network client (see `packages/speech/src/components/speech-provider`) -
 * so it is exactly the kind of expensive client-side work that should not
 * run before there is a tenant workspace to speak for. `TTSProvider` wraps
 * the whole app above the router, so without this it would build that
 * adapter on the public landing page and the passkey screen too. This
 * asserts `<SpeechProvider>` isn't rendered at all while signed out - not
 * just that its data reads are disabled - while `children` (the routed app)
 * keeps rendering either way.
 */

import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const speechProviderSpy = vi.fn()

vi.mock("@some-ui/speech", () => ({
  SpeechProvider: ({ children }: { children?: ReactNode }): ReactNode => {
    speechProviderSpy()
    return children
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

let hasSession = false
vi.mock("@/lib/auth-session", () => ({
  useHasDecorativeSession: (): boolean => hasSession,
}))

describe("TTSProvider: does not build a speech session before there is a session", () => {
  it("renders children without SpeechProvider while signed out, and mounts it once signed in", async () => {
    hasSession = false
    const { TTSProvider } = await import("./tts")

    const { rerender } = render(
      <TTSProvider>
        <div>routed content</div>
      </TTSProvider>
    )

    screen.getByText("routed content")
    expect(speechProviderSpy).not.toHaveBeenCalled()

    hasSession = true
    rerender(
      <TTSProvider>
        <div>routed content</div>
      </TTSProvider>
    )

    screen.getByText("routed content")
    expect(speechProviderSpy).toHaveBeenCalled()
  })
})
