import type { ReactNode } from "react"
import type { SpeechAdapter } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
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

type Heard = { text: string; language: string | undefined }

/**
 * The page's speech session decides who speaks and in what voice; a line
 * read from this preview only says what language it is in. A line is
 * handed to the session in Korean, and a muted session stays silent.
 */
describe("ConversationPreview - speaking through the page's session", () => {
  /** A device voice that records each line it is handed, and settles it. */
  function recordingAdapter(heard: Array<Heard>): SpeechAdapter {
    return {
      id: "web-speech",
      supported: true,
      pending: 0,
      describe: () => ({
        platform: "browser",
        voice: null,
        availability: "available",
      }),
      subscribe: () => () => undefined,
      speak: (text, options = {}): Promise<void> => {
        heard.push({ text, language: options.language })
        return Promise.resolve()
      },
      stop: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      setVolume: () => undefined,
      setPlaybackRate: () => undefined,
      dispose: () => undefined,
    }
  }

  function session(
    heard: Array<Heard>,
    muted = false
  ): (props: { children: ReactNode }) => ReactNode {
    const adapter = recordingAdapter(heard)
    const Session = ({ children }: { children: ReactNode }): ReactNode => (
      <SpeechProvider config={{ backend: () => adapter }} muted={muted}>
        {children}
      </SpeechProvider>
    )
    return Session
  }

  function speakFirstLine(): void {
    const line = screen.getByText(first[0]?.content ?? "")
    const speak = line.querySelector("button")
    if (!speak) throw new Error("no speak button on the first line")
    fireEvent.click(speak)
  }

  it("hands the line to the session in Korean", async () => {
    const heard: Array<Heard> = []
    render(<ConversationPreview batches={FIXTURE_BATCHES} />, {
      wrapper: session(heard),
    })

    speakFirstLine()

    await waitFor(() =>
      expect(heard).toEqual([{ text: first[0]?.content, language: "korean" }])
    )
  })

  it("says nothing while the session is muted", async () => {
    const heard: Array<Heard> = []
    render(<ConversationPreview batches={FIXTURE_BATCHES} />, {
      wrapper: session(heard, true),
    })

    speakFirstLine()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(heard).toEqual([])
  })
})
