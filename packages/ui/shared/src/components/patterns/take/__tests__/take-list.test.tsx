/**
 * The take pattern's parts, rendered over the real pattern
 * runtime, the real take kit, `takeRunner` and the phone's one-microphone
 * owner, with only the microphone, the player and the screen's store
 * standing in (`@some-ui/voice-capture/testing`). Every line asserted is the
 * pattern's own words, so a screen built on the parts says the same.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import type {
  MicOwner,
  PatternTake,
  TakePattern,
  TakePatternOptions,
  TakeRowView,
} from "@some-ui/voice-capture"
import {
  microphoneOwner,
  TAKE_ENDING_WORDS,
  TAKE_WORDS,
  takePattern,
} from "@some-ui/voice-capture"
import type {
  MemoryTakes,
  SimulatedMicrophone,
} from "@some-ui/voice-capture/testing"
import {
  memoryTakes,
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TakeList } from "../take-list"
import { TakeRow } from "../take-row"

const ONE: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 500, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
  clock: "elapsed",
}

type Phone = {
  readonly mic: SimulatedMicrophone
  readonly owner: MicOwner
  readonly player: ReturnType<typeof simulatedPlayer>
}

function phone(): Phone {
  return {
    mic: simulatedMicrophone({ now: Date.now }),
    owner: microphoneOwner(),
    player: simulatedPlayer(),
  }
}

function screenOn(
  on: Phone,
  options: TakePatternOptions = ONE,
  seed: ReadonlyArray<PatternTake> = []
): { pattern: TakePattern; store: MemoryTakes } {
  const store = memoryTakes({ now: Date.now, seed })
  const pattern = takePattern(
    {
      startRecording: on.mic.startRecording,
      now: Date.now,
      owner: on.owner,
      player: on.player,
      ...store.ports,
    },
    options
  )
  return { pattern, store }
}

const Screen = ({
  pattern,
  store,
  answers = "card-1",
}: {
  pattern: TakePattern
  store: MemoryTakes
  answers?: string
}): JSX.Element => {
  const takes = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return (
    <TakeList
      pattern={pattern}
      answers={answers}
      takes={takes}
      label={answers}
    />
  )
}

/** A screen's own action on a row. */
const mine = (row: TakeRowView): JSX.Element => <span>Mine: {row.take.id}</span>

/** A screen with an action of its own on each row (the row's `extra`). */
const ExtraScreen = ({
  pattern,
  store,
}: {
  pattern: TakePattern
  store: MemoryTakes
}): JSX.Element => {
  const takes = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return (
    <TakeList pattern={pattern} answers="card-1" takes={takes} extra={mine} />
  )
}

const pass = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const takeButton = (): HTMLElement =>
  screen.getByRole("button", { pressed: false, name: /talk|record/i })

const live = (): HTMLElement => screen.getByRole("button", { pressed: true })

const W = TAKE_WORDS

