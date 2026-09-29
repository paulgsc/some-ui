import { Leetype } from "@leetype/components/leetype"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The wasm binary is a workspace crate with no dist/ in a test run, and the
// point of this file is which surface mounts — not what either one does once
// mounted. Mocking the loader is what lets the typing branch render at all,
// and counting its calls is what proves the reading branch never touches it.
const loadWasm = vi.fn()
vi.mock("@leetype/lib/leetype/leetype-wasm-loader", () => ({
  loadWasm: (): Promise<never> => {
    loadWasm()
    // The typing surface handles a failed load with its own error state,
    // which is enough for "did this branch even try" without standing up a
    // whole fake engine.
    return Promise.reject(new Error("engine unavailable in this test"))
  },
  resetWasm: (): void => {},
}))

const EXERCISE = nextExercise({ preferId: FIXTURE_EXERCISE_ID })

/**
 * `useIsMobile` reads `window.matchMedia` through `useSyncExternalStore`.
 * jsdom implements the API but never evaluates the query, so every call comes
 * back `matches: false`; this replaces it with one that answers a fixed
 * verdict, which is the only thing the chooser reads.
 */
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
  it("gives a narrow viewport the reading surface", () => {
    setViewport(true)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)

    expect(screen.getByText("Practice")).toBeInTheDocument()
    expect(screen.getByRole("group")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(1)
  })

  it("gives a wide viewport the typing surface", () => {
    setViewport(false)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} />)

    // The typing surface's own keystroke-capture element, which the reading
    // surface has no equivalent of.
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })

  // The load-bearing claim of the whole split: a phone never fetches the
  // engine. `useTypingGame` lives inside `TypingSession`, and a hook cannot
  // be called conditionally — so this is true by construction rather than by
  // a guard, and this test is what stops the construction being undone.
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
      <Leetype exercise={EXERCISE} sessionSeed={7} surface="reading" />
    )
    expect(screen.getByRole("group")).toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()
    unmount()

    setViewport(true)
    render(<Leetype exercise={EXERCISE} sessionSeed={7} surface="typing" />)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })

  // The registry contract: an entry must render with no props and no ambient
  // React context (@some-ui/content-registry's own rule). With no `exercise`
  // forced, a phone lands on rounds (the Leetype cutover, #1440) and a wide
  // screen on the picker.
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
    // The wide viewport alone does not attach the production probe — an
    // active exercise does (C2, #1214): merely mounting `Leetype` on a wide
    // screen with nothing picked yet must not reach for the engine either.
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

  it("never loads rounds on a wide screen", () => {
    setViewport(false)
    const loadRounds = vi.fn(() => Promise.resolve(AUTHORED_ROUNDS))
    render(<Leetype loadRounds={loadRounds} />)
    expect(loadRounds).not.toHaveBeenCalled()
  })

  it("starts a session once the learner picks an exercise from the picker", () => {
    setViewport(false)
    render(<Leetype />)
    const [firstTile] = screen.getAllByRole("button")
    fireEvent.click(firstTile!)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })

  // The strengthened half of the negative control above: on a wide
  // viewport, the engine is fetched only once the production probe is
  // actually attached — the learner picking an exercise — never merely by
  // `Leetype` itself mounting. Read together, the two tests pin exactly what
  // "loads the engine only when the probe is opened, not on mount" means:
  // "mount" is `Leetype`'s own, before any exercise is active; "opened" is
  // an active exercise resolving to `TypingSession`.
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
    // The orchestrator removes the whole component at its own mount time
    // plus sessionDurationMs, fixed the instant Leetype mounts. Time spent
    // waiting for the served rounds has to come out of the session's own
    // term, for the reason picker time did (review finding on
    // some-ui#1182).
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

      // About 300ms remain; two 250ms ticks end the session only if the
      // 700ms spent loading was subtracted.
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
