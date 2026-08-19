import {
  coverageInvariants,
  type CoverageContext,
} from "@filter/lib/content/coverage-observability"
import type { InvariantOutcome } from "@some-extension/common/observability"
import { describe, expect, it } from "vitest"

function findInvariant(name: string): {
  check: (ctx: CoverageContext) => InvariantOutcome | Promise<InvariantOutcome>
} {
  const invariant = coverageInvariants.find((inv) => inv.name === name)
  if (invariant === undefined) {
    throw new Error(`no invariant named ${name}`)
  }
  return invariant
}

// Every check() in coverageInvariants is synchronous — coverage-watchdog.ts's
// generic runInvariants() call site is what makes it async, not the checks
// themselves — so this cast is safe and keeps every test below a plain
// synchronous assertion rather than an awaited one.
function check(
  invariant: ReturnType<typeof findInvariant>,
  ctx: CoverageContext
): InvariantOutcome {
  const outcome = invariant.check(ctx)
  if (outcome instanceof Promise) {
    throw new Error("expected a synchronous outcome")
  }
  return outcome
}

const CoverageHeld = findInvariant("CoverageHeld")
const LegacySignalsAgree = findInvariant("LegacySignalsAgree")
const VeilColorMatchesLegacyState = findInvariant("VeilColorMatchesLegacyState")

/** A context where nothing is covering the page and nothing is declared active — every field explicit so each test only overrides what it means to vary. */
function baseContext(
  overrides: Partial<CoverageContext> = {}
): CoverageContext {
  return {
    now: 0,
    tabState: "auto",
    veilPresent: false,
    dirtyClassPresent: false,
    darkThemeActive: false,
    legacyAttrPresent: false,
    legacyStyleActive: false,
    veilBackgroundColor: null,
    ...overrides,
  }
}

describe("CoverageHeld — Remark C.1's zero-leak invariant", () => {
  it("holds unconditionally when the tab is off, regardless of coverage state", () => {
    const ctx = baseContext({ tabState: "off" })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("holds when the dark theme is active", () => {
    const ctx = baseContext({ tabState: "auto", darkThemeActive: true })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("holds when the veil element is present", () => {
    const ctx = baseContext({ tabState: "auto", veilPresent: true })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("holds when only the sw-dirty CSS backstop is up (veil element itself gone)", () => {
    const ctx = baseContext({ tabState: "auto", dirtyClassPresent: true })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("holds when legacy is genuinely active (attribute and style agree)", () => {
    const ctx = baseContext({
      tabState: "legacy",
      legacyAttrPresent: true,
      legacyStyleActive: true,
    })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("is violated when legacy declares itself active but the filter rule is not actually there — the reported live-flash scenario", () => {
    const ctx = baseContext({
      tabState: "legacy",
      legacyAttrPresent: true,
      legacyStyleActive: false,
    })
    expect(check(CoverageHeld, ctx).ok).toBe(false)
  })

  it("is violated in auto mode when nothing at all is covering the page", () => {
    const ctx = baseContext({ tabState: "auto" })
    expect(check(CoverageHeld, ctx).ok).toBe(false)
  })

  it("is violated in legacy mode when nothing at all is covering the page", () => {
    const ctx = baseContext({ tabState: "legacy" })
    expect(check(CoverageHeld, ctx).ok).toBe(false)
  })
})

describe("LegacySignalsAgree", () => {
  it("holds when both the attribute and the style rule are present", () => {
    const ctx = baseContext({
      legacyAttrPresent: true,
      legacyStyleActive: true,
    })
    expect(check(LegacySignalsAgree, ctx)).toEqual({ ok: true })
  })

  it("holds when neither is present", () => {
    const ctx = baseContext({
      legacyAttrPresent: false,
      legacyStyleActive: false,
    })
    expect(check(LegacySignalsAgree, ctx)).toEqual({ ok: true })
  })

  it("is violated when the attribute is declared but the style rule is missing", () => {
    const ctx = baseContext({
      legacyAttrPresent: true,
      legacyStyleActive: false,
    })
    expect(check(LegacySignalsAgree, ctx).ok).toBe(false)
  })

  it("is violated when the style rule is present but the attribute is missing", () => {
    const ctx = baseContext({
      legacyAttrPresent: false,
      legacyStyleActive: true,
    })
    expect(check(LegacySignalsAgree, ctx).ok).toBe(false)
  })
})

describe("VeilColorMatchesLegacyState", () => {
  it("is unknown when no veil is present to read a color from", () => {
    const ctx = baseContext({ veilPresent: false })
    expect(check(VeilColorMatchesLegacyState, ctx)).toEqual({ ok: "unknown" })
  })

  it("is unknown when the veil's background color does not parse", () => {
    const ctx = baseContext({
      veilPresent: true,
      veilBackgroundColor: "not-a-color",
    })
    expect(check(VeilColorMatchesLegacyState, ctx)).toEqual({ ok: "unknown" })
  })

  it("holds when legacy is inactive and the veil is declared dark", () => {
    const ctx = baseContext({
      veilPresent: true,
      legacyAttrPresent: false,
      legacyStyleActive: false,
      veilBackgroundColor: "rgb(23, 28, 37)", // #171c25, VEIL_BG in prepaint.ts
    })
    expect(check(VeilColorMatchesLegacyState, ctx)).toEqual({ ok: true })
  })

  it("holds when legacy is genuinely active and the veil is declared white", () => {
    const ctx = baseContext({
      veilPresent: true,
      legacyAttrPresent: true,
      legacyStyleActive: true,
      veilBackgroundColor: "rgb(255, 255, 255)",
    })
    expect(check(VeilColorMatchesLegacyState, ctx)).toEqual({ ok: true })
  })

  it("is violated when legacy declares itself active but the veil is still dark — composites to white uninverted, a literal flash", () => {
    const ctx = baseContext({
      veilPresent: true,
      legacyAttrPresent: true,
      legacyStyleActive: true,
      veilBackgroundColor: "rgb(23, 28, 37)",
    })
    expect(check(VeilColorMatchesLegacyState, ctx).ok).toBe(false)
  })

  it("is violated when legacy is inactive but the veil is still declared white — reads as a literal white flash with no filter to invert it back", () => {
    const ctx = baseContext({
      veilPresent: true,
      legacyAttrPresent: false,
      legacyStyleActive: false,
      veilBackgroundColor: "rgb(255, 255, 255)",
    })
    expect(check(VeilColorMatchesLegacyState, ctx).ok).toBe(false)
  })
})
