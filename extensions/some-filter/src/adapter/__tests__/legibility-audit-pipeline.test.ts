import {
  createDocumentScopeCustodian,
  DOCUMENT_SCOPE_ID,
  type FireOutcome,
} from "@filter/adapter/document-scope"
import { REPAIR_ATTR } from "@filter/adapter/foreground-repair"
import * as legibilityAudit from "@filter/adapter/legibility-audit"
import {
  LEGIBILITY_ATTR,
  REPAIR_STYLE_ID,
} from "@filter/adapter/legibility-audit"
import type * as LegibilityAuditModule from "@filter/adapter/legibility-audit"
import {
  createContentSession,
  INTERACTION_SETTLE_MS,
} from "@filter/adapter/pipeline"
import { SWATCHES } from "@filter/adapter/swatches"
import { PREPAINT_VEIL_ID } from "@filter/lib/content/prepaint"
import { DARK_THEME_ATTR } from "@filter/lib/content/theme-apply"
import { createSessionLifecycle } from "@some-extension/transport/session/lifecycle"
import { afterEach, describe, expect, it, vi } from "vitest"

// Wraps the real implementation by default (every test but the throw tests
// below calls through to it unmodified) — `.mockImplementationOnce` in those
// two tests overrides exactly one call and then reverts automatically, so no
// afterEach restoration is needed.
vi.mock("@filter/adapter/legibility-audit", async (importOriginal) => {
  const actual = await importOriginal<typeof LegibilityAuditModule>()
  return { ...actual, auditLegibility: vi.fn(actual.auditLegibility) }
})

const STYLE_ID = "__sw_dark_theme"
const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"

function cleanUp(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  document.documentElement.classList.remove("sw-dirty")
  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  document.querySelectorAll(`[${LEGIBILITY_ATTR}]`).forEach((el) => {
    el.removeAttribute(LEGIBILITY_ATTR)
  })
  document.getElementById(REPAIR_STYLE_ID)?.remove()
  document.querySelectorAll(`[${REPAIR_ATTR}]`).forEach((el) => {
    el.removeAttribute(REPAIR_ATTR)
  })
  document.body.innerHTML = ""
  document.documentElement.style.backgroundColor = ""
  document.body.style.backgroundColor = ""
}

afterEach(() => {
  cleanUp()
  vi.mocked(legibilityAudit.auditLegibility).mockClear()
})

describe("SF-RC1 — the legibility sub-pass, gated on activate-theme", () => {
  it("does not run when no swatch is selected (decide() emits nothing)", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(null, session)

    contentSession.rescan()

    expect(legibilityAudit.auditLegibility).not.toHaveBeenCalled()
    contentSession.teardown()
  })

  it("does not run when the page reads as already dark (restore-native)", () => {
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>' +
      '<div id="b" style="background-color: rgb(5, 5, 5)"></div>' +
      '<div id="c" style="background-color: rgb(10, 10, 10)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(legibilityAudit.auditLegibility).not.toHaveBeenCalled()
    contentSession.teardown()
  })

  it("runs exactly once, after decide/realize, when a theme actually activates", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    expect(legibilityAudit.auditLegibility).toHaveBeenCalledTimes(1)
    contentSession.teardown()
  })
})

describe("SF-RC1 — isolation from the first pass's own verdict", () => {
  it("a catastrophic legibility violation cannot flip decide()'s verdict to restore-native", () => {
    // "light" alone keeps the page well clear of pageAlreadyDark()'s own
    // MIN_EVIDENCE_FOR_DARK_VERDICT threshold, so activate-theme fires.
    // "dark-surface" declares its own (already-legible) white text, but
    // "text-carrier" nested inside it overrides back to black with no
    // background of its own -- F-20's own escape route: near-1:1 rendered
    // contrast once "dark-surface" is darkened, and (unlike the FIRST
    // pass's own SurfaceAttr) that evidence never had a background of its
    // own to enter pipeline.ts's scan() at all.
    document.body.innerHTML =
      '<div id="light" style="background-color: rgb(255, 255, 255)"></div>' +
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"

    const session = createSessionLifecycle()
    let outcome: FireOutcome | undefined
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      (o) => {
        outcome = o
      }
    )

    contentSession.rescan()

    expect(outcome?.kind).toBe("ok")
    if (outcome?.kind === "ok") {
      expect(outcome.actions.some((a) => a.kind === "restore-native")).toBe(
        false
      )
      expect(outcome.actions.some((a) => a.kind === "activate-theme")).toBe(
        true
      )
      // The legibility channel's own findings never enter this array at all
      // — not just at runtime, but structurally: FilterAction has no
      // "tag-legibility" member, so a comparison against it here would not
      // even type-check if the isolation were ever violated.
    }
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)

    // The violation was still found and tagged -- isolation, not blindness.
    expect(
      document.getElementById("text-carrier")?.getAttribute(LEGIBILITY_ATTR)
    ).toBe("violated")

    contentSession.teardown()
  })
})

