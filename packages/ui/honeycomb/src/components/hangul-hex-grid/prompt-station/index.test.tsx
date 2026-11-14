/**
 * A word prompt is spoken by the page's speech session, like every other
 * line on the page: in Korean, in the session's voice, and not at all
 * while it is muted. Honeycomb has no voice of its own.
 */

import type { ReactNode } from "react"
import { HANGUL_WORDS } from "@honeycomb/data"
import type { SpeechAdapter } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PromptStation } from "."

const word = HANGUL_WORDS[0]

/**
 * A device voice that holds each line until `finish`, and drops it when
 * cancelled, as the settlement laws require (`AbortError`).
 */
function holdingAdapter(): SpeechAdapter & {
  said: Array<string>
  languages: Array<string | undefined>
  finish: () => void
} {
  const said: Array<string> = []
  const languages: Array<string | undefined> = []
  let current: { resolve: () => void; reject: (error: Error) => void } | null =
    null
  const drop = (): void => {
    const dropped = current
    current = null
    dropped?.reject(new DOMException("stopped", "AbortError"))
  }
  return {
    id: "web-speech",
    supported: true,
    pending: 0,
    said,
    languages,
    finish: (): void => {
      const finished = current
      current = null
      finished?.resolve()
    },
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
    subscribe: () => () => undefined,
    speak: (text, options = {}): Promise<void> => {
      drop()
      said.push(text)
      languages.push(options.language)
      return new Promise<void>((resolve, reject) => {
        const entry = { resolve, reject }
        current = entry
        options.signal?.addEventListener("abort", () => {
          if (current === entry) current = null
          reject(new DOMException("stopped", "AbortError"))
        })
      })
    },
    stop: drop,
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: drop,
  }
}

function session(
  adapter: SpeechAdapter,
  muted = false
): (props: { children: ReactNode }) => ReactNode {
  const Session = ({ children }: { children: ReactNode }): ReactNode => (
    <SpeechProvider config={{ backend: () => adapter }} muted={muted}>
      {children}
    </SpeechProvider>
  )
  return Session
}

function renderPrompt(adapter: SpeechAdapter, muted = false): void {
  if (!word) throw new Error("no seed words")
  render(
    <PromptStation
      stimulus={{ kind: "icon", name: word.id }}
      tier="icon-tts"
      progress={null}
    />,
    { wrapper: session(adapter, muted) }
  )
}

describe("PromptStation - speaking through the page's session", () => {
  it("speaks the word, in Korean, through the session", async () => {
    const adapter = holdingAdapter()
    renderPrompt(adapter)

    await waitFor(() => expect(adapter.said).toEqual([word?.ttsText]))
    expect(adapter.languages).toEqual(["korean"])
  })

  it("says nothing while the session is muted", async () => {
    const adapter = holdingAdapter()
    renderPrompt(adapter, true)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(adapter.said).toEqual([])
  })
})

describe("PromptStation - a hint and a tap", () => {
  it("lets a tap replace the hint it cuts off, which is not said again after it", async () => {
    if (!word) throw new Error("no seed words")
    const adapter = holdingAdapter()
    render(
      <PromptStation
        stimulus={{ kind: "icon", name: word.id }}
        tier="icon-tts"
        progress={null}
      />,
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <SpeechProvider config={{ backend: () => adapter }}>
            {children}
          </SpeechProvider>
        ),
      }
    )
    await waitFor(() => expect(adapter.said).toEqual([word.ttsText]))

    fireEvent.click(screen.getByRole("button", { name: /Replay/ }))
    await waitFor(() => expect(adapter.said).toHaveLength(2))
    await act(async () => {
      adapter.finish()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(adapter.said).toEqual([word.ttsText, word.ttsText])
  })
})
