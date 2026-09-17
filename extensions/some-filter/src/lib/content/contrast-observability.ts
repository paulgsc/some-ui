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

export type ContrastContext = {
  readonly now: number
  /** Distinct (foreground, backdrop) pairs actually audited this round — 0 whenever no theme is applied (nothing painted, nothing to audit). */
  readonly auditedCount: number
  readonly passingCount: number
  readonly violatedCount: number
  readonly underdeterminedCount: number
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

/** A context representing nothing audited yet — the same shape `summarizeContrast` produces for an empty scan. */
export function emptyContrastContext(now: number): ContrastContext {
  return {
    now,
    auditedCount: 0,
    passingCount: 0,
    violatedCount: 0,
    underdeterminedCount: 0,
    recentViolations: [],
  }
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
 * Pure sum over every source's counts, plus every source's `recentViolations`
 * concatenated and re-capped at `MAX_CONTRAST_SAMPLES` — `content.ts` calls
 * this every time *any* source (the document, or one shadow scope) reports a
 * fresh audit, so the persisted `"contrast"` snapshot always reflects every
 * source's last-known result, not just whichever audited most recently.
 */
export function mergeContrastContexts(
  contexts: ReadonlyArray<ContrastContext>,
  now: number
): ContrastContext {
  let auditedCount = 0
  let passingCount = 0
  let violatedCount = 0
  let underdeterminedCount = 0
  const recentViolations: Array<ContrastViolationSample> = []

  for (const ctx of contexts) {
    auditedCount += ctx.auditedCount
    passingCount += ctx.passingCount
    violatedCount += ctx.violatedCount
    underdeterminedCount += ctx.underdeterminedCount
    recentViolations.push(...ctx.recentViolations)
  }

  return {
    now,
    auditedCount,
    passingCount,
    violatedCount,
    underdeterminedCount,
    recentViolations: recentViolations.slice(0, MAX_CONTRAST_SAMPLES),
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
      // known violation, but not a clean bill of health either.
      if (ctx.underdeterminedCount > 0) {
        return {
          ok: "unknown",
          details: {
            underdeterminedCount: ctx.underdeterminedCount,
            auditedCount: ctx.auditedCount,
          },
        }
      }
      return { ok: true }
    },
  },
]
