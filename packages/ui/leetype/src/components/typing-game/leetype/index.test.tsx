import { CHALLENGES } from "@some-ui/content"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Leetype } from "."

/**
 * Regression coverage for the challenge picker not respecting that a host may
 * be *fetching* its challenge pool.
 *
 * `apps/www` serves its corpus out of the public dir (`/leetype/challenges.json`,
 * see apps/www/src/lib/leetype-challenges) and forwards the result as the
 * `challenges` prop. That prop being absent used to mean two different things -
 * "this host has no corpus, use the bundled demo pool" and "this host's corpus
 * hasn't landed yet" - and the picker resolved the ambiguity the wrong way. It
 * is a blocking step the player acts on the instant it appears, so it offered
 * the bundled demo pool during the fetch window; a fast pick latched a demo
 * challenge into `pickedChallenge` and the real corpus was never seen.
 *
 * The wasm crate is mocked because `Leetype` mounts `useTypingGame`
 * unconditionally, even on the picker branch where no code is loaded yet -
 * these tests are about which panel the dialog renders, not the engine.
 */
vi.mock("@some-ui/leetype-wasm", () => {
  const SNAPSHOT = {
    cursorSlot: 0,
    cursorDisplay: 0,
    cursorSection: null,
    slotCount: 0,
    filled: 0,
    correct: 0,
    firstGapSlot: null,
    progress: 0,
    accuracy: 100,
    wpm: 0,
    elapsedTime: 0,
    totalErrors: 0,
    consecutiveErrors: 0,
    showErrorAlert: false,
    isComplete: false,
    started: false,
  }

  class TypingGame {
    layout(): unknown {
      return { displayLen: 0, slotCount: 0, sections: [] }
    }
    roles(): Uint8Array {
      return new Uint8Array()
    }
    slot_of_display(): Int32Array {
      return new Int32Array()
    }
    slot_status(): Uint8Array {
      return new Uint8Array()
    }
    snapshot(): unknown {
      return SNAPSHOT
    }
    section_progress(): unknown {
      return []
    }
    cumulative_stats(): unknown {
      return { charsTyped: 0, errors: 0 }
    }
    start(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    press(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    backspace(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    jump_to_slot(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    jump_to_section(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    resume(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    dismiss_alert(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    reset(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    reset_game(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    complete_chunk(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    start_next_chunk(): unknown {
      return { accepted: true, snapshot: SNAPSHOT }
    }
    free(): void {}
  }

  return {
    default: vi.fn(() => Promise.resolve(undefined)),
    TypingGame,
    classify_source: (): Uint8Array => new Uint8Array(),
    slot_map_from_source: (): Int32Array => new Int32Array(),
  }
})

const FIRST_DEMO_TITLE = CHALLENGES[0]!.title

beforeEach(() => {
  localStorage.clear()
})

describe("Leetype challenge picker, against a host that fetches its pool", () => {
  it("offers nothing selectable while the host's corpus is still in flight", () => {
    render(<Leetype challengesPending />)

    expect(screen.getByText(/loading challenges/i)).toBeInTheDocument()
    // The specific defect: not merely "a spinner is shown" but "there is
    // nothing here to pick", since a pick made now would be latched against a
    // pool that is about to be replaced.
    expect(
      screen.queryByRole("button", { name: new RegExp(FIRST_DEMO_TITLE, "i") })
    ).not.toBeInTheDocument()
  })

  it("opens the picker on the host's own corpus once it lands", () => {
    const corpus = [
      {
        ...CHALLENGES[0]!,
        id: "fetched-exercise",
        title: "Fetched From Public Dir",
        codePaths: { rust: "/leetype/samples/fetched-exercise.rs" },
      },
    ]

    render(<Leetype challenges={corpus} />)

    expect(
      screen.getByRole("button", { name: /fetched from public dir/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/loading challenges/i)).not.toBeInTheDocument()
  })

  it("falls back to the bundled demo pool when the host settles on no corpus", () => {
    // `challengesPending` false with no `challenges` is the *settled* absence -
    // GitHub Pages, or a localhost 404 - and must not wait on a fetch that is
    // never coming.
    render(<Leetype challengesPending={false} />)

    expect(
      screen.getByRole("button", { name: new RegExp(FIRST_DEMO_TITLE, "i") })
    ).toBeInTheDocument()
    expect(screen.queryByText(/loading challenges/i)).not.toBeInTheDocument()
  })

  it("defaults to not-pending, so a host with a synchronous pool needs no new prop", () => {
    render(<Leetype />)

    expect(screen.queryByText(/loading challenges/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: new RegExp(FIRST_DEMO_TITLE, "i") })
    ).toBeInTheDocument()
  })
})
