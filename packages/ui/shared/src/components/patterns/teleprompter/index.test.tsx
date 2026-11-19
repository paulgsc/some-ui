/**
 * `Teleprompter`'s window (PB1, declared in `lib/teleprompter`'s test): a
 * take ending moves nothing, so a window a hand scrolled stays where it was,
 * paused or not, and a resize after the take leaves it there too. jsdom lays
 * nothing out, so placing the window writes 0: a window that moved reads 0.
 */
import type { JSX } from "react"
import { act, fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { TeleprompterWords } from "."
import { Teleprompter } from "."
import type { Band } from "../../../lib/teleprompter"
import { DEFAULT_PACE_WPM } from "../../../lib/teleprompter"

const WORDS: TeleprompterWords = {
  script: "Script",
  ready: "Ready",
  band: {
    waiting: "Waiting",
    moving: "Moving",
    holding: "Holding",
    paused: "Paused",
  },
  pause: "Pause",
  goOn: "Go on",
  slower: "Slower",
  faster: "Faster",
  pace: (wpm) => `${wpm} a minute`,
}

const LINES = ["One line,", "another,", "and the last."]

const band = (state: Band["state"]): Band => ({ line: 1, state })

const view = (reading: boolean, state: Band["state"]): JSX.Element => (
  <Teleprompter
    lines={LINES}
    band={band(state)}
    reading={reading}
    level={reading ? 0.3 : 0}
    time={null}
    pace={DEFAULT_PACE_WPM}
    words={WORDS}
    onPause={() => undefined}
    onPace={() => undefined}
  />
)

describe("Teleprompter's window (PB1)", () => {
  it.each(["moving", "paused"] as const)(
    "stays where a hand left it when a take ends (%s), and through a resize after",
    (state) => {
      const { container, rerender } = render(view(true, state))
      const window_ = container.querySelector("[data-scroll-intent]")
      if (!(window_ instanceof HTMLElement)) throw new Error("no window")
      window_.scrollTop = 500
      rerender(view(false, "holding"))
      expect(window_.scrollTop).toBe(500)
      act(() => {
        fireEvent(window, new Event("resize"))
      })
      expect(window_.scrollTop).toBe(500)
      // A new take places it at the band again.
      rerender(view(true, "moving"))
      expect(window_.scrollTop).toBe(0)
    }
  )
})
