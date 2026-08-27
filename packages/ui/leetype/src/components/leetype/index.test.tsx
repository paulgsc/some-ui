import { Leetype } from "@leetype/components/leetype"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import { claimOf } from "@leetype/lib/leetype/reading-probe"
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
  // forced, that render is the picker — the seeded schedule this used to
  // land on is gone.
  it("mounts with no props at all, landing on the picker, on either surface", () => {
    setViewport(true)
    const { unmount } = render(<Leetype />)
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
    expect(screen.queryByRole("group")).not.toBeInTheDocument()
    unmount()

    setViewport(false)
    render(<Leetype />)
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
  })

  it("starts a session once the learner picks an exercise from the picker", () => {
    setViewport(false)
    render(<Leetype />)
    const [firstTile] = screen.getAllByRole("button")
    fireEvent.click(firstTile!)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
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

  it("returns to the picker once a picker-chosen session finishes, and never shows it for a forced exercise", () => {
    // A one-step diagnostic, read through the mobile surface: no wasm, and
    // one correct pick ends the whole session.
    setViewport(true)
    const onSessionComplete = vi.fn()
    render(<Leetype onSessionComplete={onSessionComplete} />)

    const oneStep = nextExercise({ preferId: "diagnostic-loop-progress" })
    fireEvent.click(screen.getByText(oneStep.title))
    expect(
      screen.queryByText("Choose what to practice")
    ).not.toBeInTheDocument()

    const answer = claimOf(oneStep.steps[0]!).text
    fireEvent.click(screen.getByText(answer))
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }))
    fireEvent.click(screen.getByRole("button", { name: /next change/i }))

    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
  })

  it("subtracts time spent browsing the picker from the session's own budget", () => {
    // The orchestrator removes the whole component at its own mount time
    // plus sessionDurationMs, fixed the instant Leetype mounts -- before
    // the learner has picked anything. Without accounting for that, a
    // session picked late would still be handed the full, un-shrunk
    // duration and could be unmounted by the orchestrator before its own
    // completion effect ever ran (review finding on some-ui#1182).
    setViewport(true) // reading surface: no wasm, deterministic completion
    // `performance` is not in vitest's default fake-timer set, but both
    // Leetype's own elapsed-time snapshot and ReadingSession's clock read
    // performance.now() directly, so it has to advance in lockstep with
    // the interval ticks this test drives.
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
      render(
        <Leetype
          sessionDurationMs={1000}
          onSessionComplete={onSessionComplete}
        />
      )

      const oneStep = nextExercise({ preferId: "diagnostic-loop-progress" })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      fireEvent.click(screen.getByText(oneStep.title))

      // Only ~300ms of the 1000ms budget should remain; the session polls
      // its clock every 250ms, so 500ms more (two ticks) is enough to end
      // it if and only if the picker's own 700ms was actually subtracted
      // rather than given away for free -- 500ms would not be enough
      // against the full, un-shrunk 1000ms budget. Completion returns
      // straight to the picker (the same shape the round-trip test above
      // pins), so that reappearing is the observable proof.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(onSessionComplete).toHaveBeenCalledTimes(1)
      expect(screen.getByText("Choose what to practice")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
