/**
 * @vitest-environment jsdom
 *
 * The phone's voice from www's side: handed to a real speech session as
 * its `native` backend, it speaks what applets say through the session, in
 * the voice picked from the phone's list, and is loud about a missing
 * Korean voice exactly once.
 */

import type { JSX } from "react"
import type { NativeSpeechEngine, SayOptions } from "@some-ui/speech"
import { SpeechProvider, useSpeaker } from "@some-ui/speech"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const fake = vi.hoisted(() => {
  // `hold`: lines never settle, as the plugin's do when it is cut off.
  const state = { installed: true, hold: false }
  const spoken: Array<unknown> = []
  const openInstall = vi.fn((): Promise<void> => Promise.resolve())
  const engine = {
    speak: (request: unknown): Promise<void> => {
      spoken.push(request)
      return state.hold ? new Promise<void>(() => undefined) : Promise.resolve()
    },
    stop: (): Promise<void> => Promise.resolve(),
    getVoices: (): Promise<
      ReadonlyArray<{ id: string; name: string; lang: string; local: boolean }>
    > =>
      Promise.resolve([
        {
          id: "en-us-x-iol-local",
          name: "English",
          lang: "en-US",
          local: true,
        },
        {
          id: "ko-kr-x-ism-network",
          name: "Korean",
          lang: "ko-KR",
          local: false,
        },
        { id: "ko-kr-x-kob-local", name: "Korean", lang: "ko-KR", local: true },
      ]),
    isLanguageSupported: (): Promise<boolean> =>
      Promise.resolve(state.installed),
  }
  return { state, spoken, openInstall, engine }
})

type ToastOptions = { action: { label: string; onClick: () => void } }
const warning = vi.hoisted(() =>
  vi.fn((_title: string, _options: ToastOptions): void => undefined)
)
vi.mock("sonner", () => ({ toast: { warning } }))

vi.mock(
  "@/lib/device-speech/native",
  (): {
    engine: NativeSpeechEngine
    openVoiceInstall: () => Promise<void>
  } => ({
    engine: fake.engine,
    openVoiceInstall: fake.openInstall,
  })
)

const {
  deviceSpeechBackend,
  previewDeviceVoice,
  readDeviceVoices,
  voiceLabel,
} = await import("@/lib/device-speech")

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** Says `lines` through the page's speaker, one per press. */
const Lines = ({ lines }: { lines: ReadonlyArray<string> }): JSX.Element => {
  const speaker = useSpeaker()
  const options: SayOptions = { lang: "ko-KR" }
  return (
    <button
      type="button"
      onClick={() => {
        for (const line of lines) {
          void speaker?.say(line, options).catch(() => undefined)
        }
      }}
    >
      say
    </button>
  )
}

function renderSession(voiceId: string, lines: ReadonlyArray<string>): void {
  render(
    <SpeechProvider
      config={{
        mode: "static",
        lang: "ko-KR",
        native: deviceSpeechBackend(voiceId),
      }}
    >
      <Lines lines={lines} />
    </SpeechProvider>
  )
}

afterEach(() => {
  cleanup()
  fake.state.installed = true
  fake.state.hold = false
  fake.spoken.length = 0
  warning.mockClear()
})

describe("the phone's engine as the session's voice", () => {
  it("speaks a line in Korean, in the voice picked from the phone's list", async () => {
    renderSession("ko-kr-x-kob-local", ["안녕하세요"])
    await settle()

    screen.getByRole("button", { name: "say" }).click()
    await settle()

    expect(fake.spoken).toEqual([
      expect.objectContaining({
        text: "안녕하세요",
        lang: "ko-KR",
        voiceId: "ko-kr-x-kob-local",
      }),
    ])
  })

  it("says once that Korean is missing, with the way to install it", async () => {
    fake.state.installed = false
    renderSession("", ["하나"])
    await settle()

    screen.getByRole("button", { name: "say" }).click()
    await settle()
    screen.getByRole("button", { name: "say" }).click()
    await settle()

    expect(fake.spoken).toEqual([])
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(
      "No Korean voice on this phone",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Install" }),
      })
    )

    warning.mock.calls[0]?.[1].action.onClick()
    await settle()
    expect(fake.openInstall).toHaveBeenCalledTimes(1)
  })
})

describe("a voice sample in Settings", () => {
  it("settles the session's line in flight before the engine drops it", async () => {
    fake.state.hold = true
    let settled: "pending" | "rejected" = "pending"
    const Sample = (): JSX.Element => {
      const speaker = useSpeaker()
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void speaker?.say("하나", { lang: "ko-KR" }).catch(() => {
                settled = "rejected"
              })
            }}
          >
            say
          </button>
          <button
            type="button"
            onClick={() => previewDeviceVoice("ko-kr-x-kob-local", speaker)}
          >
            sample
          </button>
        </>
      )
    }
    render(
      <SpeechProvider
        config={{
          mode: "static",
          lang: "ko-KR",
          native: deviceSpeechBackend(""),
        }}
      >
        <Sample />
      </SpeechProvider>
    )
    await settle()

    screen.getByRole("button", { name: "say" }).click()
    await settle()
    screen.getByRole("button", { name: "sample" }).click()
    await settle()

    // The lesson's line would otherwise wait on the engine forever.
    expect(settled).toBe("rejected")
    expect(fake.spoken.at(-1)).toEqual(
      expect.objectContaining({ voiceId: "ko-kr-x-kob-local" })
    )
  })
})

describe("the phone's voices for Settings", () => {
  it("lists Korean only, offline voices first", async () => {
    const { installed, voices } = await readDeviceVoices()

    expect(installed).toBe(true)
    expect(voices.map((voice) => voice.id)).toEqual([
      "ko-kr-x-kob-local",
      "ko-kr-x-ism-network",
    ])
  })

  it("lists a voice by its name and whether it works offline", () => {
    expect(
      voiceLabel({
        id: "ko-kr-x-kob-local",
        name: "Voice KOB",
        lang: "ko-KR",
        local: true,
      })
    ).toBe("Voice KOB (offline)")
    expect(
      voiceLabel({
        id: "ko-kr-x-ism-network",
        name: "Voice ISM",
        lang: "ko-KR",
        local: false,
      })
    ).toBe("Voice ISM (needs internet)")
  })
})
