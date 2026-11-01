import { fixtureFeed, noGamesFeed } from "@game-week/lib/feed"
import type { OutboxPort } from "@game-week/lib/ports"
import { storedPrefs } from "@game-week/lib/ports"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { NOTICES, WORDS } from "@game-week/lib/words"
import {
  microphoneOwner,
  TAKE_ENDING_WORDS,
  TAKE_WORDS,
} from "@some-ui/voice-capture"
import type {
  SimulatedMicrophone,
  SimulatedPlayer,
} from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GameWeek } from "./index"

const NOW = Date.UTC(2026, 10, 1, 21)

/** The bite store's answers, which a test moves. */
type Store = {
  /** Whether a keep is refused, held by the store to try again. */
  failKeep: boolean
  /** Since when home holds a bite; null while it doesn't. */
  homeSince: number | null
  /** Tells the screen the store changed. */
  changed: () => void
}

/** The phone the screen records on: the shared simulated microphone and player. */
type Phone = {
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly store: Store
  readonly ports: GameWeekPorts
}

function phone(feed = fixtureFeed(() => NOW)): Phone {
  // The shared simulated microphone, hearing three seconds of talking.
  const mic = simulatedMicrophone({
    now: () => NOW,
    fallback: { ...SPEAKING, level: 0.4, durationMs: 3_000 },
  })
  const player = simulatedPlayer()
  const listeners = new Set<() => void>()
  const store: Store = {
    failKeep: false,
    homeSince: null,
    changed: () => {
      for (const listener of listeners) listener()
    },
  }
  return {
    mic,
    player,
    store,
    ports: {
      startRecording: mic.startRecording,
      owner: microphoneOwner(),
      player,
      store: {
        audio: () => Promise.resolve(new Blob(["said"])),
        keep: () =>
          store.failKeep
            ? Promise.reject(new Error("full"))
            : Promise.resolve(),
        amend: () => Promise.resolve("noted"),
        release: () => Promise.resolve(),
        undo: () => Promise.resolve(),
        isKept: () => !store.failKeep,
        homeSince: () => store.homeSince,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
      feed,
      prefs: storedPrefs(null),
      now: () => NOW,
      newId: () => "b1",
      onVisibility: () => () => undefined,
    },
  }
}

function ports(feed = fixtureFeed(() => NOW)): GameWeekPorts {
  return phone(feed).ports
}

/** Lets the microphone's and the store's answers land. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

/** Taps the likeliest card, and says it once the microphone listens. */
async function sayTheCard(): Promise<HTMLElement> {
  fireEvent.click(
    screen.getByText("3rd & 9 at the SEA 38", { selector: "span" })
  )
  return screen.findByRole("button", { name: TAKE_WORDS.buttonLabel.recording })
}

/** The bite's row, by its Play button. */
const playOnRow = (): HTMLElement | null =>
  screen.queryByRole("button", {
    name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 3_000),
  })

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
      `0:03 · ${TAKE_WORDS.place.going}`
    )
    expect(screen.getByRole("button", { name: WORDS.undo })).toBeTruthy()
  })

  it("plays the kept bite back from its row", async () => {
    const on = phone()
    render(<GameWeek ports={on.ports} outbox={outbox} />)
    fireEvent.click(await sayTheCard())
    await settle()
    const play = playOnRow()
    if (play === null) throw new Error("no row to play")
    fireEvent.click(play)
    await settle()
    expect(on.player.playing()).toBe(1)
    expect(
      screen.getByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.stop, 3_000),
      })
    ).toBeTruthy()
  })

  it("lets a bite go when its button is tapped while the microphone opens", async () => {
    const on = phone()
    on.mic.script({ ...SPEAKING, open: { kind: "cue" } })
    render(<GameWeek ports={on.ports} outbox={outbox} />)
    fireEvent.click(
      screen.getByText("3rd & 9 at the SEA 38", { selector: "span" })
    )
    const opening = await screen.findByRole("button", {
      name: TAKE_WORDS.buttonLabel.opening,
    })
    fireEvent.click(opening)
    await settle()
    expect(screen.getByText(TAKE_ENDING_WORDS.early)).toBeTruthy()
    act(() => on.mic.answer("open"))
    await settle()
    expect(on.mic.open()).toBe(0)
    expect(on.mic.discarded()).toBe(1)
    expect(
      screen.queryByRole("button", { name: TAKE_WORDS.buttonLabel.recording })
    ).toBeNull()
  })

  it("shows no row for a bite the store couldn't keep yet, and still offers Undo", async () => {
    const on = phone()
    on.store.failKeep = true
    render(<GameWeek ports={on.ports} outbox={outbox} />)
    fireEvent.click(await sayTheCard())
    await settle()
    expect(screen.getByText(NOTICES.notKept)).toBeTruthy()
    expect(playOnRow()).toBeNull()
    expect(
      screen.queryByText(TAKE_WORDS.place.going, { exact: false })
    ).toBeNull()
    expect(screen.getByRole("button", { name: WORDS.undo })).toBeTruthy()
  })

  it("says the bite is on home once home holds it, with nothing to play here", async () => {
    const on = phone()
    render(<GameWeek ports={on.ports} outbox={outbox} />)
    fireEvent.click(await sayTheCard())
    await settle()
    expect(playOnRow()?.closest("li")).toHaveTextContent(TAKE_WORDS.place.going)
    on.store.homeSince = NOW + 60_000
    act(() => on.store.changed())
    const play = playOnRow()
    expect(play).toBeDisabled()
    expect(play?.closest("li")).toHaveTextContent(
      TAKE_WORDS.place.homeSince(
        TAKE_WORDS.when(new Date(NOW + 60_000).toISOString())
      )
    )
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
