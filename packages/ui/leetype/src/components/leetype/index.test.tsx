import { Leetype } from "@leetype/components/leetype"
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

/** What the phone's surface says when the host keeps no session files. */
const PHONE = /plays sessions of incident rounds/

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
  it("gives a narrow viewport the phone's surface, even when an exercise is passed", () => {
    setViewport(true)
    render(<Leetype exercise={EXERCISE} />)

    expect(screen.getByText(PHONE)).toBeInTheDocument()
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
  })

  it("gives a wide viewport the typing surface", () => {
    setViewport(false)
    render(<Leetype exercise={EXERCISE} />)

    // The typing surface's own keystroke-capture element, which the phone's
    // surface has no equivalent of.
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
    expect(screen.queryByText(PHONE)).not.toBeInTheDocument()
  })

  // A phone never fetches the engine: true by construction, pinned here.
  it("never reaches for the typing engine on a narrow viewport", () => {
    setViewport(true)
    render(<Leetype exercise={EXERCISE} />)
    expect(loadWasm).not.toHaveBeenCalled()
  })

  it("does reach for it on a wide one, so the assertion above means something", () => {
    setViewport(false)
    render(<Leetype exercise={EXERCISE} />)
    expect(loadWasm).toHaveBeenCalled()
  })

  it("honours an explicit surface override, whatever the viewport says", () => {
    setViewport(false)
    const { unmount } = render(<Leetype exercise={EXERCISE} surface="rounds" />)
    expect(screen.getByText(PHONE)).toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()
    unmount()

    setViewport(true)
    render(<Leetype exercise={EXERCISE} surface="typing" />)
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
  })

  // The registry contract: renders with no props or context. A phone with
  // no host store says where its sessions come from; a wide screen picks.
  it("mounts with no props at all: the phone's surface on a phone, the picker on a wide screen", () => {
    setViewport(true)
    const { unmount } = render(<Leetype />)
    expect(screen.getByText(PHONE)).toBeInTheDocument()
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

  it("plays a held session file in place of the picker, and completes when the learner is done", async () => {
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
})
