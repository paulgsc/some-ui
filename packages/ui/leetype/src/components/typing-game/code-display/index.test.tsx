import {
  ROLE_CONTEXT,
  ROLE_TYPEABLE,
  SLOT_UNTOUCHED,
  VISIBILITY_MASKED,
  VISIBILITY_REVEALED,
} from "@leetype/types/leetype"
import type { RenderResult } from "@testing-library/react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { LineKind } from "."
import { CodeDisplay } from "."

/**
 * A context-bearing fixture built by hand rather than through the wasm
 * engine: `CodeDisplay` is a pure renderer over already-projected arrays
 * (`roles`/`slotOfDisplay`/…), so its invariants are testable without a
 * running game — see the component's own doc comment on why its props
 * carry no engine vocabulary.
 *
 * "// context\n" (11 chars, ROLE_CONTEXT) followed by "let x = 1;" (10
 * chars, ROLE_TYPEABLE) — a context frame ahead of a typeable body, the
 * same shape LTY-FRAME's own fixture uses
 * (`crates/leetype_wasm/tests/context_frame.rs`'s `FRAMED`).
 */
const CONTEXT_PREFIX = "// context\n"
const TYPEABLE_BODY = "let x = 1;"
const DISPLAY_CODE = CONTEXT_PREFIX + TYPEABLE_BODY

const roles = new Uint8Array(DISPLAY_CODE.length)
for (let i = 0; i < CONTEXT_PREFIX.length; i++) {
  roles[i] = ROLE_CONTEXT
}
for (let i = CONTEXT_PREFIX.length; i < DISPLAY_CODE.length; i++) {
  roles[i] = ROLE_TYPEABLE
}

const slotOfDisplay = new Int32Array(DISPLAY_CODE.length).fill(-1)
let nextSlot = 0
for (let i = 0; i < DISPLAY_CODE.length; i++) {
  if (roles[i] === ROLE_TYPEABLE) {
    slotOfDisplay[i] = nextSlot
    nextSlot++
  }
}
const slotStatus = new Uint8Array(nextSlot).fill(SLOT_UNTOUCHED)
const visibility = new Uint8Array(nextSlot).fill(VISIBILITY_REVEALED)

/**
 * Every display index the engine could legitimately hand `CodeDisplay` as
 * `cursorDisplay` — "the engine guarantees this is always a typeable
 * character" is the component's own prop doc, and F1 guarantees the caret
 * never lands inside a context span structurally (no slot). This is that
 * guarantee's render-level half: walk every position the caret is ever
 * legitimately parked at, not just one.
 */
const typeableDisplayIndices = Array.from(roles)
  .map((role, index) => ({ role, index }))
  .filter(({ role }) => role === ROLE_TYPEABLE)
  .map(({ index }) => index)

describe("CodeDisplay — the caret never lands on a context character", () => {
  it.each(typeableDisplayIndices)(
    "renders exactly one caret, on the typeable character at display index %i, with every context character still muted",
    (cursorDisplay) => {
      const { container } = render(
        <CodeDisplay
          displayCode={DISPLAY_CODE}
          language="rust"
          roles={roles}
          slotOfDisplay={slotOfDisplay}
          slotStatus={slotStatus}
          visibility={visibility}
          cursorDisplay={cursorDisplay}
        />
      )

      // Exactly one caret exists — `getByTitle` throws on zero or more than
      // one match — and it carries the character at `cursorDisplay`.
      const caret = screen.getByTitle("You are here")
      expect(caret.textContent).toContain(DISPLAY_CODE[cursorDisplay])

      // No context-styled character also carries the caret's title: the two
      // render paths (the cursor branch and the `isContext` branch) never
      // produce the same element.
      const caretOnContext = container.querySelectorAll(
        '[title="You are here"].italic'
      )
      expect(caretOnContext).toHaveLength(0)

      // Every context character in the fixture is still rendered as context
      // — muted, carrying its real glyph rather than MASK_CHAR — regardless
      // of where the (always-typeable) cursor sits. Checking the joined text
      // rather than just the span count: a regression that fed context
      // characters through the masked branch would still produce the right
      // number of spans, just with the wrong content.
      const contextSpans = container.querySelectorAll(
        ".italic.text-muted-foreground\\/70"
      )
      expect(
        Array.from(contextSpans)
          .map((span) => span.textContent)
          .join("")
      ).toBe(CONTEXT_PREFIX)
    }
  )

  it("keeps context unmasked while every typeable slot around it is masked", () => {
    // The fixture above never masks anything, which cannot distinguish
    // "context renders correctly" from "context renders correctly because
    // nothing is masked in the first place" — this is the case that
    // actually exercises "context carries no slot for VISIBILITY_MASKED to
    // apply to" (the component's own comment on the branch below it).
    const allMasked = new Uint8Array(slotStatus.length).fill(VISIBILITY_MASKED)
    const cursorDisplay = CONTEXT_PREFIX.length // the first typeable slot

    const { container } = render(
      <CodeDisplay
        displayCode={DISPLAY_CODE}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={allMasked}
        cursorDisplay={cursorDisplay}
      />
    )

    const contextSpans = container.querySelectorAll(
      ".italic.text-muted-foreground\\/70"
    )
    expect(
      Array.from(contextSpans)
        .map((span) => span.textContent)
        .join("")
    ).toBe(CONTEXT_PREFIX)

    // Contrast: the typeable body, masked and off the caret, does show
    // MASK_CHAR — proving the fixture actually masks something, so the
    // context assertion above means what it claims to.
    const maskedTypeableSpans = container.querySelectorAll(
      ".text-muted-foreground\\/40"
    )
    expect(maskedTypeableSpans.length).toBeGreaterThan(0)
    maskedTypeableSpans.forEach((span) => {
      expect(span.textContent).toBe("•")
    })
  })
})

