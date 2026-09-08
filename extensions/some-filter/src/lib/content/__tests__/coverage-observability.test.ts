import {
  createOcclusionHold,
  HOLD_ATTR,
} from "@filter/adapter/custody-primitive"
import type { ScopeStateKind } from "@filter/adapter/scope-registry"
import {
  coverageInvariants,
  scopeArtifactPresent,
  scopeCoverageInvariants,
  type CoverageContext,
  type ScopeCoverageContext,
  type ScopeCoverageEntry,
} from "@filter/lib/content/coverage-observability"
import {
  PREPAINT_DIRTY_CLASS,
  PREPAINT_VEIL_ID,
} from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
} from "@filter/lib/content/theme-apply"
import type { InvariantOutcome } from "@some-extension/common/observability"
import { afterEach, describe, expect, it } from "vitest"

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
const DarkSignalsAgree = findInvariant("DarkSignalsAgree")
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
    darkStyleActive: false,
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
    const ctx = baseContext({
      tabState: "auto",
      darkThemeActive: true,
      darkStyleActive: true,
    })
    expect(check(CoverageHeld, ctx)).toEqual({ ok: true })
  })

  it("is violated when data-sw-dark is declared but the theme stylesheet is not actually there", () => {
    const ctx = baseContext({
      tabState: "auto",
      darkThemeActive: true,
      darkStyleActive: false,
    })
    expect(check(CoverageHeld, ctx).ok).toBe(false)
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

describe("DarkSignalsAgree", () => {
  it("holds when both the attribute and the stylesheet are present", () => {
    const ctx = baseContext({ darkThemeActive: true, darkStyleActive: true })
    expect(check(DarkSignalsAgree, ctx)).toEqual({ ok: true })
  })

  it("holds when neither is present", () => {
    const ctx = baseContext({ darkThemeActive: false, darkStyleActive: false })
    expect(check(DarkSignalsAgree, ctx)).toEqual({ ok: true })
  })

  it("is violated when the attribute is declared but the stylesheet is missing — a <head> replacement carried it off", () => {
    const ctx = baseContext({ darkThemeActive: true, darkStyleActive: false })
    expect(check(DarkSignalsAgree, ctx).ok).toBe(false)
  })

  it("is violated when the stylesheet is present but the attribute is missing", () => {
    const ctx = baseContext({ darkThemeActive: false, darkStyleActive: true })
    expect(check(DarkSignalsAgree, ctx).ok).toBe(false)
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

// ── SF-OB (#1270): per-scope coverage ───────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = ""
})

function scopeEntry(
  kind: ScopeStateKind,
  artifactPresent: boolean | null,
  overrides: Partial<ScopeCoverageEntry> = {}
): ScopeCoverageEntry {
  return { id: "s1", kind, parent: null, artifactPresent, ...overrides }
}

describe("scopeArtifactPresent — re-reads the live DOM, never trusts κ alone", () => {
  it("HELD/RESOLVING/FAILED_HELD: true only when the occlusion hold's veil is actually present", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    for (const kind of ["HELD", "RESOLVING", "FAILED_HELD"] as const) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(false)
    }

    createOcclusionHold(shadow).install()

    for (const kind of ["HELD", "RESOLVING", "FAILED_HELD"] as const) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(true)
    }
  })

  it("HELD/RESOLVING/FAILED_HELD: still true once HOLD_ATTR/data-my-ext are stripped from the veil — bot-found (#1327's own review, round 3): createOcclusionHold()'s self-healer restores the veil's parent, children, style, and aria-hidden on every mutation but deliberately never HOLD_ATTR itself, and isHoldMutation() (shadow-scope-discovery.ts) identity-filters that exact attribute mutation so it never reaches the registry as vendor evidence either — a [HOLD_ATTR] selector here would report a permanent false violation on a veil that stays genuinely intact", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    createOcclusionHold(shadow).install()

    const veil = shadow.querySelector("hr")
    if (veil === null) throw new Error("expected the hold's veil to exist")
    veil.removeAttribute(HOLD_ATTR)
    veil.removeAttribute("data-my-ext")

    for (const kind of ["HELD", "RESOLVING", "FAILED_HELD"] as const) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(true)
    }
  })

  it("COMMITTED: true when the scope's own host-token rule is adopted, even with zero data-sw-patched elements — bot-found (#1327's own review, round 2): a canvas-only shadow scope commits exactly as legitimately as a tagged one", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)

    // shadow-actuator.ts's realizeShadowColors() adopts buildHostTokenRule()'s
    // own :host rule unconditionally on every commit — this scope has no
    // data-sw-patched element anywhere, matching decide()'s own
    // no-evidenced-surfaces case (shadow-scope-theming.test.ts's own
    // "adopts the shared static layer and host tokens even for a scope
    // with no evidenced surfaces").
    const hostTokenSheet = new CSSStyleSheet()
    hostTokenSheet.insertRule(":host { --sw-bg-0: #171c25; }")
    shadow.adoptedStyleSheets = [hostTokenSheet]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(true)
    expect(shadow.querySelector("[data-sw-patched]")).toBeNull()
  })

  it("COMMITTED: false when adoptedStyleSheets carries only a foreign (vendor) sheet, not this scope's own host-token rule", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const foreignSheet = new CSSStyleSheet()
    foreignSheet.insertRule("div { color: blue; }")
    shadow.adoptedStyleSheets = [foreignSheet]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)
  })

  it("COMMITTED: false when only the shared static sheet is adopted (its own scrollbar rule references var(--sw-bg-0)) but the scope's own :host token rule is gone — bot-found (#1327's own review, round 3): a bare substring match on '--sw-bg-0' also matches that unrelated var() reference", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    // theme-apply.ts's own DARK_THEME_BODY_RULES carries
    // `scrollbar-color: var(--sw-bg-3) var(--sw-bg-0);` — adopted into every
    // committed shadow scope's shared static sheet regardless of whether
    // that scope's own host-token sheet is still adopted.
    const staticSheet = new CSSStyleSheet()
    staticSheet.insertRule(
      "*{ scrollbar-color: var(--sw-bg-3) var(--sw-bg-0); }"
    )
    shadow.adoptedStyleSheets = [staticSheet]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)
  })

  it("EXONERATED_NATIVE, RETIRED, and DISCOVERED_UNHELD name no artifact of their own to check", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    expect(scopeArtifactPresent(shadow, "EXONERATED_NATIVE")).toBeNull()
    expect(scopeArtifactPresent(shadow, "RETIRED")).toBeNull()
    expect(scopeArtifactPresent(shadow, "DISCOVERED_UNHELD")).toBeNull()
  })
})

