import type { ReactNode } from "react"
import { SpeechProvider } from "@some-ui/speech"
import { httpSpeech } from "@some-ui/speech/http"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ConversationPreview } from "@topik/components/topik/conversation-preview"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { describe, expect, it, vi } from "vitest"

const first = FIXTURE_BATCHES[0]?.messages ?? []
const second = FIXTURE_BATCHES[1]?.messages ?? []

const lines = (): Array<string> =>
  first
    .concat(second)
    .map((message) => message.content)
    .filter((content) => screen.queryByText(content) !== null)

describe("ConversationPreview", () => {
  it("opens on the first conversation with every line showing", () => {
    render(<ConversationPreview batches={FIXTURE_BATCHES} />)
    expect(lines()).toEqual(first.map((message) => message.content))
    expect(screen.getAllByRole("tab")).toHaveLength(FIXTURE_BATCHES.length)
  })

  it("switches conversation from its tabs", () => {
    render(<ConversationPreview batches={FIXTURE_BATCHES} />)
    const [, secondTab] = screen.getAllByRole("tab")
    if (!secondTab) throw new Error("no second conversation tab")
    fireEvent.click(secondTab)
    expect(lines()).toEqual(second.map((message) => message.content))
  })

  it("plays a finished conversation over from its first line, one line at a time", () => {
    vi.useFakeTimers()
    render(<ConversationPreview batches={FIXTURE_BATCHES} lineMs={100} />)
    fireEvent.click(screen.getByRole("button", { name: /Play|Resume/ }))
    expect(lines()).toEqual([])
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(lines()).toEqual([first[0]?.content])
    // Each line's timer is set once the previous line has rendered.
    for (let line = 1; line <= first.length; line += 1) {
      act(() => {
        vi.advanceTimersByTime(100)
      })
    }
    expect(lines()).toEqual(first.map((message) => message.content))
    // Finished: the player stops by itself.
    expect(
      screen.getByRole("button", { name: /Play|Resume/ })
    ).toBeInTheDocument()
  })

  it("jumps to a line, showing everything up to it", () => {
    render(<ConversationPreview batches={FIXTURE_BATCHES} />)
    fireEvent.click(screen.getByText(first[1]?.content ?? ""))
    expect(lines()).toEqual(first.slice(0, 2).map((message) => message.content))
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }))
    expect(lines()).toEqual([])
  })
})

/**
 * The page's speech session decides who speaks and in what voice; a line
 * read from this preview only says what language it is in. A session set
 * to InJoon (the setting a person picks) must be heard as InJoon, and a
 * muted session must stay silent.
 */
describe("ConversationPreview - speaking through the page's session", () => {
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
    const HostedSession = ({
      children,
    }: {
      children: ReactNode
    }): ReactNode => (
      <SpeechProvider
        config={{
          mode: "server",
          hosted: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
          fetchImpl,
          // jsdom has no Web Audio; without this the hosted voice would
          // fall back to the device's.
          fallbackWhenUnsupported: false,
          adapters: { server: httpSpeech },
        }}
        muted={muted}
      >
        {children}
      </SpeechProvider>
    )
    return HostedSession
  }

  function speakFirstLine(): void {
    const line = screen.getByText(first[0]?.content ?? "")
    const speak = line.querySelector("button")
    if (!speak) throw new Error("no speak button on the first line")
    fireEvent.click(speak)
  }

  it("speaks in the voice the session was set to", async () => {
    const sent: Array<string> = []
    render(<ConversationPreview batches={FIXTURE_BATCHES} />, {
      wrapper: hostedSession(sent),
    })

    speakFirstLine()

    await waitFor(() => expect(sent).toEqual(["ko-KR-InJoonNeural"]))
  })

  it("says nothing while the session is muted", async () => {
    const sent: Array<string> = []
    render(<ConversationPreview batches={FIXTURE_BATCHES} />, {
      wrapper: hostedSession(sent, true),
    })

    speakFirstLine()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sent).toEqual([])
  })
})
