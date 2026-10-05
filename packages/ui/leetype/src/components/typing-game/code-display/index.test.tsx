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
 * A hand-built fixture (CodeDisplay is a pure renderer, no engine needed):
 * "// context\n" (ROLE_CONTEXT) then "let x = 1;" (ROLE_TYPEABLE), the shape
 * of `crates/leetype_wasm/tests/context_frame.rs`'s `FRAMED`.
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

/** Every display index the engine may hand over as `cursorDisplay` (always typeable). */
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

      // `getByTitle` throws unless there is exactly one caret.
      const caret = screen.getByTitle("You are here")
      expect(caret.textContent).toContain(DISPLAY_CODE[cursorDisplay])

      const caretOnContext = container.querySelectorAll(
        '[title="You are here"].italic'
      )
      expect(caretOnContext).toHaveLength(0)

      // Joined text, not a span count: masked context would keep the count.
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

    // Contrast: the masked typeable body does show MASK_CHAR.
    const maskedTypeableSpans = container.querySelectorAll(
      ".text-muted-foreground\\/40"
    )
    expect(maskedTypeableSpans.length).toBeGreaterThan(0)
    maskedTypeableSpans.forEach((span) => {
      expect(span.textContent).toBe("•")
    })
  })
})

// ── The hunk overlay (LTY-PATCH) ────────────────────────────────────────

/**
 * context, del, add, context. A deleted line is `Role::Context` to the
 * engine, so only `lineKinds` tells `bad();` from `start`/`end`.
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

/** Renders the hunk fixture with `hunk` overrides and a cursor (default: none). */
function renderHunk(
  overrides: {
    cursorDisplay?: number
    lineKinds?: ReadonlyArray<LineKind>
  } = {}
): RenderResult {
  const { roles, slotOfDisplay, slotStatus, visibility } = buildHunkFixture()
  return render(
    <CodeDisplay
      displayCode={HUNK_DISPLAY_CODE}
      language="rust"
      roles={roles}
      slotOfDisplay={slotOfDisplay}
      slotStatus={slotStatus}
      visibility={visibility}
      cursorDisplay={overrides.cursorDisplay ?? -1}
      hunk={{
        lineKinds: overrides.lineKinds ?? HUNK_KINDS,
        oldStart: HUNK_OLD_START,
        newStart: HUNK_NEW_START,
      }}
    />
  )
}

function roleArrayAllContext(source: string): Uint8Array {
  return new Uint8Array(source.length).fill(ROLE_CONTEXT)
}

describe("CodeDisplay — the hunk overlay (LTY-PATCH)", () => {
  it("renders a sign column and both line-number columns, add/del/context alike", () => {
    const { container } = renderHunk()

    const rows = container.querySelectorAll("[data-line-kind]")
    expect(rows).toHaveLength(4)
    expect(
      Array.from(rows).map((row) => row.getAttribute("data-line-kind"))
    ).toEqual(["context", "del", "add", "context"])

    // add fills only the new column, del only the old, context both.
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
    // jsdom cannot compute Prism's `:not(pre) > code[class*="language-"]`
    // rule, so assert the structure that avoids it.
    const { container } = renderHunk()

    const languageCodeElements = container.querySelectorAll(
      'code[class*="language-"]'
    )
    expect(languageCodeElements).toHaveLength(4) // one per row
    languageCodeElements.forEach((code) => {
      expect(code.parentElement?.tagName).toBe("PRE")
    })
  })

  it("lands the caret on the first character of the first + line", () => {
    renderHunk({ cursorDisplay: HUNK_DISPLAY_CODE.indexOf("good();") })

    const caret = screen.getByTitle("You are here")
    expect(caret.textContent).toBe("g")
    expect(
      caret.closest("[data-line-kind]")?.getAttribute("data-line-kind")
    ).toBe("add")
  })

  it("gives a deleted line its own paint — struck-through and muted red, not italic", () => {
    const { container } = renderHunk()

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
    // Only the first row's kind is authored.
    const render_ = (): RenderResult => renderHunk({ lineKinds: ["context"] })

    expect(render_).not.toThrow()
    const { container } = render_()
    const rows = container.querySelectorAll("[data-line-kind]")
    expect(rows).toHaveLength(4)
    rows.forEach((row) => {
      expect(row.getAttribute("data-line-kind")).toBe("context")
    })
  })

  it("renders the plain, row-free path when no hunk is given", () => {
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
    // Per-line tokenizing may miscolor a block comment, but every character
    // must survive verbatim at its display index.
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
