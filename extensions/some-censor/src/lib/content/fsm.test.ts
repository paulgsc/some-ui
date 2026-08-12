/**
 * The projection, now that it carries what the stylesheet used to.
 *
 * Moving the hint copy and the progress rail out of `::before`/`::after`
 * `content:` rules and into `project()` means a missing state is a missing
 * pill rather than a missing CSS rule. The compiler catches an unhandled
 * variant; these cover what it cannot — that the copy is actually there, that
 * the rail only ever moves forwards, and that the veil's role matches the
 * state it is projected from.
 */

import { mkSession } from "@some-extension/common"
import { describe, expect, it } from "vitest"

import type { ViewState } from "./fsm"
import { applyClick, applyDblClick, applyReset, project } from "./fsm"

const session = mkSession()

const META = {
  channelName: "Some Channel",
  duration: "12:34",
  uploadDate: "2 days ago",
} as const

const STATES: ReadonlyArray<ViewState> = [
  { kind: "masked", session },
  { kind: "meta", session, meta: META },
  {
    kind: "title",
    session,
    meta: META,
    title: { text: "A title", translated: false },
  },
  { kind: "revealed", session },
  { kind: "whitelisted", session },
]

describe("every state projects a complete presentation", () => {
  it("gives every state that keeps a veil a hint to show", () => {
    for (const state of STATES) {
      const model = project(state)
      if (model.removeVeil) continue
      expect(model.hint, `${state.kind} must project a hint`).not.toBeNull()
      expect(
        model.hint?.label.length,
        `${state.kind} hint copy`
      ).toBeGreaterThan(0)
    }
  })

  it("projects no hint for the state whose veil is leaving", () => {
    const model = project({ kind: "revealed", session })
    expect(model.removeVeil).toBe(true)
    expect(model.hint).toBeNull()
  })

  it("keeps the copy click-honest", () => {
    // Every step of this FSM is a click; the pill must not promise a hover
    // affordance the machine does not implement.
    for (const state of STATES) {
      const label = project(state).hint?.label.toLowerCase()
      if (!label) continue
      expect(label, `${state.kind}: "${label}"`).not.toContain("hover")
    }
  })

  it("matches the veil's tone to whether it is still occluding", () => {
    expect(project({ kind: "masked", session }).veilTone).toBe("occluding")
    expect(project({ kind: "meta", session, meta: META }).veilTone).toBe(
      "occluding"
    )
    expect(project({ kind: "whitelisted", session }).veilTone).toBe(
      "whitelisted"
    )
  })
})

describe("the rail reads the disclosure ladder", () => {
  it("advances with each click and never goes backwards", () => {
    const masked = applyReset(session)
    const meta = applyClick(masked, META)
    const title = applyClick(meta, "A title")

    expect(project(masked).rail).toBe(0)
    expect(project(meta).rail).toBe(1)
    expect(project(title).rail).toBe(2)
  })

  it("stays full through the reveal", () => {
    const title = applyClick(applyClick(applyReset(session), META), "A title")
    expect(project(applyDblClick(title)).rail).toBe(2)
  })

  it("reads empty for a card that was never progressed", () => {
    // Whitelisted is not "finished", it is "exempt" — a full rail would claim
    // the user disclosed the card themselves.
    expect(project({ kind: "whitelisted", session }).rail).toBe(0)
  })
})

describe("data-boyo stays the stylesheet's contract", () => {
  it("keeps the values content.css and the e2e suite key off", () => {
    expect(project({ kind: "masked", session }).dataBoyo).toBe("0")
    expect(project({ kind: "meta", session, meta: META }).dataBoyo).toBe("1")
    expect(
      project({
        kind: "title",
        session,
        meta: META,
        title: { text: "t", translated: false },
      }).dataBoyo
    ).toBe("2")
    expect(project({ kind: "revealed", session }).dataBoyo).toBe("3")
    expect(project({ kind: "whitelisted", session }).dataBoyo).toBe("wl")
  })
})
