import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { z } from "zod"

import type { DiffHunk } from "./exercise"
import { DiffHunkSchema } from "./exercise"

/**
 * The diff set (LTY-ROUND R4): canon Def. 1.4, Def. 1.6, Ax. 6.1, Cor. 5.1.
 * The `D` and `μ` slice of Def. 1.7's round tuple `(A, C, B, D, μ, r)`; `A`
 * is `types/algorithm.ts`, `C`/`B` `types/constraint.ts`. `hunk` reuses
 * `DiffHunkSchema` unchanged.
 */

function isKnownPropositionId(value: unknown): value is PropositionId {
  // `Object.hasOwn`, not `in`: `in` would accept "constructor", "__proto__"…
  return typeof value === "string" && Object.hasOwn(PROPOSITION_REGISTER, value)
}

/**
 * μ's id type (Def. 1.6), validated against the register rather than trusted
 * as a string. Only "a real register key": retired vs. active is checked by
 * `checkCitations` (via `scripts/check-proposition-citations.ts`).
 */
export const PropositionIdSchema = z.custom<PropositionId>(
  isKnownPropositionId,
  {
    message:
      "propositionId must resolve against the CW-P register (Def. 1.5, B1/#1218) — μ (Def. 1.6) is authored, so an id that does not resolve is a validation failure, not a lint finding.",
  }
)

/**
 * One member of `D`: a `DiffHunk`, the proposition it witnesses (μ), and the
 * authored claim that it restores admissibility. Both are hand-typed, never
 * derived from `hunk`: Ax. 6.1 forbids inferring μ, and `isAdmissible` only
 * checks an authored claim (Prop. 2.1).
 *
 * Cor. 5.1: a non-admissible member is a well-formed rewrite, and
 * `distractorStatement` says what it does instead (evidence it is no
 * strawman). Required exactly when `admissible` is `false`.
 *
 * `propositionGloss` is the round-specific half of a verdict: why *this*
 * diff instantiates the register's general `statement`. Optional; a missing
 * gloss stays visible rather than being generated.
 */
export const DiffSetMemberSchema = z
  .object({
    hunk: DiffHunkSchema,
    propositionId: PropositionIdSchema,
    admissible: z.boolean(),
    distractorStatement: z.string().min(1).optional(),
    propositionGloss: z.string().min(1).optional(),
  })
  .refine(
    (member) => member.admissible || member.distractorStatement !== undefined,
    {
      message:
        "Cor. 5.1: a non-admissible diff-set member must carry an authored one-line statement of what its rewrite does instead — a distractor with no coherent rewrite is a strawman and an authoring defect.",
      path: ["distractorStatement"],
    }
  )
export type DiffSetMember = z.infer<typeof DiffSetMemberSchema>

/**
 * A structural key for a hunk, independent of authored key order (unlike
 * `JSON.stringify`). Used only to detect a hunk repeated within `D`.
 */
function hunkKeyOf(hunk: DiffHunk): string {
  return [
    hunk.path,
    hunk.oldStart,
    hunk.newStart,
    ...hunk.segments.map((segment) => `${segment.kind}:${segment.text}`),
  ].join(" ")
}

/**
 * `D` (Def. 1.4): an ordered set of diff-set members against one `A`, all
 * rejected at parse time when malformed:
 *
 * - `|D| ≥ 2`: one admissible member needs a distractor to compare against.
 * - exactly one member authored admissible (Def. 3.1/Prop. 2.1): zero means
 *   nothing restores the budget, two leaves the intended repair ambiguous.
 * - no hunk twice: `D` is a set, and a repeated hunk under two μ claims is
 *   ambiguous and shows two identical choices.
 *
 * Whether the `admissible` claim agrees with `isAdmissible` needs each
 * member's patched cost graph; `round-assembly` checks that for authored
 * rounds (`checkAdmissibleClaimsAgreeWithDerivation`).
 */
export const DiffSetSchema = z
  .array(DiffSetMemberSchema)
  .min(
    2,
    "Def. 1.4: a diff set needs at least one admissible member and at least one distractor to compare it against."
  )
  .refine(
    (members) => members.filter((member) => member.admissible).length === 1,
    {
      message:
        "Def. 3.1/Prop. 2.1: exactly one member of D is authored as admissible — a round with zero or two authored-admissible members cannot be posed.",
    }
  )
  .refine(
    (members) => {
      const keys = members.map((member) => hunkKeyOf(member.hunk))
      return new Set(keys).size === keys.length
    },
    {
      message:
        "Def. 1.4: D is a set of diffs — two members carrying the same hunk is not two alternatives, it is one hunk with an ambiguous μ.",
    }
  )
export type DiffSet = z.infer<typeof DiffSetSchema>
