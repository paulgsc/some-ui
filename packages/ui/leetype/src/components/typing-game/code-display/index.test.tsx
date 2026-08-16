import {
  ROLE_CONTEXT,
  ROLE_TYPEABLE,
  SLOT_UNTOUCHED,
  VISIBILITY_MASKED,
  VISIBILITY_REVEALED,
} from "@leetype/types/leetype"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

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
