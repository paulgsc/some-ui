/**
 * @vitest-environment jsdom
 *
 * Studio's Spoken on the phone (W5): a spoken card pasted and split into
 * parts, a part read under Kokoro's question, every take of it kept with Use
 * this one, and the essay's copy on the card's page.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { spokenPhone } from "@/lib/studio-spoken/__tests__/fixture"
import { lineOf, parseCard } from "@/lib/studio-spoken/model"
import { essayBlock, SPOKEN_WORDS } from "@/lib/studio-spoken/words"
import {
  PasteSpoken,
  SpokenList,
  SpokenPartPage,
  SpokenParts,
} from "@/components/studio/spoken"

const navigate = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const { withPlainLink } = await import("@/test-support/router-stubs")
  return {
    ...withPlainLink(await importOriginal<typeof ReactRouterModule>()),
    useNavigate: (): typeof navigate => navigate,
  }
})

vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (audience: string): boolean => audience === "apk",
}))

const W = SPOKEN_WORDS

const PASTED = `How I built Rust Rounds

SCRIPT
QUESTION What is Rust Rounds?
Rust Rounds is a week of Rust on my phone.

OWN WORDS
Why I stopped writing Rust every day.`

const pass = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Says part `n` of card `id`: a tap, talk, a tap. */
async function say(
  sim: ReturnType<typeof spokenPhone>["sim"],
  id: string,
  n: number
): Promise<void> {
  act(() => sim.pattern.tap(lineOf(id, n), null))
  await pass(2_000)
  act(() => sim.pattern.tap(lineOf(id, n), null))
  await pass()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-20T22:00:00Z"))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  navigate.mockReset()
})

describe("Studio's Spoken", () => {
  it("lists no card until one is pasted, then each with its category, parts and takes", () => {
    const { runtime } = spokenPhone()
    const { unmount } = render(<SpokenList runtime={runtime} />)
    expect(screen.getByText(W.none)).toBeTruthy()
    expect(
      screen.getByText(W.paste.open).closest("a")?.getAttribute("to")
    ).toBe("/journal/spoken/paste")
    unmount()
    act(() => {
      runtime.keep(
        parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] }
      )
    })
    render(<SpokenList runtime={runtime} />)
    expect(screen.getByText("How I built Rust Rounds")).toBeTruthy()
    expect(
      screen.getByText(/Introduction · .* · 2 parts · no takes yet/u)
    ).toBeTruthy()
  })

  it("shows how a paste splits before it is kept, then opens the card", () => {
    const { runtime } = spokenPhone()
    render(<PasteSpoken runtime={runtime} />)
    const keep = screen.getByRole("button", { name: W.paste.keep })
    expect(keep.hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByLabelText(W.paste.label), {
      target: { value: PASTED },
    })
    expect(screen.getByTestId("spoken-split").textContent).toBe(
      W.paste.split(1, 1, 1)
    )
    fireEvent.click(keep)
    const kept = runtime.cards.getSnapshot().at(0)
    expect(kept?.parts).toHaveLength(2)
    expect(navigate).toHaveBeenCalledWith({
      to: "/journal/spoken/$card",
      params: { card: kept?.id },
    })
  })

  it("reads a part under its question, keeps every take, and uses the one picked", async () => {
    const { runtime, sim } = spokenPhone()
    const id =
      runtime.keep(
        parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] }
      ) ?? ""
    render(<SpokenPartPage runtime={runtime} id={id} n={0} />)
    expect(screen.getByText(W.theyAsk)).toBeTruthy()
    expect(screen.getByText("What is Rust Rounds?")).toBeTruthy()
    expect(
      document.querySelector(`[data-script="${lineOf(id, 0)}"]`)
    ).not.toBeNull()
    await say(sim, id, 0)
    await say(sim, id, 0)
    expect(screen.getByText(W.takes(2))).toBeTruthy()
    const rows = document.querySelectorAll("[data-spoken-take]")
    expect(rows).toHaveLength(2)
    // Newest first; Use this one on the first take said.
    const first = rows[1]
    if (!(first instanceof HTMLElement)) throw new Error("no first take")
    fireEvent.click(within(first).getByRole("button", { name: W.useThis }))
    expect(runtime.cards.getSnapshot()[0]?.parts[0]?.using).toBe(
      first.dataset.spokenTake
    )
    expect(within(first).getByText(/Take 1 · on home · Using/u)).toBeTruthy()
  })

  it("offers no Use this one on a take home couldn't hear", async () => {
    const { runtime, sim } = spokenPhone({
      heard: () => Promise.resolve({ kind: "heard", text: "" }),
    })
    const id =
      runtime.keep(
        parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] }
      ) ?? ""
    render(<SpokenPartPage runtime={runtime} id={id} n={1} />)
    // An own-words part: the prompt, no band.
    expect(document.querySelector("[data-script]")).toBeNull()
    await say(sim, id, 1)
    expect(screen.getByText(W.heard.none)).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.useThis })).toBeNull()
  })

  it("shows the essay's copy of the card on its page", () => {
    const { runtime } = spokenPhone()
    const id =
      runtime.keep(
        parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] }
      ) ?? ""
    render(<SpokenParts runtime={runtime} id={id} />)
    const [card] = runtime.cards.getSnapshot()
    expect(document.querySelector("pre")?.textContent).toBe(essayBlock(card))
  })

  it("says a paste past forty parts keeps only forty, and nothing at forty", () => {
    const { runtime } = spokenPhone()
    render(<PasteSpoken runtime={runtime} />)
    const paste = (parts: number): void => {
      fireEvent.change(screen.getByLabelText(W.paste.label), {
        target: {
          value: Array.from(
            { length: parts },
            (_, n) => `SCRIPT\nLine ${n}.`
          ).join("\n\n"),
        },
      })
    }
    paste(40)
    expect(screen.queryByText(W.paste.most(40))).toBeNull()
    paste(41)
    expect(screen.getByText(W.paste.most(40))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.paste.keep }))
    expect(runtime.cards.getSnapshot()[0]?.parts).toHaveLength(40)
  })

  it("copies no pick home heard nothing in from the card's page", async () => {
    const { runtime, sim } = spokenPhone({
      heard: () => Promise.resolve({ kind: "heard", text: "" }),
    })
    const id =
      runtime.keep(
        parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] }
      ) ?? ""
    await say(sim, id, 0)
    const take = runtime.cards.getSnapshot()[0]?.parts[0]?.takes[0] ?? ""
    runtime.use(id, 0, take)
    render(<SpokenParts runtime={runtime} id={id} />)
    await pass()
    expect(document.querySelector("pre")?.textContent).not.toContain(
      `From take ${take}`
    )
  })

  it("says so when the card isn't on this phone", () => {
    const { runtime } = spokenPhone()
    render(<SpokenParts runtime={runtime} id="scnope" />)
    expect(screen.getByText(W.lost)).toBeTruthy()
  })
})
