/**
 * @vitest-environment jsdom
 *
 * Settings names the voice a Korean lesson is heard in, by the speech
 * session's own rule, not just what the dropdown holds.
 */

import type { HostedVoiceChoice, SpeechAdapter } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HostedVoiceFields } from "@/components/settings/hosted-voice-fields"

function renderFields(value: HostedVoiceChoice): void {
  render(<HostedVoiceFields value={value} onChange={vi.fn()} />)
}

afterEach(() => {
  cleanup()
})

describe("HostedVoiceFields - the voice a lesson is heard in", () => {
  it("names the chosen voice when it reads Korean", () => {
    renderFields({ provider: "openai", voiceId: "ko-KR-InJoonNeural" })
    expect(
      screen.getByText("Korean lessons are read by In-Joon (Korean Male).")
    ).toBeDefined()
  })

  it("names the Korean default, and why, when the chosen voice can't read Korean", () => {
    renderFields({ provider: "openai", voiceId: "onyx" })
    expect(
      screen.getByText(
        "Korean lessons are read by Sun-Hi (Korean Female), since Onyx can't read Korean."
      )
    ).toBeDefined()
  })

  it("names the Korean default when nothing is chosen", () => {
    renderFields({ provider: "openai", voiceId: null })
    expect(
      screen.getByText("Korean lessons are read by Sun-Hi (Korean Female).")
    ).toBeDefined()
  })

  it("says so when the provider has no Korean voice at all", () => {
    renderFields({ provider: "google", voiceId: null })
    expect(screen.getByText(/has no Korean voice here/)).toBeDefined()
  })
})

describe("HostedVoiceFields - while the browser's voice is the one speaking", () => {
  it("says the browser reads lessons, and the choice here applies once signed in", async () => {
    const adapter: SpeechAdapter = {
      id: "web-speech",
      supported: true,
      pending: 0,
      subscribe: () => () => undefined,
      describe: () => ({
        platform: "browser",
        voice: "Yuna",
        availability: "available",
      }),
      speak: () => Promise.resolve(),
      stop: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      setVolume: () => undefined,
      setPlaybackRate: () => undefined,
      dispose: () => undefined,
    }
    render(
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        <HostedVoiceFields
          value={{ provider: "openai", voiceId: "ko-KR-InJoonNeural" }}
          onChange={vi.fn()}
        />
      </SpeechProvider>
    )

    expect(
      await screen.findByText(
        "Lessons are read by Yuna, your browser's own voice right now. The voice chosen here applies when you're signed in."
      )
    ).toBeDefined()
    expect(screen.queryByText(/Korean lessons are read by In-Joon/)).toBeNull()
  })
})