describe("SF-RC1 — clears its own diagnostic tags when theme activation ends", () => {
  it("clears a stale data-sw-legibility tag when a later round transitions from themed to restore-native (Codex review, PR #1345)", () => {
    // Round 1: themed, with a genuine F-20-style violation tagged.
    document.body.innerHTML =
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    expect(
      document.getElementById("text-carrier")?.getAttribute(LEGIBILITY_ATTR)
    ).toBe("violated")

    // Round 2: append (not replace) three more dark surfaces and a dark
    // canvas -- "dark-surface" is now data-sw-patched and excluded from
    // re-scanning, so these three are what actually cross
    // MIN_EVIDENCE_FOR_DARK_VERDICT and flip the verdict to restore-native,
    // with "text-carrier" (and its stale tag) still physically present in
    // the DOM the whole time -- this is a real transition, not a DOM wipe
    // that would trivially leave no stale tag to find.
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>' +
        '<div id="b" style="background-color: rgb(5, 5, 5)"></div>' +
        '<div id="c" style="background-color: rgb(10, 10, 10)"></div>'
    )

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(
      document.getElementById("text-carrier")?.hasAttribute(LEGIBILITY_ATTR)
    ).toBe(false)
    expect(document.querySelectorAll(`[${LEGIBILITY_ATTR}]`).length).toBe(0)

    contentSession.teardown()
  })
})

describe("SF-RC1 — a thrown/incomplete audit leaves the round held, not committed", () => {
  it("produces a FireOutcome 'error', mirroring a thrown decide()/realize() (#1266)", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      throw new Error("legibility audit boom")
    })

    const session = createSessionLifecycle()
    let outcome: FireOutcome | undefined
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      (o) => {
        outcome = o
      }
    )

    contentSession.rescan()

    expect(outcome?.kind).toBe("error")
    contentSession.teardown()
  })

  it("wired through document-scope.ts's registry, leaves the document FAILED_HELD, never COMMITTED", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      throw new Error("legibility audit boom")
    })

    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    const session = createSessionLifecycle()
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      (outcome) => {
        custodian.reportPipelineOutcome(outcome)
      }
    )

    contentSession.rescan()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "FAILED_HELD"
    )
    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).not.toBe(
      "COMMITTED"
    )

    contentSession.teardown()
  })

  it("reports null, not the stale prior-round audit, when the round's own throw is caught (bot-found, Codex confirming review on #1443)", () => {
    // The two tests above confirm this same throw is caught and reported as
    // FireOutcome "error" — this confirms the contrast channel's own output
    // doesn't go silently stale on that same failure. Without this, a round
    // that themes the page cleanly, then a later round throws (auditLegibility
    // mocked to fail only on the second call below), would leave the *first*
    // round's audit standing in as current for as long as the page keeps
    // failing to produce a clean round — document-scope.ts's own FAILED_HELD
    // transition has no reach into pipeline.ts's own documentContrast (a
    // separate module content.ts alone bridges), so only this catch is
    // positioned to invalidate it. `null`, not `[]` (bot-found, Codex
    // confirming review round 3 on #1443): the empty-array version of this
    // fix let a failed round merge indistinguishably from a genuinely clean
    // one if some other, unaffected source had only passing pairs.
    document.body.innerHTML =
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"
    const session = createSessionLifecycle()
    const onContrastAudited = vi.fn()
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      undefined,
      undefined,
      onContrastAudited
    )

    contentSession.rescan()
    // The first round reports a real (non-empty) audit — clear it so the
    // assertion below is unambiguously about the failed second round.
    onContrastAudited.mockClear()

    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      throw new Error("legibility audit boom")
    })
    contentSession.rescan()

    expect(onContrastAudited).toHaveBeenCalledTimes(1)
    expect(onContrastAudited).toHaveBeenCalledWith(null)

    contentSession.teardown()
  })
})

