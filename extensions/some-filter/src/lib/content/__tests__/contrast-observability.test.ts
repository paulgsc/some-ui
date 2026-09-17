import {
  contrastInvariants,
  MAX_CONTRAST_SAMPLES,
  mergeContrastAudits,
  type ContrastAudit,
  type ContrastContext,
  type ContrastPairRecord,
} from "@filter/lib/content/contrast-observability"
import {
  coverageInvariants,
  type CoverageContext,
} from "@filter/lib/content/coverage-observability"
import {
  runInvariants,
  scoreHealth,
  type InvariantOutcome,
} from "@some-extension/common/observability"
import { describe, expect, it } from "vitest"

function findInvariant(name: string): {
  check: (ctx: ContrastContext) => InvariantOutcome | Promise<InvariantOutcome>
} {
  const invariant = contrastInvariants.find((inv) => inv.name === name)
  if (invariant === undefined) {
    throw new Error(`no invariant named ${name}`)
  }
  return invariant
}

// Every check() in contrastInvariants is synchronous — mirrors
// coverage-observability.test.ts's own check() helper and its own comment
// for why this cast is safe.
function check(
  invariant: ReturnType<typeof findInvariant>,
  ctx: ContrastContext
): InvariantOutcome {
  const outcome = invariant.check(ctx)
  if (outcome instanceof Promise) {
    throw new Error("expected a synchronous outcome")
  }
  return outcome
}

const ContrastHeld = findInvariant("ContrastHeld")

/** A context where nothing was audited — every field explicit so each test only overrides what it means to vary. */
function baseContext(
  overrides: Partial<ContrastContext> = {}
): ContrastContext {
  return {
    now: 0,
    auditedCount: 0,
    passingCount: 0,
    violatedCount: 0,
    underdeterminedCount: 0,
    recentViolations: [],
    ...overrides,
  }
}

describe("ContrastHeld", () => {
  it("declines to judge (unknown) when nothing was audited this round — no theme applied, nothing painted", () => {
    const ctx = baseContext({ auditedCount: 0 })
    expect(check(ContrastHeld, ctx)).toEqual({ ok: "unknown" })
  })

  it("holds when every audited pair passes", () => {
    const ctx = baseContext({
      auditedCount: 3,
      passingCount: 3,
      violatedCount: 0,
      underdeterminedCount: 0,
    })
    expect(check(ContrastHeld, ctx)).toEqual({ ok: true })
  })

  it("is violated when at least one audited pair violates the minimum contrast ratio", () => {
    const ctx = baseContext({
      auditedCount: 3,
      passingCount: 2,
      violatedCount: 1,
      underdeterminedCount: 0,
      recentViolations: [
        { key: "k", verdict: "violated", tagName: "SPAN", elementCount: 1 },
      ],
    })
    const outcome = check(ContrastHeld, ctx)
    expect(outcome.ok).toBe(false)
  })

  it("declines to judge (unknown), not violated, when every non-passing pair is only underdetermined", () => {
    const ctx = baseContext({
      auditedCount: 2,
      passingCount: 1,
      violatedCount: 0,
      underdeterminedCount: 1,
    })
    expect(check(ContrastHeld, ctx).ok).toBe("unknown")
  })

  it("is violated even alongside underdetermined pairs — a known violation is never downgraded to unknown by an unrelated ambiguous pair", () => {
    const ctx = baseContext({
      auditedCount: 3,
      passingCount: 1,
      violatedCount: 1,
      underdeterminedCount: 1,
    })
    expect(check(ContrastHeld, ctx).ok).toBe(false)
  })
})

