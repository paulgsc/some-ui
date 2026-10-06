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

type SyncCheck<C> = {
  check: (ctx: C) => InvariantOutcome | Promise<InvariantOutcome>
}

function findInvariant<C>(
  invariants: ReadonlyArray<{ name: string } & SyncCheck<C>>,
  name: string
): SyncCheck<C> {
  const invariant = invariants.find((inv) => inv.name === name)
  if (invariant === undefined) {
    throw new Error(`no invariant named ${name}`)
  }
  return invariant
}

// Every check() is synchronous (runInvariants() is what makes the call site
// async), so tests assert synchronously.
function check<C>(invariant: SyncCheck<C>, ctx: C): InvariantOutcome {
  const outcome = invariant.check(ctx)
  if (outcome instanceof Promise) {
    throw new Error("expected a synchronous outcome")
  }
  return outcome
}

const CoverageHeld = findInvariant(coverageInvariants, "CoverageHeld")
const LegacySignalsAgree = findInvariant(
  coverageInvariants,
  "LegacySignalsAgree"
)
const DarkSignalsAgree = findInvariant(coverageInvariants, "DarkSignalsAgree")
const VeilColorMatchesLegacyState = findInvariant(
  coverageInvariants,
  "VeilColorMatchesLegacyState"
)

/** A context where nothing is covering the page and nothing is declared active — every field explicit so each test only overrides what it means to vary. */
function baseContext(
  overrides: Partial<CoverageContext> = {}
): CoverageContext {
  return {
    now: 0,
    tabState: "auto",
    transitioning: false,
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

const OK = { ok: true } as const
const UNKNOWN = { ok: "unknown" } as const

type Case = [
  title: string,
  overrides: Partial<CoverageContext>,
  expected: typeof OK | typeof UNKNOWN | "violated",
]

/** `"violated"` asserts `ok === false`; anything else is an exact outcome. */
function expectOutcome(
  invariant: SyncCheck<CoverageContext>,
  overrides: Partial<CoverageContext>,
  expected: Case[2]
): void {
  const outcome = check(invariant, baseContext(overrides))
  if (expected === "violated") expect(outcome.ok).toBe(false)
  else expect(outcome).toEqual(expected)
}

describe("CoverageHeld — Remark C.1's zero-leak invariant", () => {
  it.each<Case>([
    [
      "holds unconditionally when the tab is off, regardless of coverage state",
      { tabState: "off" },
      OK,
    ],
    [
      "holds when the dark theme is active",
      { tabState: "auto", darkThemeActive: true, darkStyleActive: true },
      OK,
    ],
    [
      "is violated when data-sw-dark is declared but the theme stylesheet is not actually there",
      { tabState: "auto", darkThemeActive: true, darkStyleActive: false },
      "violated",
    ],
    [
      "holds when the veil element is present",
      { tabState: "auto", veilPresent: true },
      OK,
    ],
    [
      "holds when only the sw-dirty CSS backstop is up (veil element itself gone)",
      { tabState: "auto", dirtyClassPresent: true },
      OK,
    ],
    [
      "holds when legacy is genuinely active (attribute and style agree)",
      { tabState: "legacy", legacyAttrPresent: true, legacyStyleActive: true },
      OK,
    ],
    [
      "is violated when legacy declares itself active but the filter rule is not actually there — the reported live-flash scenario",
      { tabState: "legacy", legacyAttrPresent: true, legacyStyleActive: false },
      "violated",
    ],
    [
      "is violated in auto mode when nothing at all is covering the page",
      { tabState: "auto" },
      "violated",
    ],
    [
      "is violated in legacy mode when nothing at all is covering the page",
      { tabState: "legacy" },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(CoverageHeld, overrides, expected)
  })
})

describe("CoverageHeld — transitioning window", () => {
  it.each<Case>([
    [
      "declines to judge (unknown), not violated, when nothing covers the page but a transition is in flight",
      { tabState: "auto", transitioning: true },
      UNKNOWN,
    ],
    [
      "declines to judge even when the context happens to look covered — transitioning means the DOM cannot be trusted either way, not just when it looks bad",
      {
        tabState: "legacy",
        transitioning: true,
        legacyAttrPresent: true,
        legacyStyleActive: true,
      },
      UNKNOWN,
    ],
    [
      "still holds unconditionally when off, regardless of the transitioning flag",
      { tabState: "off", transitioning: true },
      OK,
    ],
    [
      "evaluates for real (violated, not unknown) once the transition flag is back to false",
      { tabState: "auto", transitioning: false },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(CoverageHeld, overrides, expected)
  })
})

describe("CoverageHeld — the enforcement sheet", () => {
  it.each<Case>([
    [
      "holds when the sheet reads as present in the cascade and nothing else covers the page",
      { enforcedCanvas: true },
      OK,
    ],
    [
      "is violated when the sheet is absent and nothing else covers the page",
      { enforcedCanvas: false },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(CoverageHeld, overrides, expected)
  })
})

describe("LegacySignalsAgree", () => {
  it.each<Case>([
    [
      "holds when both the attribute and the style rule are present",
      { legacyAttrPresent: true, legacyStyleActive: true },
      OK,
    ],
    [
      "holds when neither is present",
      { legacyAttrPresent: false, legacyStyleActive: false },
      OK,
    ],
    [
      "is violated when the attribute is declared but the style rule is missing",
      { legacyAttrPresent: true, legacyStyleActive: false },
      "violated",
    ],
    [
      "is violated when the style rule is present but the attribute is missing",
      { legacyAttrPresent: false, legacyStyleActive: true },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(LegacySignalsAgree, overrides, expected)
  })
})

describe("DarkSignalsAgree", () => {
  it.each<Case>([
    [
      "holds when both the attribute and the stylesheet are present",
      { darkThemeActive: true, darkStyleActive: true },
      OK,
    ],
    [
      "holds when neither is present",
      { darkThemeActive: false, darkStyleActive: false },
      OK,
    ],
    [
      "is violated when the attribute is declared but the stylesheet is missing — a <head> replacement carried it off",
      { darkThemeActive: true, darkStyleActive: false },
      "violated",
    ],
    [
      "is violated when the stylesheet is present but the attribute is missing",
      { darkThemeActive: false, darkStyleActive: true },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(DarkSignalsAgree, overrides, expected)
  })
})

describe("VeilColorMatchesLegacyState", () => {
  const DARK_VEIL = "rgb(23, 28, 37)" // #171c25, VEIL_BG in prepaint.ts
  const WHITE_VEIL = "rgb(255, 255, 255)"
  const legacyActive = { legacyAttrPresent: true, legacyStyleActive: true }
  const legacyInactive = { legacyAttrPresent: false, legacyStyleActive: false }

  it.each<Case>([
    [
      "is unknown when no veil is present to read a color from",
      { veilPresent: false },
      UNKNOWN,
    ],
    [
      "is unknown when the veil's background color does not parse",
      { veilPresent: true, veilBackgroundColor: "not-a-color" },
      UNKNOWN,
    ],
    [
      "holds when legacy is inactive and the veil is declared dark",
      { veilPresent: true, ...legacyInactive, veilBackgroundColor: DARK_VEIL },
      OK,
    ],
    [
      "holds when legacy is genuinely active and the veil is declared white",
      { veilPresent: true, ...legacyActive, veilBackgroundColor: WHITE_VEIL },
      OK,
    ],
    [
      "is violated when legacy declares itself active but the veil is still dark — composites to white uninverted, a literal flash",
      { veilPresent: true, ...legacyActive, veilBackgroundColor: DARK_VEIL },
      "violated",
    ],
    [
      "is violated when legacy is inactive but the veil is still declared white — reads as a literal white flash with no filter to invert it back",
      { veilPresent: true, ...legacyInactive, veilBackgroundColor: WHITE_VEIL },
      "violated",
    ],
  ])("%s", (_title, overrides, expected) => {
    expectOutcome(VeilColorMatchesLegacyState, overrides, expected)
  })
})

// ── Per-scope coverage ──────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = ""
})

const HELD_KINDS = ["HELD", "RESOLVING", "FAILED_HELD"] as const
const ARTIFACTLESS_KINDS = [
  "EXONERATED_NATIVE",
  "RETIRED",
  "DISCOVERED_UNHELD",
] as const

function scopeEntry(
  kind: ScopeStateKind,
  artifactPresent: boolean | null,
  overrides: Partial<ScopeCoverageEntry> = {}
): ScopeCoverageEntry {
  return { id: "s1", kind, parent: null, artifactPresent, ...overrides }
}

function newShadow(): ShadowRoot {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host.attachShadow({ mode: "open" })
}

function sheetWith(rule: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet()
  sheet.insertRule(rule)
  return sheet
}

describe("scopeArtifactPresent — re-reads the live DOM, never trusts κ alone", () => {
  it("HELD/RESOLVING/FAILED_HELD: true only when the occlusion hold's veil is actually present", () => {
    const shadow = newShadow()

    for (const kind of HELD_KINDS) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(false)
    }

    createOcclusionHold(shadow).install()

    for (const kind of HELD_KINDS) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(true)
    }
  })

  it("HELD/RESOLVING/FAILED_HELD: still true once HOLD_ATTR/data-my-ext are stripped from the veil — the hold's self-healer deliberately never restores HOLD_ATTR, so selecting on it would report a permanent false violation", () => {
    const shadow = newShadow()
    createOcclusionHold(shadow).install()

    const veil = shadow.querySelector("hr")
    if (veil === null) throw new Error("expected the hold's veil to exist")
    veil.removeAttribute(HOLD_ATTR)
    veil.removeAttribute("data-my-ext")

    for (const kind of HELD_KINDS) {
      expect(scopeArtifactPresent(shadow, kind)).toBe(true)
    }
  })

  it("COMMITTED: true when the scope's own host-token rule is adopted, even with zero data-sw-patched elements — a canvas-only shadow scope commits exactly as legitimately as a tagged one", () => {
    const shadow = newShadow()

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)

    // realizeShadowColors() adopts the :host rule on every commit; this scope
    // has no data-sw-patched element (decide()'s no-evidenced-surfaces case).
    shadow.adoptedStyleSheets = [sheetWith(":host { --sw-bg-0: #171c25; }")]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(true)
    expect(shadow.querySelector("[data-sw-patched]")).toBeNull()
  })

  it("COMMITTED: false when adoptedStyleSheets carries only a foreign (vendor) sheet, not this scope's own host-token rule", () => {
    const shadow = newShadow()
    shadow.adoptedStyleSheets = [sheetWith("div { color: blue; }")]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)
  })

  it("COMMITTED: false when only the shared static sheet is adopted (its own scrollbar rule references var(--sw-bg-0)) but the scope's own :host token rule is gone — a bare substring match would also match that var() reference", () => {
    const shadow = newShadow()
    // DARK_THEME_BODY_RULES' scrollbar rule, adopted into every committed
    // scope's shared static sheet.
    shadow.adoptedStyleSheets = [
      sheetWith("*{ scrollbar-color: var(--sw-bg-3) var(--sw-bg-0); }"),
    ]

    expect(scopeArtifactPresent(shadow, "COMMITTED")).toBe(false)
  })

  it("EXONERATED_NATIVE, RETIRED, and DISCOVERED_UNHELD name no artifact of their own to check", () => {
    const shadow = newShadow()
    for (const kind of ARTIFACTLESS_KINDS) {
      expect(scopeArtifactPresent(shadow, kind)).toBeNull()
    }
  })
})

describe("scopeArtifactPresent — the document scope (r_0) uses its own coverage artifacts, not the shadow-scope selectors", () => {
  it("HELD/RESOLVING/FAILED_HELD: true when the prepaint veil is present, even with no HOLD_ATTR element anywhere — r_0's own custody primitive is createPrepaintCustody(), never createOcclusionHold()", () => {
    expect(scopeArtifactPresent(document, "HELD")).toBe(false)
    const veil = document.createElement("div")
    veil.id = PREPAINT_VEIL_ID
    document.body.appendChild(veil)
    for (const kind of HELD_KINDS) {
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
    // The shadow-scope signal is present, the document's real ones are not.
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
    for (const kind of ARTIFACTLESS_KINDS) {
      expect(scopeArtifactPresent(document, kind)).toBeNull()
    }
  })
})

const ScopeCoverageHeld = findInvariant(
  scopeCoverageInvariants,
  "ScopeCoverageHeld"
)

function checkScopes(
  scopes: ReadonlyArray<ScopeCoverageEntry>
): InvariantOutcome {
  const ctx: ScopeCoverageContext = { now: 0, scopes }
  return check(ScopeCoverageHeld, ctx)
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

  it.each([
    ["a HELD scope's occlusion veil is missing", "HELD"],
    [
      "a COMMITTED scope has lost its data-sw-patched marker out from under the registry",
      "COMMITTED",
    ],
  ] as const)("is violated when %s", (_title, kind) => {
    expect(checkScopes([scopeEntry(kind, false, { id: "s1" })]).ok).toBe(false)
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
