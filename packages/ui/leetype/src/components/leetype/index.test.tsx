import { Leetype } from "@leetype/components/leetype"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { SessionFileSchema } from "@leetype/types/session-file"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// This file tests which surface mounts. Mocking the loader lets the typing
// branch render, and counting calls proves the rounds branch never loads it.
const loadWasm = vi.fn()
vi.mock("@leetype/lib/leetype/leetype-wasm-loader", () => ({
  loadWasm: (): Promise<never> => {
    loadWasm()
    // A failed load is enough to show the branch tried.
    return Promise.reject(new Error("engine unavailable in this test"))
  },
  resetWasm: (): void => {},
}))

const EXERCISE = nextExercise({ preferId: FIXTURE_EXERCISE_ID })

/** jsdom never evaluates media queries; this answers `useIsMobile` with a fixed verdict. */
function setViewport(mobile: boolean): void {
  const matchMedia = (query: string): MediaQueryList => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })
  vi.stubGlobal("matchMedia", matchMedia)
}

beforeEach(() => {
  loadWasm.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Leetype", () => {
  it("gives a narrow viewport rounds, even when an exercise is passed", () => {
    setViewport(true)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)

    expect(screen.getByText("Round 1")).toBeInTheDocument()
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
  })

  it("gives a wide viewport the typing surface", () => {
    setViewport(false)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)

    // The typing surface's own keystroke-capture element, which rounds have
    // no equivalent of.
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
    expect(screen.queryByText("Round 1")).not.toBeInTheDocument()
  })

  // A phone never fetches the engine: true by construction, pinned here.
  it("never reaches for the typing engine on a narrow viewport", () => {
    setViewport(true)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)
    expect(loadWasm).not.toHaveBeenCalled()
  })

  it("does reach for it on a wide one, so the assertion above means something", () => {
    setViewport(false)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)
    expect(loadWasm).toHaveBeenCalled()
  })

  it("honours an explicit surface override, whatever the viewport says", () => {
    setViewport(false)
    const { unmount } = render(
      <Leetype exercise={EXERCISE} sessionSeed={7} surface="rounds" />
    )
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()
    unmount()

    setViewport(true)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} surface="typing" />)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })

  // The registry contract: renders with no props or context. A phone lands
  // on rounds, a wide screen on the picker.
  it("mounts with no props at all: rounds on a phone, the picker on a wide screen", () => {
    setViewport(true)
    const { unmount } = render(<Leetype sessionSeed={7} />)
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    expect(
      screen.queryByText("Choose what to practice")
    ).not.toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()
    unmount()

    setViewport(false)
    render(<Leetype />)
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
    // A wide viewport alone does not load the engine; an active exercise does.
    expect(loadWasm).not.toHaveBeenCalled()
  })

  it("plays served rounds on a phone, and the bundled ones when loading fails", async () => {
    setViewport(true)
    const served = [{ ...AUTHORED_ROUNDS[1]!, id: "served-round" }]
    const loadRounds = vi.fn(() => Promise.resolve(served))
    const { unmount } = render(
      <Leetype sessionSeed={7} loadRounds={loadRounds} />
    )
    expect(screen.getByText("Loading rounds…")).toBeInTheDocument()
    expect(await screen.findByText("Round 1")).toBeInTheDocument()
    expect(loadRounds).toHaveBeenCalledTimes(1)
    unmount()

    const failing = vi.fn(() => Promise.reject(new Error("offline")))
    render(<Leetype sessionSeed={7} loadRounds={failing} />)
    expect(await screen.findByText("Round 1")).toBeInTheDocument()
  })

  it("falls back to the bundled rounds when no served round passes the round checks", async () => {
    setViewport(true)
    // Parses as a round, but its A is admissible before and after the
    // constraint diff, so the round has nothing to ask.
    const unplayable = {
      ...AUTHORED_ROUNDS[0]!,
      id: "served-but-broken",
      graph: { kind: "work", cost: 1 },
    }
    render(
      <Leetype
        sessionSeed={7}
        loadRounds={() => Promise.resolve([unplayable])}
      />
    )
    expect(await screen.findByText("Round 1")).toBeInTheDocument()
    expect(
      screen.queryByText(/No rounds are available/)
    ).not.toBeInTheDocument()
  })

  it("asks the host for a round's recorded runs on a phone, never on a wide screen", async () => {
    setViewport(true)
    const loadRuns = vi.fn(
      (_roundId: string): Promise<unknown> =>
        Promise.reject(new Error("offline"))
    )
    const { unmount } = render(<Leetype sessionSeed={7} loadRuns={loadRuns} />)
    expect(await screen.findByText("Round 1")).toBeInTheDocument()
    await vi.waitFor(() => expect(loadRuns).toHaveBeenCalledTimes(1))
    expect(
      AUTHORED_ROUNDS.map((round) => round.id).includes(
        loadRuns.mock.calls[0]![0]
      )
    ).toBe(true)
    unmount()

    setViewport(false)
    const wide = vi.fn(() => Promise.resolve(null))
    render(<Leetype loadRuns={wide} />)
    expect(wide).not.toHaveBeenCalled()
  })

  it("never loads rounds on a wide screen", () => {
    setViewport(false)
    const loadRounds = vi.fn(() => Promise.resolve(AUTHORED_ROUNDS))
    render(<Leetype loadRounds={loadRounds} />)
    expect(loadRounds).not.toHaveBeenCalled()
  })

  it("offers to add a session file on a phone only when the host keeps them", () => {
    setViewport(true)
    const store = {
      list: vi.fn(() => Promise.resolve([])),
      keep: vi.fn(),
      read: vi.fn(),
    }
    const { unmount } = render(<Leetype />)
    expect(screen.queryByText("Add a session from storage")).toBeNull()
    unmount()

    const onSessionComplete = vi.fn()
    render(
      <Leetype sessionFiles={{ store }} onSessionComplete={onSessionComplete} />
    )
    expect(screen.getByText("Add a session from storage")).toBeTruthy()
  })

  it("plays a held session file in place of the rounds, and completes when the learner is done", async () => {
    setViewport(true)
    const raw = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
    const store = {
      list: vi.fn(() =>
        Promise.resolve([
          {
            name: "t1-01",
            title: raw.title,
            oneLine: raw.oneLine,
            pickedAt: "2026-10-18T21:00:00.000Z",
          },
        ])
      ),
      keep: vi.fn(),
      read: vi.fn(() => Promise.resolve(JSON.stringify(raw))),
    }
    const onSessionComplete = vi.fn()
    render(
      <Leetype sessionFiles={{ store }} onSessionComplete={onSessionComplete} />
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`Play ${raw.title}`),
      })
    )
    fireEvent.click(
      await screen.findByRole("button", { name: /the whole session/ })
    )
    fireEvent.click(screen.getByRole("button", { name: "End here" }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onSessionComplete).toHaveBeenCalledOnce()
    // Boundary 5: a session file plays without the engine.
    expect(loadWasm).not.toHaveBeenCalled()
    expect(screen.getByText("Add a session from storage")).toBeTruthy()
  })

  it("keeps a session file in play through a turn of the phone, and leaves it on Not now", async () => {
    // A window whose verdict the test turns, telling those listening.
    let mobile = true
    const listeners = new Set<EventListenerOrEventListenerObject>()
    vi.stubGlobal(
      "matchMedia",
      (query: string): MediaQueryList => ({
        get matches(): boolean {
          return mobile
        },
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          listener: EventListenerOrEventListenerObject
        ): void => void listeners.add(listener),
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      })
    )
    const raw = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
    const store = {
      list: vi.fn(() =>
        Promise.resolve([
          {
            name: "t1-01",
            title: raw.title,
            oneLine: raw.oneLine,
            pickedAt: "2026-10-18T21:00:00.000Z",
          },
        ])
      ),
      keep: vi.fn(),
      read: vi.fn(() => Promise.resolve(JSON.stringify(raw))),
    }
    render(<Leetype sessionFiles={{ store }} />)
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`Play ${raw.title}`),
      })
    )
    await screen.findByRole("button", { name: /the whole session/ })

    act(() => {
      mobile = false
      for (const listener of listeners) {
        if (typeof listener === "function") listener(new Event("change"))
      }
    })
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    // Wide now, so leaving lands on the wide surface.
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
  })

  it("starts a session once the learner picks an exercise from the picker", () => {
    setViewport(false)
    render(<Leetype />)
    const [firstTile] = screen.getAllByRole("button")
    fireEvent.click(firstTile!)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })

  // With the test above: the engine loads when an exercise is picked, not
  // when `Leetype` mounts.
  it("attaches the production probe, and its engine fetch, only once an exercise is picked — never merely from mounting wide", () => {
    setViewport(false)
    render(<Leetype />)
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()

    const [firstTile] = screen.getAllByRole("button")
    fireEvent.click(firstTile!)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
    expect(loadWasm).toHaveBeenCalled()
  })

  it("forwards exerciseBadges to the picker's tiles", () => {
    setViewport(false)
    const oneStep = nextExercise({ preferId: "diagnostic-loop-progress" })
    render(
      <Leetype
        exerciseBadges={{ [oneStep.id]: { tone: "popular", count: 7 } }}
      />
    )
    const tile = screen.getByText(oneStep.title).closest("button")
    expect(tile?.textContent).toContain("7")
  })

  it("subtracts time spent loading rounds from the session's own budget", async () => {
    // The orchestrator's deadline is fixed at mount, so time waiting for
    // served rounds comes out of the session's term.
    setViewport(true)
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "performance",
      ],
    })
    try {
      const onSessionComplete = vi.fn()
      const loadRounds = (): Promise<typeof AUTHORED_ROUNDS> =>
        new Promise((resolve) => {
          setTimeout(() => resolve(AUTHORED_ROUNDS), 700)
        })
      render(
        <Leetype
          sessionDurationMs={1000}
          sessionSeed={7}
          loadRounds={loadRounds}
          onSessionComplete={onSessionComplete}
        />
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })
      expect(screen.getByText("Round 1")).toBeInTheDocument()

      // About 300ms remain; 500ms more ends the session only if the 700ms
      // spent loading was subtracted.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(onSessionComplete).toHaveBeenCalledTimes(1)
      expect(screen.getByText("Session complete")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
