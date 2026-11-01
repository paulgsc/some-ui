import { fixtureFeed, noGamesFeed } from "@game-week/lib/feed"
import type { OutboxPort } from "@game-week/lib/ports"
import { storedPrefs } from "@game-week/lib/ports"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { WORDS } from "@game-week/lib/words"
import { microphoneOwner, TAKE_WORDS } from "@some-ui/voice-capture"
import {
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GameWeek } from "./index"

const NOW = Date.UTC(2026, 10, 1, 21)

function ports(feed = fixtureFeed(() => NOW)): GameWeekPorts {
  return {
    // The shared simulated microphone, hearing three seconds of talking.
    startRecording: simulatedMicrophone({
      now: () => NOW,
      fallback: { ...SPEAKING, level: 0.4, durationMs: 3_000 },
    }).startRecording,
    owner: microphoneOwner(),
    player: simulatedPlayer(),
    store: {
      audio: () => Promise.resolve(new Blob(["said"])),
      keep: () => Promise.resolve(),
      amend: () => Promise.resolve("noted"),
      release: () => Promise.resolve(),
      undo: () => Promise.resolve(),
      isKept: () => true,
      subscribe: () => () => undefined,
    },
    feed,
    prefs: storedPrefs(null),
    now: () => NOW,
    newId: () => "b1",
    onVisibility: () => () => undefined,
  }
}

const WAITING = {
  notKept: 0,
  waiting: 2,
  refused: 0,
  sending: true,
  onHome: null,
}

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
    fireEvent.click(card)
    const stop = await screen.findByRole("button", {
      name: TAKE_WORDS.buttonLabel.recording,
    })
    expect(stop).toHaveTextContent(TAKE_WORDS.elapsed(0, 60_000))
    expect(screen.getByRole("meter", { name: "Level" })).toBeTruthy()

    // Done keeps it: the bite's row, with Play, and Undo while it is held.
    await act(async () => {
      fireEvent.click(stop)
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(screen.getByText("Kept, 3 s.")).toBeTruthy()
    const play = screen.getByRole("button", {
      name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 3_000),
    })
    expect(play).toBeEnabled()
    expect(play.closest("li")).toHaveTextContent(
      `0:03 · ${TAKE_WORDS.place.phone}`
    )
    expect(screen.getByRole("button", { name: WORDS.undo })).toBeTruthy()
  })

  it("with no offer for the game, still lets me say it first", () => {
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
    expect(screen.getByText(WORDS.noOffer)).toBeTruthy()
    expect(screen.getByRole("button", { name: WORDS.sayItFirst })).toBeTruthy()
  })

  it("with no games yet, says recording opens once home sends them", () => {
    render(<GameWeek ports={ports(noGamesFeed)} outbox={outbox} />)
    expect(screen.getByText(WORDS.noGames)).toBeTruthy()
  })

  it("opens every scenario in a sheet over the screen, and closes it", () => {
    render(<GameWeek ports={ports(noGamesFeed)} outbox={outbox} />)
    fireEvent.click(screen.getByRole("button", { name: WORDS.everyScenario }))
    const sheet = screen.getByRole("dialog", { name: WORDS.legendTitle })
    expect(sheet.textContent).toContain(WORDS.legendLede)
    fireEvent.keyDown(sheet, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
