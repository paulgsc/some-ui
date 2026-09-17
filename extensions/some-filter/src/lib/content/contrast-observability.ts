/**
 * SF-RC5 (#1344): the contrast/legibility counterpart to
 * `coverage-observability.ts`'s `CoverageHeld` — a second, independent
 * diagnostic axis over the same recorder.
 *
 * `coverageHealth` answers "is *something* covering the page" (a veil, a
 * dark theme, a genuinely-active legacy filter); Remark C.1's invariant is
 * structurally incapable of telling "all text legible" from "all text
 * black-on-dark", since a theme stylesheet merely being *present* satisfies
 * it either way — a `94/degraded` coverage score cannot discriminate those
 * two cases (issue #1344's own body). `contrastHealth` answers the question
 * `CoverageHeld` cannot: of the `(foreground, backdrop)` pairs SF-RC1's
 * legibility channel (`legibility-audit.ts`) actually audited this round,
 * how many composite below `MIN_CONTRAST_RATIO`.
 *
 * Reported independently, never folded into `coverageHealth`'s own score —
 * a session can show `coverage=ok` and `contrast=violated` at once (a
 * themed page whose own dark palette renders some text illegible is exactly
 * that case, and neither axis can stand in for the other).
 *
 * Counted by *pair* (`LegibilityKey`, legibility-audit.ts's own
 * `(foreground, backdrop)` bucket), not by element — a text-heavy page with
 * one bad rule reports one violated pair, not thousands of individually
 * tagged elements, mirroring how that module already groups its own work.
 */

import type {
  ContrastVerdict,
  LegibilityKey,
} from "@filter/adapter/legibility-audit"
import type {
  Invariant,
  InvariantOutcome,
  JsonValue,
} from "@some-extension/common/observability"

/**
 * Hard cap on how many violated/underdetermined pairs `recentViolations`
 * itemizes, independent of the recorder's own detail-size budget — mirrors
 * `coverage-watchdog.ts`'s own `MAX_SNAPSHOT_SCOPE_ENTRIES` discipline: the
 * aggregate counts below stay accurate over every audited pair regardless of
 * this cap, only the itemized sample is bounded.
 */
export const MAX_CONTRAST_SAMPLES = 10

/**
 * One violated/underdetermined pair. Structural/color metadata only — the
 * same kind `CoverageContext.veilBackgroundColor` already records — never
 * text content, never a URL, never any other page payload. `tagName` and
 * `elementCount` describe the *shape* of the carrier, not its content.
 */
export type ContrastViolationSample = {
  readonly key: LegibilityKey
  readonly verdict: ContrastVerdict
  readonly tagName: string
  readonly elementCount: number
}

/** A single audited pair's own verdict — "passing" alongside the two `ContrastVerdict` values, since a per-source audit (unlike `ContrastContext`'s own capped `recentViolations`) has to carry every audited pair, not just the failing ones, for `mergeContrastAudits` to compute a correct `auditedCount`/`passingCount` after deduplication. */
export type ContrastPairVerdict = ContrastVerdict | "passing"

/** One `(foreground, backdrop)` pair as one source (the document, or one shadow scope) audited it this round — the same structural/color metadata `ContrastViolationSample` carries, never text or URL content. */
export type ContrastPairRecord = {
  readonly key: LegibilityKey
  readonly verdict: ContrastPairVerdict
  readonly tagName: string
  readonly elementCount: number
}

/**
 * One source's full, uncapped audit — every `(foreground, backdrop)` pair it
 * scanned this round, not just the failing ones. Never persisted directly
 * (it can be arbitrarily large on a page with many distinct pairs); it
 * exists only as `mergeContrastAudits`' own input, to dedupe by key across
 * sources before deriving the capped, persisted `ContrastContext`.
 */
export type ContrastAudit = ReadonlyArray<ContrastPairRecord>

/**
 * One source's report for this round: either its `ContrastAudit` (possibly
 * `[]` — a theme genuinely applies no colors this source needs to audit,
 * e.g. `fire()`'s own no-theme branch), or `null` — that source's own audit
 * did not complete this round (a caught throw mid-scan/mid-repair) and its
 * state for this round is unknown, not "nothing to report."
 *
 * Bot-found (Codex confirming review round 3 on #1443): every failure-path
 * fix before this one (rounds 5-6) reported a failed re-audit as `[]`, the
 * same shape a *successful*, genuinely-empty round already used — so a
 * document audit that failed to run at all was indistinguishable from one
 * that ran and found nothing, and a passing-only audit from an unaffected
 * *other* source could then merge with it into `auditedCount > 0,
 * violatedCount: 0`, reporting the page confidently healthy despite an
 * entire source never having audited anything this round. `null` carries
 * that distinction through to `mergeContrastAudits`, which folds it into
 * `failedSourceCount` rather than silently treating it as zero pairs.
 */
export type ContrastSourceReport = ContrastAudit | null

