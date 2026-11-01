import { inMemoryStorage } from "@some-ui/core-utils"
import { IdeaCapture } from "@soundbites/components/idea"
import { asked } from "@soundbites/lib/idea/__tests__/fixture"
import type { Listened } from "@soundbites/lib/idea/machine"
import type { IdeaListener, Listening } from "@soundbites/lib/idea/runtime"
import { NO_LISTENER } from "@soundbites/lib/idea/runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const W = STUDIO_WORDS.idea

/** A recognizer, or home hearing a take, the test speaks through. */
function fakeListener(): {
  listener: IdeaListener
  say: (words: string) => void
  hearing: () => void
  finish: (result: Listened) => void
} {
  let onWords: (words: string) => void = () => undefined
  let onHearing: () => void = () => undefined
  let settle: (result: Listened) => void = () => undefined
  return {
    listener: {
      available: () => Promise.resolve(true),
      listen: (heard, _ready, take): Listening => {
        onWords = heard
        onHearing = take?.onHearing ?? ((): void => undefined)
        return {
          done: new Promise<Listened>((resolve) => {
            settle = resolve
          }),
          stop: () => undefined,
          cancel: () => undefined,
        }
      },
    },
    say: (words) => onWords(words),
    hearing: () => onHearing(),
    finish: (result) => settle(result),
  }
}

function setup(listener: IdeaListener): ReturnType<typeof keptIdeaStore> {
  const storage = inMemoryStorage()
  const store = keptIdeaStore(() => storage)
  store.keep(() => [asked()])
  render(
    <IdeaCapture
      answering="idea-1"
      ports={{
        listener,
        store,
        now: () => Date.UTC(2026, 9, 30, 10),
        onVisibility: () => (): void => undefined,
      }}
    />
  )
  return store
}

/** Claude's questions about the idea, as `asked` puts them. */
const FIRST = "Which week?"
const NEXT = "Why now?"

describe("IdeaCapture, on Claude's questions about an idea (ST19)", () => {
  it("shows the words as they're spoken and keeps them as text", async () => {
    const voice = fakeListener()
    const store = setup(voice.listener)
    fireEvent.click(await screen.findByRole("button", { name: W.talk }))
    act(() => voice.say("a short about game day"))
    expect(screen.getByText("a short about game day")).toBeTruthy()
    await act(async () => {
      voice.finish({ kind: "heard", words: "a short about game day" })
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole("button", { name: W.right }))
    expect(screen.getByRole("heading", { name: NEXT })).toBeTruthy()
    expect(store.list()?.[0]?.answers.at(-1)?.versions[0]?.words).toBe(
      "a short about game day"
    )
  })

  it("IH1: says home is hearing a kept take, then gives its words, or says where the take is kept and takes typed words", async () => {
    const voice = fakeListener()
    setup(voice.listener)
    fireEvent.click(await screen.findByRole("button", { name: W.talk }))
    fireEvent.click(screen.getByRole("button", { name: W.stop }))
    act(() => voice.hearing())
    expect(screen.getByText(W.hearing)).toBeTruthy()
    expect(screen.getByRole("button", { name: W.type })).toBeTruthy()
    await act(async () => {
      voice.finish({ kind: "kept", on: "phone", why: "away" })
      await Promise.resolve()
    })
    expect(screen.getByText(W.awayOnPhone)).toBeTruthy()
    const box = screen.getByRole("textbox", { name: FIRST })
    fireEvent.change(box, { target: { value: "typed after all" } })
    fireEvent.click(screen.getByRole("button", { name: W.keepWords }))
    expect(screen.getByRole("heading", { name: NEXT })).toBeTruthy()
  })

  it("takes typed words when the phone can't listen", async () => {
    setup(NO_LISTENER)
    const box = await screen.findByRole("textbox", {
      name: FIRST,
    })
    expect(screen.queryByRole("button", { name: W.talk })).toBeNull()
    expect(screen.getByText(W.noVoice)).toBeTruthy()
    fireEvent.change(box, { target: { value: "typed idea" } })
    fireEvent.click(screen.getByRole("button", { name: W.keepWords }))
    expect(screen.getByRole("heading", { name: NEXT })).toBeTruthy()
  })
})
