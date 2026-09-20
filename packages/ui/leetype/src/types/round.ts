import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { z } from "zod"

import type { DiffHunk } from "./exercise"
import { DiffHunkSchema } from "./exercise"

/**
 * R4 (LTY-ROUND, #1207) — `docs/canon/complexity-witness-canon.typ` Def.
 * 1.4, Def. 1.6, Ax. 6.1, Cor. 5.1.
 *
 * This module is the diff-set slice of Def. 1.7's full round tuple
 * `(A, C, B, D, μ, r)` — `D` and `μ` only. `A` (`types/algorithm.ts`) and
 * `C`/`B` (`types/constraint.ts`) already exist as separate schemas per
 * this workspace's file-per-Def convention; assembling all six into one
 * `Round` type is not this story's job (see its own "Out of scope" list).
 *
 * `DiffHunkSchema` itself needs no new field: Def. 1.4 is "the reuse claim,
 * which is most of the story" — `hunk` below is the existing schema,
 * unchanged, verbatim.
 */

function isKnownPropositionId(value: unknown): value is PropositionId {
  // `in` walks the prototype chain, so an inherited `Object.prototype` name
  // ("constructor", "toString", "__proto__", ...) would resolve here even
  // though it is not a real register key (review finding, #1261,
  // chatgpt-codex-connector) — `Object.hasOwn` checks the register's own
  // keys only.
  return typeof value === "string" && Object.hasOwn(PROPOSITION_REGISTER, value)
}

/**
 * μ's own id type (Def. 1.6), validated against the B1 register
 * (`#1200`/`#1218`) rather than trusted as a bare string. Resolving here
 * means "a real register key" — retired vs. active is a citation concern,
 * already checked everywhere a `CW-P` literal appears (including this
 * field's own authored value) by `checkCitations`
 * (`lib/leetype/proposition-register/citation-check.ts`), wired live via
 * `scripts/check-proposition-citations.ts`'s repo-wide `git grep` scan —
 * duplicating that distinction here would just be a second, divergent
 * place to get it wrong.
 */
const PropositionIdSchema = z.custom<PropositionId>(isKnownPropositionId, {
  message:
    "propositionId must resolve against the CW-P register (Def. 1.5, B1/#1218) — μ (Def. 1.6) is authored, so an id that does not resolve is a validation failure, not a lint finding.",
})

/**
 * One member of `D`: an existing `DiffHunk`, the one proposition it
 * witnesses (μ), and the round's authored claim about whether this member
 * restores admissibility. `propositionId` and `admissible` are always
 * hand-typed alongside `hunk` — nothing in this module, or anywhere else
 * in the workspace, derives either one from `hunk`'s own content. Ax. 6.1
 * forbids that outright for μ, the same rule `docs/leetype/README.md`
 * already states for an inferred sink; the admissibility *claim* is
 * likewise always authored, since `isAdmissible` (`lib/leetype/
 * admissibility`, #1211) is only ever a check run *against* an authored
 * claim (Prop. 2.1), never a source one is generated from.
 *
 * Corollary 5.1: a member marked not admissible is a well-formed rewrite,
 * not junk — `distractorStatement` is the one-line authored account of
 * what it does instead, and a reviewer's evidence that it isn't a
 * strawman. Required exactly when `admissible` is `false`; an admissible
 * member has nothing to distinguish itself from, so the field is absent
 * there rather than a redundant empty string.
 *
 * `propositionGloss` (B3, #1220) is the *round-specific* half of a verdict's
 * justification — why *this* diff instantiates `propositionId`'s general
 * claim, as opposed to the register's own `statement` (`#1330`), which is
 * general by construction and says nothing about this particular hunk.
 * Always optional: #1220's own acceptance criteria call for leaving a
 * missing gloss visible rather than papering over it with generated prose,
 * the same posture `docs/leetype/README.md` already takes for the
 * construction family's missing `whyRepairDiscriminates` — so a diff-set
 * member with no gloss authored yet is a real, uncorrected thinness, not a
 * validation failure.
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
 * A deterministic structural key for a hunk — independent of authored key
 * order (unlike `JSON.stringify`, which is key-order sensitive and would
 * therefore under-count duplicates authored with fields in a different
 * order) — used only to detect the same hunk repeated across `D`'s
 * members, never to compare hunks for any other purpose.
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
 * `D` (Def. 1.4): an ordered set of diff-set members against one `A`.
 * `|D| ≥ 2` is this story's own floor — a round with only its one
 * admissible member has no distractor to compare it against, and Def. 1.4
 * calls `D` a *set* of diffs, plural, in the first place. Def. 3.1/Prop.
 * 2.1: exactly one member is authored as admissible; a round whose authored
 * data disagrees — zero, because nothing was patched back into budget, or
 * two, because the round can't say which repair the learner is meant to
 * find — is malformed and rejected at parse time, the same posture
 * `ConstraintSetSchema` already takes on an empty or ambiguous `C`, rather
 * than left for a lint to notice after the fact. A `D` carrying the same
 * `hunk` under two members is likewise rejected: Def. 1.4 calls `D` a
 * *set*, not a list, and a hunk repeated under two different `μ` claims
 * makes the mapping ambiguous for that hunk and would present a round with
 * two visually identical choices (review finding, #1261,
 * chatgpt-codex-connector).
 *
 * Whether the authored `admissible` claim actually agrees with
 * `isAdmissible`'s own derivation (Prop. 2.1's other half) is out of this
 * story's scope by its own telling — #1198 G3 already built
 * `checkAdmissibleClaimsAgreeWithDerivation` for exactly this comparison,
 * but wiring a real call site needs each member's own patched cost graph,
 * which only G4 (#1212, `rewriteOf`) computes. This schema records the
 * claim; that comparison is a later story's wiring, not this one's.
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