export type ContrastContext = {
  readonly now: number
  /** Distinct (foreground, backdrop) pairs actually audited this round — 0 whenever no theme is applied (nothing painted, nothing to audit). */
  readonly auditedCount: number
  readonly passingCount: number
  readonly violatedCount: number
  readonly underdeterminedCount: number
  /**
   * How many sources (the document, or one shadow scope) reported `null` —
   * an audit that failed to complete this round — rather than a genuine
   * (possibly empty) `ContrastAudit`. `ContrastHeld` treats this the same
   * as an underdetermined pair: not a known violation, but never silently
   * rounded up to a clean bill of health either — see `ContrastSourceReport`'s
   * own doc comment for the bug this closes.
   */
  readonly failedSourceCount: number
  /**
   * Capped at `MAX_CONTRAST_SAMPLES` — see that constant's own doc comment.
   * A plain (not `ReadonlyArray`) array, deliberately: this whole context
   * is persisted verbatim via `Recorder.setSnapshot`'s `JsonValue` — which,
   * like every other array-bearing snapshot in this package (see
   * `ScopeCoverageSnapshot.scopes` in coverage-watchdog.ts), needs a
   * genuinely mutable array type to satisfy, even though nothing here ever
   * mutates it after construction.
   */
  readonly recentViolations: Array<ContrastViolationSample>
}

/**
 * SF-RC5 (#1344), bot-found (Codex review round 1 on #1443): the document
 * (`pipeline.ts`'s `runContrastChannel`) and every shadow scope
 * (`shadow-scope-theming.ts`'s `projectContrast`) each audit their own root
 * independently — `auditLegibility`'s `TreeWalker` does not cross a shadow
 * boundary, the same reason SF-RC3/RC4 needed a second contrast pass for
 * shadow scopes in the first place. Without this, a page whose only failing
 * pair lives inside an open shadow root reports `violatedCount: 0` from the
 * document alone, and `ContrastHeld` falsely certifies the page healthy.
 *
 * Dedupes by `LegibilityKey` across every source before counting — bot-found
 * (Codex review round 2 on #1443): an earlier version summed each source's
 * own *counts* directly, so the identical `(foreground, backdrop)` pair
 * showing up in the document and two shadow scopes reported three violated
 * pairs, contradicting this module's own "counted by pair, not by scope"
 * design (this file's own header). A `LegibilityKey` already fully encodes
 * both colors (`legibility-audit.ts`'s own `legibilityKeyFor`), so
 * `violatesContrast`'s verdict for a given key is the same wherever it is
 * audited — there is never a genuine conflict to resolve between sources for
 * the same key, only redundant confirmation of the same pair.
 *
 * `content.ts` calls this every time *any* source (the document, or one
 * shadow scope) reports a fresh audit, so the persisted `"contrast"`
 * snapshot always reflects every source's last-known result, not just
 * whichever audited most recently.
 */
export function mergeContrastAudits(
  audits: ReadonlyArray<ContrastSourceReport>,
  now: number
): ContrastContext {
  const byKey = new Map<LegibilityKey, ContrastPairRecord>()
  let failedSourceCount = 0
  for (const audit of audits) {
    if (audit === null) {
      failedSourceCount++
      continue
    }
    for (const record of audit) {
      byKey.set(record.key, record)
    }
  }

  let passingCount = 0
  let violatedCount = 0
  let underdeterminedCount = 0
  const recentViolations: Array<ContrastViolationSample> = []

  for (const record of byKey.values()) {
    if (record.verdict === "passing") {
      passingCount++
      continue
    }
    if (record.verdict === "violated") violatedCount++
    else underdeterminedCount++
    if (recentViolations.length < MAX_CONTRAST_SAMPLES) {
      recentViolations.push({
        key: record.key,
        verdict: record.verdict,
        tagName: record.tagName,
        elementCount: record.elementCount,
      })
    }
  }

  return {
    now,
    auditedCount: byKey.size,
    passingCount,
    violatedCount,
    underdeterminedCount,
    failedSourceCount,
    recentViolations,
  }
}

const violated = (details: JsonValue): InvariantOutcome => ({
  ok: false,
  details,
})

export const contrastInvariants: ReadonlyArray<Invariant<ContrastContext>> = [
  {
    name: "ContrastHeld",
    description:
      "Every (foreground, backdrop) pair this round's legibility channel actually audited composites at or above the minimum contrast ratio. Independent of CoverageHeld: a theme merely being present says nothing about whether its own palette renders text illegible.",
    check: (ctx): InvariantOutcome => {
      // Nothing was audited this round (no theme applied) — not evidence of
      // either a pass or a failure, the same "nothing to check yet" shape
      // VeilColorMatchesLegacyState already uses in coverage-observability.ts.
      if (ctx.auditedCount === 0) return { ok: "unknown" }
      if (ctx.violatedCount > 0) {
        return violated({
          violatedCount: ctx.violatedCount,
          auditedCount: ctx.auditedCount,
          samples: ctx.recentViolations,
        })
      }
      // An underdetermined pair could not be classified either way — not a
      // known violation, but not a clean bill of health either. A failed
      // source (bot-found, Codex confirming review round 3 on #1443) is the
      // same shape: some other, unaffected source may still have reported
      // real (even all-passing) pairs, but this source's own state this
      // round is genuinely unknown, not confidently clean — see
      // ContrastSourceReport's own doc comment.
      if (ctx.underdeterminedCount > 0 || ctx.failedSourceCount > 0) {
        return {
          ok: "unknown",
          details: {
            underdeterminedCount: ctx.underdeterminedCount,
            failedSourceCount: ctx.failedSourceCount,
            auditedCount: ctx.auditedCount,
          },
        }
      }
      return { ok: true }
    },
  },
]
