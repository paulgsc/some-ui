import type { Algorithm } from "@leetype/types/algorithm"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SourcePanel } from "."

const ALGORITHM: Algorithm = {
  source: "export function solve(n: number): number {\n  return n * 2\n}",
  language: "typescript",
  entryPoint: "solve",
  inputAlphabet: "a single non-negative integer n on stdin",
}

async function open(): Promise<void> {
  fireEvent.click(screen.getByText("Show source"))
  await screen.findByText("Hide source")
}

describe("SourcePanel", () => {
  it("renders closed, with no source visible until opened", () => {
    const { container } = render(<SourcePanel algorithm={ALGORITHM} />)
    expect(screen.getByText("Show source")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(container.textContent).not.toContain("return n * 2")
  })

  // Stands in for "opens on a fresh round with an empty ledger" (R1's
  // acceptance criterion): this component takes no ledger, no ordinal and no
  // prior-answer prop at all, so a bare mount with nothing but `algorithm`
  // *is* the fresh-round, empty-ledger case, and the toggle works the same
  // way regardless.
  it("opens immediately on a fresh mount — no ledger or prior state required", async () => {
    const { container } = render(<SourcePanel algorithm={ALGORITHM} />)
    await open()
    // Prism splits "return n * 2" across several token spans, so this reads
    // the assembled text content rather than looking for one text node.
    expect(container.textContent).toContain("return n * 2")
  })

  it("shows the entry point and input alphabet once opened, each on its own wrapping line", async () => {
    const { container } = render(<SourcePanel algorithm={ALGORITHM} />)
    await open()
    // `entryPoint` ("solve") also appears as an identifier inside the
    // highlighted source below, so this is scoped to the caption paragraphs
    // rather than queried by text alone.
    const captions = [...container.querySelectorAll("p")]
    expect(captions).toHaveLength(2)
    expect(captions[0]?.textContent).toContain(ALGORITHM.entryPoint)
    expect(captions[1]?.textContent).toContain(ALGORITHM.inputAlphabet)
    // Regression for a review finding on #1248: a single `truncate`d line
    // silently clipped an unbounded `inputAlphabet` with no way to recover
    // the omitted text. Neither caption may clip again.
    for (const caption of captions) {
      expect(caption.className).not.toMatch(/\btruncate\b/)
    }
  })

  it("closes again when the algorithm changes on an already-mounted instance", async () => {
    const { rerender, container } = render(
      <SourcePanel algorithm={ALGORITHM} />
    )
    await open()
    expect(container.textContent).toContain("return n * 2")

    const NEXT_ALGORITHM: Algorithm = {
      source: 'fn main() {\n    println!("next round");\n}',
      language: "rust",
      entryPoint: "main",
      inputAlphabet: "none",
    }
    // Same instance, not remounted — a caller may legitimately swap
    // `algorithm` this way (a review finding on #1248: without resetting,
    // a round left open would carry `open = true` straight into the next
    // round's source).
    rerender(<SourcePanel algorithm={NEXT_ALGORITHM} />)

    expect(screen.getByText("Show source")).toBeInTheDocument()
    expect(container.textContent).not.toContain("next round")
  })

  it("syntax-highlights through Prism — token spans, not a flat string", async () => {
    const { container } = render(<SourcePanel algorithm={ALGORITHM} />)
    await open()
    expect(container.querySelector('code span[class^="token"]')).not.toBeNull()
  })

  it("labels the language chip per algorithm.language", () => {
    render(
      <SourcePanel
        algorithm={{ ...ALGORITHM, language: "rust", source: "fn main() {}" }}
      />
    )
    expect(screen.getByText("Rust")).toBeInTheDocument()
  })
})
