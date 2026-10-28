import { awayFeed, fixtureFeed } from "@game-week/lib/feed"
import type { OutboxPort } from "@game-week/lib/ports"
import { storedPrefs } from "@game-week/lib/ports"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { WORDS } from "@game-week/lib/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GameWeek } from "./index"

const NOW = Date.UTC(2026, 10, 1, 21)

function ports(feed = fixtureFeed(() => NOW)): GameWeekPorts {
  return {
    startRecording: () =>
      Promise.resolve({
        level: () => 0.4,
        finish: () =>
          Promise.resolve({
            blob: new Blob(["said"]),
            mimeType: "audio/webm",
            durationMs: 3_000,
          }),
        discard: () => undefined,
      }),
    store: {
      keep: () => Promise.resolve(),
      amend: () => Promise.resolve(),
      release: () => Promise.resolve(),
      undo: () => Promise.resolve(),
    },
    feed,
    prefs: storedPrefs(null),
    now: () => NOW,
    newId: () => "b1",
    onVisibility: () => () => undefined,
  }
}

const WAITING = { waiting: 2, refused: 0, sending: true }

const outbox: OutboxPort = {
  getSnapshot: () => WAITING,
  subscribe: () => () => undefined,
}

describe("GameWeek", () => {
  it("offers the likeliest scenario, and a tap starts saying it", async () => {
    render(<GameWeek ports={ports()} outbox={outbox} />)
    expect(
      screen.getByText("Q3 8:42 · SF 17, SEA 13 · 3rd & 9 at the SEA 38")
    ).toBeTruthy()
    expect(
      screen.getByText("2 bites wait on this phone until home has them.")
    ).toBeTruthy()
    const card = screen.getByText("3rd & 9 at the SEA 38", { selector: "span" })
    await act(async () => {
      fireEvent.click(card)
      await Promise.resolve()
    })
    expect(screen.getByRole("button", { name: WORDS.done })).toBeTruthy()
  })

  it("away from home, offers nothing but still lets me say it first", () => {
    render(
      <GameWeek
        ports={ports({
          watch: (listener): (() => void) => {
            let games: Parameters<typeof listener>[0]["games"] = []
            fixtureFeed(() => NOW).watch((feed) => {
              games = feed.games
            })
            listener({ games, offer: null })
            return () => undefined
          },
        })}
        outbox={outbox}
      />
    )
    expect(screen.getByText(WORDS.away)).toBeTruthy()
    expect(screen.getByRole("button", { name: WORDS.sayItFirst })).toBeTruthy()
  })

  it("with no games yet, says so", () => {
    render(<GameWeek ports={ports(awayFeed)} outbox={outbox} />)
    expect(screen.getByText(WORDS.noGames)).toBeTruthy()
  })
})