describe("SF-RC2 — the repair channel rides the audit's own gate", () => {
  it("repairs a violated carrier in the same round the audit tags it", () => {
    document.body.innerHTML =
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    const carrier = document.getElementById("text-carrier")
    // The diagnostic tag SF-RC1 writes and the repair SF-RC2 writes are two
    // separate attributes from two separate action sets, derived from one
    // scan — a carrier under repair is still reported as a violation of the
    // *page's own* rendered contrast, which is what it is.
    expect(carrier?.getAttribute(LEGIBILITY_ATTR)).toBe("violated")
    expect(carrier?.getAttribute(REPAIR_ATTR)).toBe(
      "rgb(0, 0, 0)~rgb(13, 17, 23)"
    )

    const sheet = document.getElementById(REPAIR_STYLE_ID)
    expect(sheet?.textContent).toContain("color:rgb(158, 158, 158)!important")
    // Never a background, and never through the per-surface sheet: this
    // channel owns its own <style> element outright.
    expect(sheet?.textContent).not.toContain("background")

    contentSession.teardown()
  })

  it("re-derives the same violation on a second round rather than undoing itself", () => {
    // The oscillation `withRepairSuppressed` exists to prevent: without it,
    // round 2 reads back the repair's own !important colour, concludes the
    // carrier is legible, drops the tag and the rule, and the carrier
    // reverts to being illegible — a flicker driven by nothing but this
    // extension's own output.
    //
    // The carrier declares its own `-webkit-text-fill-color` equal to its
    // `color`, which is the case Codex review round 3 found (an explicit
    // fill indistinguishable from the `currentcolor` default at sense
    // time) — and is also what makes this assertion runnable here at all.
    // jsdom applies a stylesheet's `-webkit-text-fill-color` while ignoring
    // the same rule's `color`, and ignores `CSSStyleSheet.disabled` for
    // computed style outright (both confirmed directly), so without an
    // inline fill to win over it the emitted repair leaks into round 2's
    // own sensing as a fill/colour mismatch and `ownTextColor` reports
    // `underdetermined`. The *suppression* half of this claim is therefore
    // only meaningfully provable in a real browser — see
    // `tests/e2e/specs/issue-1341-sfrc2-foreground-repair.spec.ts`'s
    // `#transitioned` carrier, which fails without the freeze.
    document.body.innerHTML =
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0); -webkit-text-fill-color: rgb(0, 0, 0)">hi</div>' +
      "</div>"
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()
    const sheetTextAfterFirst =
      document.getElementById(REPAIR_STYLE_ID)?.textContent

    contentSession.rescan()

    expect(
      document.getElementById("text-carrier")?.getAttribute(REPAIR_ATTR)
    ).toBe("rgb(0, 0, 0)~rgb(13, 17, 23)")
    expect(document.getElementById(REPAIR_STYLE_ID)?.textContent).toBe(
      sheetTextAfterFirst
    )

    contentSession.teardown()
  })

  it("tears its own sheet down when theme activation ends", () => {
    document.body.innerHTML =
      '<div id="dark-surface" style="background-color: rgb(13, 17, 23); color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()
    expect(document.getElementById(REPAIR_STYLE_ID)).not.toBeNull()

    // Same transition the SF-RC1 stale-tag test above drives: enough dark
    // evidence to flip the page verdict to restore-native, with the carrier
    // still physically present.
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div style="background-color: rgb(10, 10, 12)"></div>' +
        '<div style="background-color: rgb(11, 11, 13)"></div>' +
        '<div style="background-color: rgb(12, 12, 14)"></div>'
    )

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(
      document.getElementById("text-carrier")?.hasAttribute(REPAIR_ATTR)
    ).toBe(false)
    expect(document.getElementById(REPAIR_STYLE_ID)).toBeNull()

    contentSession.teardown()
  })
})