describe("the take button, row and list", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("taps to start and to stop, shows the time against the cap, and says the take was kept where", async () => {
    const on = phone()
    render(<Screen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    expect(live()).toHaveTextContent(W.elapsed(2_000, 60_000))
    expect(live()).toHaveAccessibleName(W.buttonLabel.recording)
    fireEvent.click(live())
    await pass(0)
    expect(screen.getByText(TAKE_ENDING_WORDS.kept)).toBeInTheDocument()
    expect(screen.getByRole("listitem")).toHaveTextContent(
      `0:02 · ${W.place.phone}`
    )
    expect(takeButton()).toHaveTextContent(W.button.again)
    expect(on.mic.open()).toBe(0)
  })

  it("says on each row where its take is kept, and since when once home holds it (MIC3)", () => {
    const since = "2026-11-01T09:15:00.000Z"
    const kept = (
      id: string,
      minute: number,
      where: PatternTake["kept"]
    ): PatternTake => ({
      id,
      answers: "card-1",
      durationMs: 2_000,
      recordedAt: `2026-11-01T09:0${minute}:00.000Z`,
      standing: "current",
      kept: where,
    })
    const on = phone()
    render(
      <Screen
        {...screenOn(
          on,
          { ...ONE, takes: { per: "many", max: 5, full: "refuse" } },
          [
            kept("t1", 1, { place: "phone" }),
            kept("t2", 2, { place: "going" }),
            kept("t3", 3, { place: "home", since }),
          ]
        )}
      />
    )
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining(W.place.homeSince(W.when(since))),
      expect.stringContaining(W.place.going),
      expect.stringContaining(W.place.phone),
    ])
  })

  it("keeps a take it didn't hear, says so, and offers Redo beside it (D4)", async () => {
    const on = phone()
    on.mic.script({ ...SPEAKING, level: 0.04 })
    render(<Screen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    expect(screen.getByText(W.ended.unheard)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: W.rowLabel(W.redo, 2_000) })
    ).toBeInTheDocument()
  })

  it("can still be tapped while the microphone opens, which lets the take go", async () => {
    const on = phone()
    on.mic.script({ ...SPEAKING, open: { kind: "cue" } })
    render(<Screen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(0)
    expect(live()).toHaveTextContent(W.button.opening)
    expect(live()).toBeEnabled()
    fireEvent.click(live())
    await pass(0)
    expect(screen.getByText(TAKE_ENDING_WORDS.early)).toBeInTheDocument()
    act(() => on.mic.answer("open"))
    await pass(0)
    expect(on.mic.open()).toBe(0)
    expect(on.owner.holder()).toBeNull()
  })

  it("warns in the last ten seconds, and the cap keeps a take never stopped", async () => {
    const on = phone()
    render(
      <Screen
        {...screenOn(on, { ...ONE, limits: { minMs: 500, maxMs: 15_000 } })}
      />
    )
    fireEvent.click(takeButton())
    await pass(6_100)
    expect(live()).toHaveTextContent(W.nearlyUp(9_000))
    await pass(10_000)
    expect(screen.getByText(TAKE_ENDING_WORDS.kept)).toBeInTheDocument()
    expect(screen.getByRole("listitem")).toHaveTextContent("0:15")
  })

  it('counts down under `clock: "left"`, without a second warning line', async () => {
    const on = phone()
    render(
      <Screen
        {...screenOn(on, {
          ...ONE,
          limits: { minMs: 500, maxMs: 15_000 },
          clock: "left",
        })}
      />
    )
    fireEvent.click(takeButton())
    await pass(6_100)
    expect(live()).toHaveTextContent(W.left(9_000))
    expect(live()).not.toHaveTextContent(W.nearlyUp(9_000))
  })

  it("says no place for a take on neither this phone nor home", () => {
    render(
      <ul>
        <TakeRow
          row={{
            take: {
              id: "t1",
              answers: "card-1",
              durationMs: 4_000,
              recordedAt: "2026-11-01T09:00:00.000Z",
              standing: "current",
              kept: null,
            },
            playing: false,
            canPlay: false,
            canRedo: false,
            canLetGo: false,
            unsent: false,
          }}
          onPlay={() => undefined}
        />
      </ul>
    )
    expect(screen.getByRole("listitem")).toHaveTextContent(/^0:04$/)
  })

  it("says a take that never left the phone is unsent, and offers Delete in Let go's place (ST26)", () => {
    const letGo = vi.fn()
    render(
      <ul>
        <TakeRow
          row={{
            take: {
              id: "t1",
              answers: "card-1",
              durationMs: 4_000,
              recordedAt: "2026-11-01T09:00:00.000Z",
              standing: "current",
              kept: { place: "phone" },
            },
            playing: false,
            canPlay: true,
            canRedo: true,
            canLetGo: true,
            unsent: true,
          }}
          onPlay={() => undefined}
          onLetGo={letGo}
        />
      </ul>
    )
    expect(screen.getByRole("listitem")).toHaveTextContent(
      TAKE_WORDS.place.unsent
    )
    expect(
      screen.queryByRole("button", { name: /Let it go/ })
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.discard, 4_000),
      })
    )
    expect(letGo).toHaveBeenCalledOnce()
  })

  it("says the screen's full words in the button's place, offers no Redo, and still plays and lets go every take", async () => {
    const take = (
      id: string,
      standing: PatternTake["standing"]
    ): PatternTake => ({
      id,
      answers: "card-1",
      durationMs: 2_000,
      recordedAt: `2026-11-01T09:0${id.slice(1)}:00.000Z`,
      standing,
      kept: { place: "phone" },
    })
    const on = phone()
    const { pattern, store } = screenOn(
      on,
      { ...ONE, takes: { per: "many", max: 5, full: "refuse" } },
      [take("t1", "earlier"), take("t2", "current")]
    )
    render(
      <TakeList
        pattern={pattern}
        answers="card-1"
        takes={store.getSnapshot()}
        full="Full until home has some."
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Full until home has some."
    )
    expect(screen.queryByRole("button", { name: /talk|record/i })).toBeNull()
    expect(
      screen.queryByRole("button", { name: new RegExp(`^${W.redo}`) })
    ).toBeNull()
    expect(
      screen.getAllByRole("button", { name: new RegExp(`^${W.letGo}`) })
    ).toHaveLength(1)
    expect(screen.getByText(W.earlier(1))).toBeInTheDocument()
    const plays = screen.getAllByRole("button", { name: /^Play/ })
    expect(plays).toHaveLength(2)
    // The earlier one's, under its collapsed group.
    fireEvent.click(
      within(screen.getByRole("group")).getByRole("button", { name: /^Play/ })
    )
    await pass(0)
    expect(on.player.playing()).toBe(1)
  })

  it("draws a screen's own action in the row's extra slot", async () => {
    const on = phone()
    render(<ExtraScreen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    expect(screen.getByRole("listitem")).toHaveTextContent("Mine: take-1")
  })

  it("redoes a take: the new one is the item's, and the earlier one is kept apart (D2)", async () => {
    const on = phone()
    render(<Screen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    fireEvent.click(
      screen.getByRole("button", { name: W.rowLabel(W.redo, 2_000) })
    )
    await pass(4_100)
    fireEvent.click(live())
    await pass(0)
    const earlier = screen.getByText(W.earlier(1))
    expect(earlier.closest("details")).not.toHaveAttribute("open")
    const rows = screen.getAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("0:04")
    expect(rows[1]).toHaveTextContent("0:02")
  })

  it("submits no form around it: every control is a plain button", async () => {
    const on = phone()
    const { pattern, store } = screenOn(on)
    const submit = vi.fn((event: Event) => event.preventDefault())
    render(
      <form onSubmit={(event) => submit(event.nativeEvent)}>
        <Screen pattern={pattern} store={store} />
      </form>
    )
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button")
    }
    fireEvent.click(
      screen.getByRole("button", { name: W.rowLabel(W.redo, 2_000) })
    )
    expect(submit).not.toHaveBeenCalled()
  })

  it("lets a take go without asking, sets it aside and says where it is kept (D3)", async () => {
    const on = phone()
    const { pattern, store } = screenOn(on)
    render(<Screen pattern={pattern} store={store} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    fireEvent.click(
      screen.getByRole("button", { name: W.rowLabel(W.letGo, 2_000) })
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByRole("listitem")).toBeNull()
    expect(screen.getByText(W.setAside.phone)).toBeInTheDocument()
    expect(store.getSnapshot().map((take) => take.standing)).toEqual([
      "set-aside",
    ])
    expect(takeButton()).toHaveTextContent(W.button.ready)
  })

  it("plays a take and stops it, and a tap that starts a take stops what plays", async () => {
    const on = phone()
    render(<Screen {...screenOn(on)} />)
    fireEvent.click(takeButton())
    await pass(2_100)
    fireEvent.click(live())
    await pass(0)
    fireEvent.click(
      screen.getByRole("button", { name: W.rowLabel(W.play, 2_000) })
    )
    await pass(0)
    expect(on.player.playing()).toBe(1)
    const stop = screen.getByRole("button", { name: W.rowLabel(W.stop, 2_000) })
    fireEvent.click(stop)
    await pass(0)
    expect(on.player.playing()).toBe(0)
    fireEvent.click(
      screen.getByRole("button", { name: W.rowLabel(W.play, 2_000) })
    )
    await pass(0)
    fireEvent.click(takeButton())
    expect(on.player.playing()).toBe(0)
    await pass(0)
    expect(
      screen.getByRole("button", { name: W.rowLabel(W.play, 2_000) })
    ).toBeDisabled()
  })

  it("holds the button for another item while one records on the screen", async () => {
    const on = phone()
    const { pattern, store } = screenOn(on)
    render(
      <>
        <Screen pattern={pattern} store={store} answers="card-1" />
        <Screen pattern={pattern} store={store} answers="card-2" />
      </>
    )
    const buttons = screen.getAllByRole("button", {
      name: W.buttonLabel.ready,
    })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0] ?? document.body)
    await pass(1_000)
    expect(
      screen.getByRole("button", { name: W.buttonLabel.elsewhere })
    ).toBeDisabled()
  })

  it("adds takes beside each other under `many`, and holds the button at its max", async () => {
    const on = phone()
    render(
      <Screen
        {...screenOn(on, {
          ...ONE,
          takes: { per: "many", max: 2, full: "refuse" },
          play: "latest",
        })}
      />
    )
    for (const ms of [1_100, 2_100]) {
      fireEvent.click(takeButton())
      await pass(ms)
      fireEvent.click(live())
      await pass(0)
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(
      screen.getByRole("button", { name: W.buttonLabel.full })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: W.rowLabel(W.play, 1_000) })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: W.rowLabel(W.play, 2_000) })
    ).toBeEnabled()
  })
})