// ── LTY-PATCH P3 (#1078): the hunk overlay ─────────────────────────────

/**
 * A small hand-built hunk: one context line, one deleted line, one added
 * line, one more context line — the ordinary two-column diff convention
 * exercised across every row kind in one fixture.
 *
 * Deletion is `Role::Context` throughout (LTY-PATCH P1, #1076: a `-` line
 * and an unchanged line are the same thing to the engine), so `bad();`
 * gets the same role as `start`/`end` — only the hunk's own `lineKinds`
 * distinguishes them, which is exactly the distinction this story adds.
 */
const HUNK_LINES = ["start", "bad();", "good();", "end"]
const HUNK_KINDS: ReadonlyArray<LineKind> = ["context", "del", "add", "context"]
const HUNK_DISPLAY_CODE = HUNK_LINES.join("\n")
const HUNK_OLD_START = 10
const HUNK_NEW_START = 10

function buildHunkFixture(): {
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
} {
  const roles = new Uint8Array(HUNK_DISPLAY_CODE.length)
  const slotOfDisplay = new Int32Array(HUNK_DISPLAY_CODE.length).fill(-1)
  let displayIndex = 0
  let slot = 0
  HUNK_LINES.forEach((line, lineIndex) => {
    const role = HUNK_KINDS[lineIndex] === "add" ? ROLE_TYPEABLE : ROLE_CONTEXT
    for (let i = 0; i < line.length; i++) {
      roles[displayIndex] = role
      if (role === ROLE_TYPEABLE) slotOfDisplay[displayIndex] = slot++
      displayIndex++
    }
    if (lineIndex < HUNK_LINES.length - 1) {
      roles[displayIndex] = ROLE_CONTEXT // the '\n' itself — never read by the row renderer
      displayIndex++
    }
  })
  return {
    roles,
    slotOfDisplay,
    slotStatus: new Uint8Array(slot).fill(SLOT_UNTOUCHED),
    visibility: new Uint8Array(slot).fill(VISIBILITY_REVEALED),
  }
}

const CONTEXT_SOURCE_FOR_NO_HUNK_CHECK = "// note\nlet y = 2;"

function roleArrayAllContext(source: string): Uint8Array {
  return new Uint8Array(source.length).fill(ROLE_CONTEXT)
}