describe("scopeArtifactPresent — the document scope (r_0) uses its own coverage artifacts, not the shadow-scope selectors (bot-found, #1327's own review)", () => {
  it("HELD/RESOLVING/FAILED_HELD: true when the prepaint veil is present, even with no HOLD_ATTR element anywhere — r_0's own custody primitive is createPrepaintCustody(), never createOcclusionHold()", () => {
    expect(scopeArtifactPresent(document, "HELD")).toBe(false)
    const veil = document.createElement("div")
    veil.id = PREPAINT_VEIL_ID
    document.body.appendChild(veil)
    for (const kind of ["HELD", "RESOLVING", "FAILED_HELD"] as const) {
      expect(scopeArtifactPresent(document, kind)).toBe(true)
    }
    // Confirms this isn't accidentally still checking HOLD_ATTR.
    expect(document.querySelector(`[${HOLD_ATTR}]`)).toBeNull()
  })

  it("HELD: also true from the sw-dirty CSS backstop class alone, with no veil element", () => {
    expect(scopeArtifactPresent(document, "HELD")).toBe(false)
    document.documentElement.classList.add(PREPAINT_DIRTY_CLASS)
    expect(scopeArtifactPresent(document, "HELD")).toBe(true)
    document.documentElement.classList.remove(PREPAINT_DIRTY_CLASS)
  })

  it("COMMITTED: true when the dark theme attribute and its real stylesheet both agree, false for a bare data-sw-patched element (which a canvas-only page legitimately never has)", () => {
    const patched = document.createElement("div")
    patched.dataset["swPatched"] = "surface-1"
    document.body.appendChild(patched)
    // The shadow-scope selector's own signal is present, but the document's
    // real signals are not — must not read as covered.
    expect(scopeArtifactPresent(document, "COMMITTED")).toBe(false)
    patched.remove()

    document.documentElement.setAttribute(DARK_THEME_ATTR, "")
    const style = document.createElement("style")
    style.id = DARK_THEME_STYLE_ID
    style.textContent = "html,body{--sw-bg-0:#171c25;}"
    document.head.appendChild(style)

    expect(scopeArtifactPresent(document, "COMMITTED")).toBe(true)

    document.documentElement.removeAttribute(DARK_THEME_ATTR)
    style.remove()
  })

  it("EXONERATED_NATIVE, RETIRED, and DISCOVERED_UNHELD name no document artifact either", () => {
    expect(scopeArtifactPresent(document, "EXONERATED_NATIVE")).toBeNull()
    expect(scopeArtifactPresent(document, "RETIRED")).toBeNull()
    expect(scopeArtifactPresent(document, "DISCOVERED_UNHELD")).toBeNull()
  })
})

