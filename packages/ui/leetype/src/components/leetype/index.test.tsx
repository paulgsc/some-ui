import { Leetype } from "@leetype/components/leetype"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import { render, screen } from "@testing-library/react"
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
  // React context (@some-ui/content-registry's own rule).
  it("mounts with no props at all, on either surface", () => {
    setViewport(true)
    const { unmount } = render(<Leetype />)
    expect(screen.getByText("Practice")).toBeInTheDocument()
    unmount()

    setViewport(false)
    render(<Leetype />)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })
})
