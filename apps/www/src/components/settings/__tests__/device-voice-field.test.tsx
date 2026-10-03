/**
 * @vitest-environment jsdom
 *
 * The phone's voice control (#1628): the Korean voices the phone has, or,
 * when it has none, the one sentence and button that fix it.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as DeviceSpeechModule from "@/lib/device-speech"
import type { DeviceVoices } from "@/lib/device-speech"

const fake = vi.hoisted(() => {
  const state: { voices: DeviceVoices } = {
    voices: { installed: false, voices: [] },
  }
  return {
    state,
    openVoiceInstall: vi.fn(),
    previewDeviceVoice: vi.fn(),
  }
})

vi.mock("@/lib/device-speech", async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceSpeechModule>()),
  readDeviceVoices: (): Promise<DeviceVoices> =>
    Promise.resolve(fake.state.voices),
  openVoiceInstall: fake.openVoiceInstall,
  previewDeviceVoice: fake.previewDeviceVoice,
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
          lang: "ko-KR",
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
          lang: "ko-KR",
          local: true,
        },
      ],
    }
    renderField("ko-kr-x-gone-local")

    await screen.findByText("Phone default")
    fireEvent.click(screen.getByRole("button", { name: "Play sample" }))
    expect(fake.previewDeviceVoice).toHaveBeenCalledWith(undefined)
  })

  it("previews the voice that is chosen", async () => {
    fake.state.voices = {
      installed: true,
      voices: [
        {
          id: "ko-kr-x-kob-local",
          name: "Voice KOB",
          lang: "ko-KR",
          local: true,
        },
      ],
    }
    renderField("ko-kr-x-kob-local")

    await screen.findByText("Voice KOB (offline)")
    fireEvent.click(screen.getByRole("button", { name: "Play sample" }))
    expect(fake.previewDeviceVoice).toHaveBeenCalledWith("ko-kr-x-kob-local")
  })
})