describe("coverageHealth and contrastHealth report independently — SF-RC5 (#1344)'s own acceptance criterion", () => {
  it("a session can show coverage=ok and contrast=violated simultaneously, from the same round", async () => {
    // A themed, fully-covered document (CoverageHeld holds) whose own
    // palette nonetheless renders one carrier illegible (ContrastHeld does
    // not) — exactly the case coverageHealth's own scalar cannot represent,
    // per this module's header.
    const coverageCtx: CoverageContext = {
      now: 0,
      tabState: "auto",
      transitioning: false,
      veilPresent: false,
      dirtyClassPresent: false,
      darkThemeActive: true,
      darkStyleActive: true,
      legacyAttrPresent: false,
      legacyStyleActive: false,
      veilBackgroundColor: null,
    }
    const contrastCtx: ContrastContext = {
      now: 0,
      auditedCount: 1,
      passingCount: 0,
      violatedCount: 1,
      underdeterminedCount: 0,
      recentViolations: [
        { key: "k", verdict: "violated", tagName: "P", elementCount: 4 },
      ],
    }

    const coverageResults = await runInvariants(
      coverageInvariants,
      coverageCtx,
      0
    )
    const contrastResults = await runInvariants(
      contrastInvariants,
      contrastCtx,
      0
    )

    const coverageHealth = scoreHealth(coverageResults, 0)
    const contrastHealth = scoreHealth(contrastResults, 0)

    expect(coverageHealth.status).toBe("healthy")
    expect(contrastHealth.status).toBe("unhealthy")

    // Neither computation reads the other's context or results at all —
    // reported independently, never folded into one scalar.
    expect(coverageResults.some((r) => r.name === "ContrastHeld")).toBe(false)
    expect(contrastResults.some((r) => r.name === "CoverageHeld")).toBe(false)
  })
})

describe("mergeContrastAudits — SF-RC5 (#1344)", () => {
  const passing = (key: string): ContrastPairRecord => ({
    key,
    verdict: "passing",
    tagName: "DIV",
    elementCount: 1,
  })
  const violatedRecord = (
    key: string,
    tagName = "SPAN",
    elementCount = 1
  ): ContrastPairRecord => ({ key, verdict: "violated", tagName, elementCount })

  it("unions distinct pairs across sources — the document alone cannot see a shadow-only violation, since auditLegibility's TreeWalker does not cross a shadow boundary", () => {
    const documentAudit: ContrastAudit = [passing("a"), passing("b")]
    const shadowAudit: ContrastAudit = [violatedRecord("c")]

    const merged = mergeContrastAudits([documentAudit, shadowAudit], 42)

    expect(merged).toEqual({
      now: 42,
      auditedCount: 3,
      passingCount: 2,
      violatedCount: 1,
      underdeterminedCount: 0,
      recentViolations: [
        { key: "c", verdict: "violated", tagName: "SPAN", elementCount: 1 },
      ],
    })
  })

  it("dedupes an identical (foreground, backdrop) pair audited in more than one source, bot-found (Codex review round 2 on #1443): counting each source's own record separately reported the same pair as violated once per scope it happened to appear in, contradicting this module's own counted-by-pair (not by scope) design", () => {
    // The same key — one real color-pair violation — reported by the
    // document *and* two separate shadow scopes, exactly the case a global
    // swatch/theme makes common: many scopes render the identical pair.
    const documentAudit: ContrastAudit = [violatedRecord("shared-key")]
    const shadowAuditA: ContrastAudit = [violatedRecord("shared-key")]
    const shadowAuditB: ContrastAudit = [violatedRecord("shared-key")]

    const merged = mergeContrastAudits(
      [documentAudit, shadowAuditA, shadowAuditB],
      0
    )

    expect(merged.auditedCount).toBe(1)
    expect(merged.violatedCount).toBe(1)
    expect(merged.recentViolations).toHaveLength(1)
  })

  it("caps recentViolations at MAX_CONTRAST_SAMPLES after deduplication, while violatedCount stays accurate over every distinct violated pair", () => {
    const total = MAX_CONTRAST_SAMPLES + 5
    const audit: Array<ContrastPairRecord> = Array.from(
      { length: total },
      (_, i) => violatedRecord(`k${i}`)
    )

    const merged = mergeContrastAudits([audit], 0)

    expect(merged.violatedCount).toBe(total)
    expect(merged.recentViolations).toHaveLength(MAX_CONTRAST_SAMPLES)
  })

  it("an empty list of audits merges to an all-zero context", () => {
    expect(mergeContrastAudits([], 7)).toEqual({
      now: 7,
      auditedCount: 0,
      passingCount: 0,
      violatedCount: 0,
      underdeterminedCount: 0,
      recentViolations: [],
    })
  })
})
