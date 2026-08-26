import { DiffCard } from "@leetype/components/reading-game/diff-card"
import type { ReadingHunk } from "@leetype/lib/leetype/reading-probe"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const HUNK: ReadingHunk = {
  path: "src/auth/session.rs",
  language: "rust",
  rows: [
    {
      index: 0,
      kind: "context",
      text: "let session = store.lookup(id)?;",
      oldLine: 41,
      newLine: 41,
    },
    { index: 1, kind: "del", text: "if session.expired() {", oldLine: 42 },
    {
      index: 2,
      kind: "add",
      text: "if session.expired() || session.revoked() {",
      newLine: 42,
    },
  ],
}

describe("DiffCard", () => {
  it("draws one row per line, tagged with its kind", () => {
    const { container } = render(<DiffCard hunk={HUNK} />)
    expect(
      [...container.querySelectorAll("[data-line-kind]")].map((row) =>
        row.getAttribute("data-line-kind")
      )
    ).toEqual(["context", "del", "add"])
  })

  it("shows the file path and a language chip, and no git chrome", () => {
    render(<DiffCard hunk={HUNK} />)
    expect(screen.getByText("src/auth/session.rs")).toBeInTheDocument()
    expect(screen.getByText("Rust")).toBeInTheDocument()
    // A branch, a SHA, a "view file" or a "copy patch" would all imply git
    // semantics this card does not have (LTY-PATCH: nothing here ingests a
    // real diff).
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  // Colour alone never carries add/remove: the sign column says it visually
  // and a screen-reader-only phrase says it aloud.
  it("states each changed row's role in words, not only in colour", () => {
    render(<DiffCard hunk={HUNK} />)
    expect(screen.getByText("added line:")).toBeInTheDocument()
    expect(screen.getByText("removed line:")).toBeInTheDocument()
  })

  // Wrapping would break the correspondence between a `+` row and the `-` row
  // above it, which is the entire comparison the card exists to support.
  it("never wraps code — the code region scrolls horizontally instead", () => {
    const { container } = render(<DiffCard hunk={HUNK} />)
    const scroller = container.querySelector(
      '[data-scroll-intent="code-display"]'
    )
    expect(scroller?.className).toContain("overflow-x-auto")
    expect(scroller?.className).not.toContain("overflow-y")
    const code = container.querySelector("pre")
    expect(code?.className).toContain("whitespace-pre")
  })

  it("renders code without an engine — no roles, slots, caret or visibility", () => {
    // The props are the assertion: `DiffCard` takes a hunk and nothing else,
    // which is what keeps @some-ui/leetype-wasm out of the mobile chunk.
    // A regression here would be a new required prop, and this render is what
    // stops one arriving unnoticed.
    const { container } = render(<DiffCard hunk={HUNK} />)
    // Read off the container rather than by text: Prism splits a line across
    // one span per token, so no single node holds a whole statement.
    expect(container.textContent).toContain("store.lookup(id)?;")
    expect(container.textContent).toContain("session.revoked()")
  })

  // jsdom lays nothing out, so `scrollWidth === clientWidth === 0` and the
  // measurement reports "nothing is clipped" — which is the state to pin
  // here: the affordance must not appear on a card that fits, or it stops
  // meaning anything on the card that does not.
  it("shows no scroll affordance for a hunk that fits", () => {
    render(<DiffCard hunk={HUNK} />)
    expect(screen.queryByText(/swipe the code/i)).not.toBeInTheDocument()
  })

  it("omits the header entirely for a hunk with no path", () => {
    const { container } = render(
      <DiffCard hunk={{ language: "rust", rows: HUNK.rows }} />
    )
    expect(container.textContent).not.toContain("Rust")
    expect(container.querySelectorAll("[data-line-kind]")).toHaveLength(3)
  })
})