describe("CodeDisplay — the hunk overlay (LTY-PATCH P3, #1078)", () => {
  it("renders a sign column and both line-number columns, add/del/context alike", () => {
    const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
    const { container } = render(
      <CodeDisplay
        displayCode={HUNK_DISPLAY_CODE}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={-1}
        hunk={{
          lineKinds: HUNK_KINDS,
          oldStart: HUNK_OLD_START,
          newStart: HUNK_NEW_START,
        }}
      />
    )

    const rows = container.querySelectorAll("[data-line-kind]")
    expect(rows).toHaveLength(4)
    expect(
      Array.from(rows).map((row) => row.getAttribute("data-line-kind"))
    ).toEqual(["context", "del", "add", "context"])

    // sign, old, new: the ordinary two-column diff convention — add fills
    // the new column only, del fills the old column only, context fills
    // both, and every row's running counters advance independently.
    const expectedGutters = [
      { sign: " ", old: "10", new: "10" },
      { sign: "-", old: "11", new: "" },
      { sign: "+", old: "", new: "11" },
      { sign: " ", old: "12", new: "12" },
    ]
    rows.forEach((row, i) => {
      const [sign, old, next] = row.children
      expect(sign?.textContent).toBe(expectedGutters[i]?.sign)
      expect(old?.textContent).toBe(expectedGutters[i]?.old)
      expect(next?.textContent).toBe(expectedGutters[i]?.new)
    })
  })

  it("wraps every row's code in a real <pre>, never a bare language- code element", () => {
    // Regression for a review finding: Prism's imported theme carries an
    // unlayered `:not(pre) > code[class*="language-"]` rule that overrides
    // `white-space` to `normal` and paints an opaque background — jsdom
    // does not compute this (Codex's own review noted the DOM-only tests
    // above cannot observe it), so the invariant that actually avoids the
    // rule — every language- code element's parent is a real `pre` — is
    // asserted here structurally instead.
    const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
    const { container } = render(
      <CodeDisplay
        displayCode={HUNK_DISPLAY_CODE}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={-1}
        hunk={{
          lineKinds: HUNK_KINDS,
          oldStart: HUNK_OLD_START,
          newStart: HUNK_NEW_START,
        }}
      />
    )

    const languageCodeElements = container.querySelectorAll(
      'code[class*="language-"]'
    )
    expect(languageCodeElements).toHaveLength(4) // one per row
    languageCodeElements.forEach((code) => {
      expect(code.parentElement?.tagName).toBe("PRE")
    })
  })

  it("lands the caret on the first character of the first + line", () => {
    const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
    const firstAddIndex = HUNK_DISPLAY_CODE.indexOf("good();")

    render(
      <CodeDisplay
        displayCode={HUNK_DISPLAY_CODE}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={firstAddIndex}
        hunk={{
          lineKinds: HUNK_KINDS,
          oldStart: HUNK_OLD_START,
          newStart: HUNK_NEW_START,
        }}
      />
    )

    const caret = screen.getByTitle("You are here")
    expect(caret.textContent).toBe("g")
    expect(
      caret.closest("[data-line-kind]")?.getAttribute("data-line-kind")
    ).toBe("add")
  })

  it("gives a deleted line its own paint — struck-through and muted red, not italic", () => {
    const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
    const { container } = render(
      <CodeDisplay
        displayCode={HUNK_DISPLAY_CODE}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={-1}
        hunk={{
          lineKinds: HUNK_KINDS,
          oldStart: HUNK_OLD_START,
          newStart: HUNK_NEW_START,
        }}
      />
    )

    const delRow = container.querySelector('[data-line-kind="del"]')
    const contextRow = container.querySelector('[data-line-kind="context"]')

    expect(delRow?.querySelectorAll(".line-through")).toHaveLength(
      "bad();".length
    )
    expect(delRow?.querySelectorAll(".italic")).toHaveLength(0)

    expect(contextRow?.querySelectorAll(".italic").length).toBeGreaterThan(0)
    expect(contextRow?.querySelectorAll(".line-through")).toHaveLength(0)
  })

  it("renders the tail as unmarked context when lineKinds runs short, total rather than throwing", () => {
    const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
    const render_ = (): RenderResult =>
      render(
        <CodeDisplay
          displayCode={HUNK_DISPLAY_CODE}
          language="rust"
          roles={roles}
          slotOfDisplay={slotOfDisplay}
          slotStatus={slotStatus}
          visibility={visibility}
          cursorDisplay={-1}
          hunk={{
            lineKinds: ["context"], // only the first row's kind is authored
            oldStart: HUNK_OLD_START,
            newStart: HUNK_NEW_START,
          }}
        />
      )

    expect(render_).not.toThrow()
    const { container } = render_()
    const rows = container.querySelectorAll("[data-line-kind]")
    expect(rows).toHaveLength(4)
    rows.forEach((row) => {
      expect(row.getAttribute("data-line-kind")).toBe("context")
    })
  })

  it("renders exactly as it did before this story when no hunk is given", () => {
    const { container } = render(
      <CodeDisplay
        displayCode={CONTEXT_SOURCE_FOR_NO_HUNK_CHECK}
        language="rust"
        roles={roleArrayAllContext(CONTEXT_SOURCE_FOR_NO_HUNK_CHECK)}
        slotOfDisplay={new Int32Array(
          CONTEXT_SOURCE_FOR_NO_HUNK_CHECK.length
        ).fill(-1)}
        slotStatus={new Uint8Array(0)}
        visibility={new Uint8Array(0)}
        cursorDisplay={-1}
      />
    )

    expect(container.querySelectorAll("[data-line-kind]")).toHaveLength(0)
    expect(container.querySelector("pre > code")).not.toBeNull()
  })

  it("keeps every character in place across a hunk containing a multi-line Prism token", () => {
    // A block comment split across two lines by the hunk boundary would
    // tokenize as one Prism token spanning the newline if this component
    // still tokenized the whole displayCode at once — the exact hazard the
    // story calls out. Whatever colors that produces, every character must
    // still land at its correct display index and survive verbatim.
    const lines = ["/* start", "   end */", "let x = 1;"]
    const displayCode = lines.join("\n")
    const roles = new Uint8Array(displayCode.length).fill(ROLE_TYPEABLE)
    const slotOfDisplay = Int32Array.from(
      { length: displayCode.length },
      (_, i) => i
    )
    const slotStatus = new Uint8Array(displayCode.length).fill(SLOT_UNTOUCHED)
    const visibility = new Uint8Array(displayCode.length).fill(
      VISIBILITY_REVEALED
    )

    const { container } = render(
      <CodeDisplay
        displayCode={displayCode}
        language="rust"
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={-1}
        hunk={{ lineKinds: ["add", "add", "add"], oldStart: 1, newStart: 1 }}
      />
    )

    const rows = container.querySelectorAll("[data-line-kind]")
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => {
      expect(row.querySelector("code")?.textContent).toBe(lines[i])
    })
  })
})
