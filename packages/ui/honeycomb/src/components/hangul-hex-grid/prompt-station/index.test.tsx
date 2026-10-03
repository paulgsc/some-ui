/**
 * A word prompt is spoken by the page's speech session, like every other
 * line on the page: in the voice the session was set to, and not at all
 * while it is muted. Honeycomb has no voice of its own.
 */

import type { ReactNode } from "react"
import { HANGUL_WORDS } from "@honeycomb/data"
import { SpeechProvider } from "@some-ui/speech"
import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PromptStation } from "."

const word = HANGUL_WORDS[0]

function hostedSession(
  sent: Array<string>,
  muted = false
): (props: { children: ReactNode }) => ReactNode {
  const fetchImpl = (
    _url: unknown,
    init?: { body?: unknown }
  ): Promise<Response> => {
    const body: unknown = JSON.parse(String(init?.body))
    if (typeof body === "object" && body !== null && "voice" in body) {
      sent.push(String(body.voice))
    }
    return Promise.reject(new Error("no TTS server in tests"))
  }
  const HostedSession = ({ children }: { children: ReactNode }): ReactNode => (
    <SpeechProvider
      config={{
        mode: "server",
        hosted: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
        fetchImpl,
        // jsdom has no Web Audio; without this the hosted voice would fall
        // back to the device's.
        fallbackWhenUnsupported: false,
      }}
      muted={muted}
    >
      {children}
    </SpeechProvider>
  )
  return HostedSession
}

function renderPrompt(sent: Array<string>, muted = false): void {
  if (!word) throw new Error("no seed words")
  render(
    <PromptStation
      stimulus={{ kind: "icon", name: word.id }}
      tier="icon-tts"
      progress={null}
    />,
    { wrapper: hostedSession(sent, muted) }
  )
}

describe("PromptStation - speaking through the page's session", () => {
  it("speaks the word in the voice the session was set to", async () => {
    const sent: Array<string> = []
    renderPrompt(sent)

    await waitFor(() => expect(sent).toEqual(["ko-KR-InJoonNeural"]))
  })

  it("says nothing while the session is muted", async () => {
    const sent: Array<string> = []
    renderPrompt(sent, true)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sent).toEqual([])
  })
})
