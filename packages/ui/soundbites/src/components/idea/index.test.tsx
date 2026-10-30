import { inMemoryStorage } from "@some-ui/core-utils"
import { IdeaCapture } from "@soundbites/components/idea"
import type { Listened } from "@soundbites/lib/idea/machine"
import type { IdeaListener, Listening } from "@soundbites/lib/idea/runtime"
import { NO_LISTENER } from "@soundbites/lib/idea/runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const W = STUDIO_WORDS.idea

/** A recognizer the test speaks through. */
function fakeListener(): {
  listener: IdeaListener
  say: (words: string) => void
  finish: (result: Listened) => void
} {
  let onWords: (words: string) => void = () => undefined
  let settle: (result: Listened) => void = () => undefined
  return {
    listener: {
      available: () => Promise.resolve(true),
      listen: (heard): Listening => {
        onWords = heard
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
    finish: (result) => settle(result),
  }
}

function setup(listener: IdeaListener): ReturnType<typeof keptIdeaStore> {
  const storage = inMemoryStorage()
  const store = keptIdeaStore(() => storage)
  let tick = 0
  render(
    <IdeaCapture
      ports={{
        listener,
        store,
        now: () => Date.UTC(2026, 9, 30, 10) + 1_000 * tick,
        newId: () => `idea-${tick++}`,
        onVisibility: () => (): void => undefined,
      }}
    />
  )
  return store
}

describe("IdeaCapture", () => {
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
    expect(
      screen.getByRole("heading", { name: W.questions.takeaway.ask })
    ).toBeTruthy()
    expect(store.list()?.[0]?.answers[0]?.versions[0]?.words).toBe(
      "a short about game day"
    )
  })

  it("takes typed words when the phone can't listen", async () => {
    setup(NO_LISTENER)
    const box = await screen.findByRole("textbox", {
      name: W.questions.what.ask,
    })
    expect(screen.queryByRole("button", { name: W.talk })).toBeNull()
    expect(screen.getByText(W.noVoice)).toBeTruthy()
    fireEvent.change(box, { target: { value: "typed idea" } })
    fireEvent.click(screen.getByRole("button", { name: W.keepWords }))
    expect(
      screen.getByRole("heading", { name: W.questions.takeaway.ask })
    ).toBeTruthy()
  })
})