describe("SF-RC4 (#1343) — the interaction-settled contrast pass", () => {
  /**
   * jsdom applies no stylesheet rule to `getComputedStyle`, so a real
   * `:hover` colour swap cannot be expressed here at all — that half is an
   * e2e claim (`issue-1343-sfrc4-interaction-states.spec.ts`). What these
   * pin is the wiring: which events schedule a pass, that a burst collapses
   * into one, that it is the *contrast* channel and not a full round, and
   * that an unthemed page and a torn-down session both do nothing.
   */
  function themedPage(): void {
    document.body.innerHTML =
      '<div id="surface" style="background-color: rgb(255, 255, 255)">' +
      '<div id="text-carrier" style="color: rgb(20, 20, 20)">hi</div>' +
      "</div>"
  }

  function dispatch(type: string, target: Element = document.body): void {
    target.dispatchEvent(new Event(type, { bubbles: true }))
  }

  it("re-runs the contrast channel once interaction settles", () => {
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    dispatch(
      "pointerover",
      document.getElementById("text-carrier") ?? document.body
    )
    expect(
      vi.mocked(legibilityAudit.auditLegibility),
      "the pass must wait for interaction to settle, not fire per event"
    ).not.toHaveBeenCalled()

    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(vi.mocked(legibilityAudit.auditLegibility)).toHaveBeenCalledTimes(1)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("collapses a burst of interaction events into a single pass", () => {
    // A pointer crossing a page emits pointerover/pointerout per element. A
    // pass per event — or one every debounce window of continuous motion —
    // is the cost this settle-debounce exists to avoid.
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    for (let i = 0; i < 25; i += 1) {
      dispatch("pointerover")
      dispatch("pointerout")
      vi.advanceTimersByTime(INTERACTION_SETTLE_MS - 1)
    }
    expect(vi.mocked(legibilityAudit.auditLegibility)).not.toHaveBeenCalled()

    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)
    expect(vi.mocked(legibilityAudit.auditLegibility)).toHaveBeenCalledTimes(1)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("listens for the bubbling members of each pair, which is what delegation requires", () => {
    // #1343 names pointerenter/pointerleave/focus/blur; none of those four
    // bubble, so a listener delegated on `document` never sees them.
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()

    for (const type of ["pointerover", "pointerout", "focusin", "focusout"]) {
      vi.mocked(legibilityAudit.auditLegibility).mockClear()
      dispatch(type)
      vi.advanceTimersByTime(INTERACTION_SETTLE_MS)
      expect(
        vi.mocked(legibilityAudit.auditLegibility),
        `${type} must schedule a pass`
      ).toHaveBeenCalledTimes(1)
    }

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("does nothing on an unthemed page", () => {
    // A page with no theme applied has nothing this extension painted to
    // audit — the listeners stay attached but cost nothing.
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div id="text-carrier" style="color: rgb(20, 20, 20)">hi</div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(null, session)
    contentSession.rescan()
    contentSession.observe()
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    dispatch("pointerover")
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(vi.mocked(legibilityAudit.auditLegibility)).not.toHaveBeenCalled()

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("ignores interaction inside an extension-owned subtree", () => {
    vi.useFakeTimers()
    themedPage()
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-my-ext><span id="own-child">veil</span></div>'
    )
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    dispatch(
      "pointerover",
      document.getElementById("own-child") ?? document.body
    )
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(vi.mocked(legibilityAudit.auditLegibility)).not.toHaveBeenCalled()

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("invokes the shadow-scope hook once interaction settles", () => {
    // auditLegibility's TreeWalker does not cross a shadow boundary, so the
    // document pass above covers the light DOM and nothing else. The shadow
    // half is reached through this callback (bot-found, Codex review round 1
    // on #1415) — content.ts holds both and wires recontrastAll() into it.
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const onInteractionSettled = vi.fn()
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      undefined,
      onInteractionSettled
    )
    contentSession.rescan()
    contentSession.observe()
    onInteractionSettled.mockClear()

    dispatch("pointerover")
    expect(onInteractionSettled).not.toHaveBeenCalled()
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(onInteractionSettled).toHaveBeenCalledTimes(1)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("still invokes the shadow hook when the document itself is unthemed", () => {
    // A scope's verdict is independent of the document's: a page reading
    // already-dark natively can hold committed shadow scopes with live
    // repairs. Gating both halves on DARK_THEME_ATTR would strand them.
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div id="text-carrier" style="color: rgb(20, 20, 20)">hi</div>'
    const session = createSessionLifecycle()
    const onInteractionSettled = vi.fn()
    const contentSession = createContentSession(
      null,
      session,
      undefined,
      onInteractionSettled
    )
    contentSession.rescan()
    contentSession.observe()
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    vi.mocked(legibilityAudit.auditLegibility).mockClear()
    onInteractionSettled.mockClear()

    dispatch("pointerover")
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(
      vi.mocked(legibilityAudit.auditLegibility),
      "the document half stays gated"
    ).not.toHaveBeenCalled()
    expect(
      onInteractionSettled,
      "the shadow half must run regardless — it is self-gating on COMMITTED"
    ).toHaveBeenCalledTimes(1)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("runs the shadow hook even if the document half throws", () => {
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const onInteractionSettled = vi.fn()
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      undefined,
      onInteractionSettled
    )
    contentSession.rescan()
    contentSession.observe()
    onInteractionSettled.mockClear()
    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      throw new Error("audit blew up")
    })

    dispatch("pointerover")
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(
      onInteractionSettled,
      "one half failing must not cost the other its pass"
    ).toHaveBeenCalledTimes(1)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("reports null, not the stale pre-interaction audit, when the document half throws (bot-found, Codex confirming review on #1443)", () => {
    // The test above ("runs the shadow hook even if the document half
    // throws") confirms the *shadow* half is unaffected; this confirms the
    // document half's own onContrastAudited does not go silent on its own
    // failure. Without this, runContrastChannel throwing before its own
    // onContrastAudited call left content.ts's documentContrast holding
    // whatever the *previous*, pre-interaction round reported — stale
    // forever, since nothing else re-triggers this channel. `null`, not `[]`
    // (bot-found, Codex confirming review round 3 on #1443): the
    // empty-array version of this fix let a failed round merge
    // indistinguishably from a genuinely clean one.
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const onContrastAudited = vi.fn()
    const contentSession = createContentSession(
      SWATCHES.default,
      session,
      undefined,
      undefined,
      onContrastAudited
    )
    contentSession.rescan()
    contentSession.observe()
    // The initial rescan() reports a real (non-empty) audit — clear it so
    // the assertion below is unambiguously about the interaction pass.
    onContrastAudited.mockClear()
    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      throw new Error("audit blew up")
    })

    dispatch("pointerover")
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS)

    expect(onContrastAudited).toHaveBeenCalledTimes(1)
    expect(onContrastAudited).toHaveBeenCalledWith(null)

    contentSession.teardown()
    vi.useRealTimers()
  })

  it("applies the cooldown when an over-budget document pass throws (bot-found, Codex closing review on #1459)", () => {
    // The traversal's cost is paid whether or not the pass completes. A
    // throw during realization or reporting used to skip the cooldown
    // entirely, so on exactly the pages where the audit fails every later
    // pointer or focus pause repeated the same long traversal, unbounded.
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    let clock = 0
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock)
    vi.mocked(legibilityAudit.auditLegibility).mockImplementationOnce(() => {
      // Well past INTERACTION_AUDIT_BUDGET_MS, then fail.
      clock += 1_000
      throw new Error("audit blew up after a long traversal")
    })
    // Spy calls silence the console.error the catch path emits by design.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined)

    try {
      dispatch("pointerover")
      vi.advanceTimersByTime(INTERACTION_SETTLE_MS)
      expect(vi.mocked(legibilityAudit.auditLegibility)).toHaveBeenCalledTimes(
        1
      )

      // A second settle inside the cooldown must not traverse again.
      dispatch("pointerout")
      vi.advanceTimersByTime(INTERACTION_SETTLE_MS)
      expect(
        vi.mocked(legibilityAudit.auditLegibility),
        "the throw must not have skipped the cooldown"
      ).toHaveBeenCalledTimes(1)
    } finally {
      now.mockRestore()
      consoleError.mockRestore()
      consoleInfo.mockRestore()
      contentSession.teardown()
      vi.useRealTimers()
    }
  })

  it("stops listening, and cancels a pending pass, after teardown", () => {
    vi.useFakeTimers()
    themedPage()
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)
    contentSession.rescan()
    contentSession.observe()
    vi.mocked(legibilityAudit.auditLegibility).mockClear()

    // Scheduled, then torn down before it can fire.
    dispatch("pointerover")
    contentSession.teardown()
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS * 2)
    expect(vi.mocked(legibilityAudit.auditLegibility)).not.toHaveBeenCalled()

    // And no longer listening at all.
    dispatch("pointerover")
    vi.advanceTimersByTime(INTERACTION_SETTLE_MS * 2)
    expect(vi.mocked(legibilityAudit.auditLegibility)).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
