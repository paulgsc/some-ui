/**
 * @vitest-environment jsdom
 *
 * The phone's voice control (#1628): the Korean voices the phone has, or,
 * when it has none, the one sentence and button that fix it.
 */

import type { ReactNode } from "react"
import type * as SpeechModule from "@some-ui/speech"
import type { SpeechOutcome, VoicePreview } from "@some-ui/speech"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as DeviceSpeechModule from "@/lib/device-speech"
import type { DeviceVoices } from "@/lib/device-speech"
import { PREVIEW_TEXT } from "@/lib/device-speech"

const fake = vi.hoisted(() => {
  const state: { voices: DeviceVoices; muted: boolean } = {
    voices: { installed: false, voices: [] },
    muted: false,
  }
  return {
    state,
    openVoiceInstall: vi.fn(),
    play: vi.fn(
      (..._args: Parameters<VoicePreview["play"]>): Promise<SpeechOutcome> =>
        Promise.resolve({ kind: "heard" })
    ),
  }
})

vi.mock("@/lib/device-speech", async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceSpeechModule>()),
  readDeviceVoices: (): Promise<DeviceVoices> =>
    Promise.resolve(fake.state.voices),
  openVoiceInstall: fake.openVoiceInstall,
}))

vi.mock("@some-ui/speech", async (importOriginal) => ({
  ...(await importOriginal<typeof SpeechModule>()),
  useVoicePreview: (): VoicePreview => ({
    play: fake.play,
    muted: fake.state.muted,
  }),
}))

const { DeviceVoiceField } = await import(
  "@/components/settings/device-voice-field"
)

function renderField(value = ""): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<DeviceVoiceField value={value} onChange={onChange} />, { wrapper })
  return { onChange }
}

afterEach(() => {
  cleanup()
  fake.state.voices = { installed: false, voices: [] }
  fake.state.muted = false
  vi.clearAllMocks()
})

describe("DeviceVoiceField", () => {
  it("says the phone has no Korean voice, and offers to install one", async () => {
    fake.state.voices = { installed: false, voices: [] }
    renderField()

    await screen.findByText(/no Korean voice installed/)
    fireEvent.click(
      screen.getByRole("button", { name: "Install a Korean voice" })
    )

    expect(fake.openVoiceInstall).toHaveBeenCalledTimes(1)
  })

  it("treats voices without voice data as no voice at all", async () => {
    fake.state.voices = {
      installed: false,
      voices: [
        {
          id: "ko-kr-x-ism-network",
          name: "Korean",
          language: "korean",
          local: false,
        },
      ],
    }
    renderField()

    await screen.findByText(/no Korean voice installed/)
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("plays the chosen voice, and an uninstalled choice reads as the default", async () => {
    fake.state.voices = {
      installed: true,
      voices: [
        {
          id: "ko-kr-x-kob-local",
          name: "Voice KOB",
          language: "korean",
          local: true,
        },
      ],
    }
    renderField("ko-kr-x-gone-local")

    await screen.findByText("Phone default")
    fireEvent.click(screen.getByRole("button", { name: "Play sample" }))
    // The phone's default, not the voice saved before: an absent voice
    // would read as "the person's choice".
    expect(fake.play).toHaveBeenCalledWith(PREVIEW_TEXT, {
      language: "korean",
      voice: { kind: "engine-default" },
    })
  })

  it("previews the voice that is chosen", async () => {
    fake.state.voices = {
      installed: true,
      voices: [
        {
          id: "ko-kr-x-kob-local",
          name: "Voice KOB",
          language: "korean",
          local: true,
        },
      ],
    }
    renderField("ko-kr-x-kob-local")

    await screen.findByText("Voice KOB (offline)")
    fireEvent.click(screen.getByRole("button", { name: "Play sample" }))
    expect(fake.play).toHaveBeenCalledWith(PREVIEW_TEXT, {
      language: "korean",
      voice: { kind: "voice", id: "ko-kr-x-kob-local" },
    })
  })

  it("says why there is no sample while voice output is muted", async () => {
    fake.state.muted = true
    fake.state.voices = {
      installed: true,
      voices: [
        {
          id: "ko-kr-x-kob-local",
          name: "Voice KOB",
          language: "korean",
          local: true,
        },
      ],
    }
    renderField("ko-kr-x-kob-local")

    await screen.findByText("Voice KOB (offline)")
    expect(
      screen
        .getByRole("button", { name: "Play sample" })
        .hasAttribute("disabled")
    ).toBe(true)
    expect(screen.getByText(/Voice output is muted/)).toBeDefined()
  })
})