function findScopeInvariant(name: string): {
  check: (
    ctx: ScopeCoverageContext
  ) => InvariantOutcome | Promise<InvariantOutcome>
} {
  const invariant = scopeCoverageInvariants.find((inv) => inv.name === name)
  if (invariant === undefined) {
    throw new Error(`no invariant named ${name}`)
  }
  return invariant
}

const ScopeCoverageHeld = findScopeInvariant("ScopeCoverageHeld")

function checkScopes(
  scopes: ReadonlyArray<ScopeCoverageEntry>
): InvariantOutcome {
  const ctx: ScopeCoverageContext = { now: 0, scopes }
  const outcome = ScopeCoverageHeld.check(ctx)
  if (outcome instanceof Promise) {
    throw new Error("expected a synchronous outcome")
  }
  return outcome
}

describe("ScopeCoverageHeld — generalizes CoverageHeld to every live registered scope", () => {
  it("holds when there are no scopes at all", () => {
    expect(checkScopes([])).toEqual({ ok: true })
  })

  it("holds when every scope's own artifact is present", () => {
    expect(
      checkScopes([
        scopeEntry("HELD", true, { id: "s1" }),
        scopeEntry("COMMITTED", true, { id: "s2" }),
        scopeEntry("EXONERATED_NATIVE", null, { id: "s3" }),
        scopeEntry("RETIRED", null, { id: "s4" }),
      ])
    ).toEqual({ ok: true })
  })

  it("is violated when a HELD scope's occlusion veil is missing", () => {
    const outcome = checkScopes([scopeEntry("HELD", false, { id: "s1" })])
    expect(outcome.ok).toBe(false)
  })

  it("is violated when a COMMITTED scope has lost its data-sw-patched marker out from under the registry", () => {
    const outcome = checkScopes([scopeEntry("COMMITTED", false, { id: "s1" })])
    expect(outcome.ok).toBe(false)
  })

  it("names every failing scope's id and kind in the violation details, not just the first", () => {
    const outcome = checkScopes([
      scopeEntry("HELD", true, { id: "ok" }),
      scopeEntry("HELD", false, { id: "s1" }),
      scopeEntry("COMMITTED", false, { id: "s2" }),
    ])
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error("unreachable")
    expect(outcome.details).toEqual({
      scopeIds: ["s1", "s2"],
      kinds: ["HELD", "COMMITTED"],
    })
  })
})
