import {
  createDocumentScopeCustodian,
  DOCUMENT_SCOPE_ID,
  type FireOutcome,
} from "@filter/adapter/document-scope"
import * as legibilityAudit from "@filter/adapter/legibility-audit"
import { LEGIBILITY_ATTR } from "@filter/adapter/legibility-audit"
import type * as LegibilityAuditModule from "@filter/adapter/legibility-audit"
import { createContentSession } from "@filter/adapter/pipeline"
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
})
