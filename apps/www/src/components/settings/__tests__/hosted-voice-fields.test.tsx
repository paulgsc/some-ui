/**
 * @vitest-environment jsdom
 *
 * Settings names the voice a Korean lesson is actually heard in, by the
 * same rule the speech session follows. The dropdown alone used to read
 * "Onyx" with nothing chosen while lessons spoke SunHi.
 */

import type { HostedVoiceChoice } from "@some-ui/speech"
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
