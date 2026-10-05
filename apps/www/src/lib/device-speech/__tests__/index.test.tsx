/**
 * @vitest-environment jsdom
 *
 * The phone's voice from www's side: handed to a real speech session as
 * its `native` backend, it speaks what applets say through the session, in
 * the voice picked from the phone's list, and is loud about a missing
 * Korean voice exactly once.
 */

import type { JSX } from "react"
import type {
  NativeSpeechEngine,
  NativeVoice,
  SayOptions,
  SpeechOutcome,
} from "@some-ui/speech"
import {
  SpeechProvider,
  useSpeaker,
  useVoicePreview,
  useVoiceReport,
} from "@some-ui/speech"
import { nativeSpeech } from "@some-ui/speech/native"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const fake = vi.hoisted(() => {
  // `hold`: lines wait for `finish`, and a line cut off never settles, as
  // the plugin's do.
  const state = { installed: true, hold: false }
  const spoken: Array<unknown> = []
  const held: Array<() => void> = []
  const openInstall = vi.fn((): Promise<void> => Promise.resolve())
  const engine = {
    speak: (request: unknown): Promise<void> => {
      spoken.push(request)
      return new Promise<void>((resolve) => {
        if (state.hold) held.push(resolve)
        else resolve()
      })
    },
    stop: (): Promise<void> => Promise.resolve(),
    getVoices: (): Promise<ReadonlyArray<NativeVoice>> =>
      Promise.resolve([
        {
          id: "en-us-x-iol-local",
          name: "English",
          language: "english",
          local: true,
        },
        {
          id: "ko-kr-x-ism-network",
          name: "Korean",
          language: "korean",
          local: false,
        },
        {
          id: "ko-kr-x-kob-local",
          name: "Korean",
          language: "korean",
          local: true,
        },
        // Konkani, as the transport hands it over: not a language of ours.
        {
          id: "kok-in-x-kok-local",
          name: "Konkani",
          language: null,
          local: true,
        },
      ]),
    isLanguageSupported: (): Promise<boolean> =>
      Promise.resolve(state.installed),
  }
  return { state, spoken, held, openInstall, engine }
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

const { deviceSpeechBackend, PREVIEW_TEXT, readDeviceVoices, voiceLabel } =
  await import("@/lib/device-speech")

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** Says `lines` through the page's speaker, one per press. */
const Lines = ({ lines }: { lines: ReadonlyArray<string> }): JSX.Element => {
  const speaker = useSpeaker()
  const options: SayOptions = { language: "korean" }
  return (
    <button
      type="button"
      onClick={() => {
        for (const line of lines) void speaker?.say(line, options)
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
        language: "korean",
        native: deviceSpeechBackend(voiceId),
        adapters: { static: nativeSpeech },
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
  fake.held.length = 0
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
        language: "korean",
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

describe("the phone's voice on return to the app", () => {
  it("asks again for a voice found missing, so installing one clears the warning", async () => {
    fake.state.installed = false
    const Report = (): JSX.Element => (
      <p data-testid="availability">{useVoiceReport("korean")?.availability}</p>
    )
    render(
      <SpeechProvider
        config={{
          mode: "static",
          language: "korean",
          native: deviceSpeechBackend(""),
          adapters: { static: nativeSpeech },
        }}
      >
        <Report />
      </SpeechProvider>
    )
    await settle()
    const availability = screen.getByTestId("availability")
    expect(availability.textContent).toBe("missing")

    // The Install button's round trip: the system settings, then back.
    fake.state.installed = true
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })
    document.dispatchEvent(new Event("visibilitychange"))
    await settle()

    expect(availability.textContent).toBe("available")
  })
})

describe("a voice sample in Settings", () => {
  it("goes through the session: its voice for its line, and the lesson's line said again after", async () => {
    fake.state.hold = true
    let lesson: SpeechOutcome | "pending" = "pending"
    const Sample = (): JSX.Element => {
      const speaker = useSpeaker()
      const preview = useVoicePreview()
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void speaker
                ?.say("하나", { language: "korean" })
                .then((outcome) => {
                  lesson = outcome
                })
            }}
          >
            say
          </button>
          <button
            type="button"
            onClick={() => {
              void preview?.play(PREVIEW_TEXT, {
                language: "korean",
                voice: { kind: "voice", id: "ko-kr-x-kob-local" },
              })
            }}
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
          language: "korean",
          native: deviceSpeechBackend(""),
          adapters: { static: nativeSpeech },
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
    expect(lesson).toBe("pending")

    // The sample finishes; the lesson's line, cut off, is said again.
    fake.state.hold = false
    fake.held.at(-1)?.()
    await settle()

    expect(fake.spoken).toEqual([
      expect.objectContaining({ text: "하나", voiceId: undefined }),
      expect.objectContaining({
        text: PREVIEW_TEXT,
        voiceId: "ko-kr-x-kob-local",
      }),
      expect.objectContaining({ text: "하나", voiceId: undefined }),
    ])
    expect(lesson).toEqual({ kind: "heard" })
  })
})

describe("the phone's voices for Settings", () => {
  it("lists Korean only (not Konkani, `kok`), offline voices first", async () => {
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
        language: "korean",
        local: true,
      })
    ).toBe("Voice KOB (offline)")
    expect(
      voiceLabel({
        id: "ko-kr-x-ism-network",
        name: "Voice ISM",
        language: "korean",
        local: false,
      })
    ).toBe("Voice ISM (needs internet)")
  })
})
