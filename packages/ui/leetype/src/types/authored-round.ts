import type { CostGraph, Monomial } from "@leetype/lib/leetype/cost"
import { multiplyMonomials, ONE } from "@leetype/lib/leetype/cost"
import { AlgorithmSchema } from "@leetype/types/algorithm"
import {
  BudgetSchema,
  ConstraintDiffSchema,
  ConstraintSetSchema,
} from "@leetype/types/constraint"
import {
  DiffSetMemberSchema,
  DiffSetSchema,
  PropositionIdSchema,
} from "@leetype/types/round"
import { z } from "zod"

/**
 * LTY-AUTHOR (#1540) — Def. 1.7's round, assembled: the one schema a real,
 * authored round is held to, composing the per-Def schemas this workspace
 * already has (`AlgorithmSchema`, `ConstraintDiffSchema`, `BudgetSchema`,
 * `DiffSetMemberSchema`) with the cost graphs `lib/leetype/round-cycle`
 * branches on. Replaces nothing yet: `lib/leetype/round-corpus`'s fixture
 * rounds (`RoundCorpusEntry`, the R1–R4 slice) stay what R5's lint runs
 * over until the authored corpus covers the register.
 *
 * `r` (Def. 4.1) is absent by design. A round is complete without a run:
 * Def. 8.1 branches on the derived relation `T_A(C) <= B`, never on `r`
 * (Rem. 8.0), and #1201 requires a cycle to stay playable with every
 * execution failing. Execution results come from `paulgsc/server#381`, and
 * recorded transcripts from `paulgsc/server#328`, keyed by this round's `id`.
 */

/** One factor of a repetition monomial, as `lib/leetype/cost` normalizes it. */
const MonomialFactorSchema = z.object({
  kind: z.enum(["pow", "log"]),
  dimension: z.string().min(1),
  exponent: z.number().int(),
})

/** Structural equality of two monomials, factor by factor (key order never matters). */
function sameMonomial(a: Monomial, b: Monomial): boolean {
  return (
    a.length === b.length &&
    a.every((factor, index) => {
      const other = b[index]
      return (
        other?.kind === factor.kind &&
        other.dimension === factor.dimension &&
        other.exponent === factor.exponent
      )
    })
  )
}

/**
 * A repetition expression must already be in `lib/leetype/cost`'s normal
 * form: no zero exponent, no repeated factor, factors in order. Otherwise
 * `costOf` normalizes a factor like `n^0` or `n * n^-1` away while
 * `dimensionsOfGraph` still reports `n`, and `checkConstraintDimensions`
 * would count a bound that `isAdmissible` never reads.
 */
const RepetitionSchema = z
  .array(MonomialFactorSchema)
  .refine(
    (repetition) =>
      sameMonomial(repetition, multiplyMonomials(repetition, ONE)),
    {
      message:
        "a repetition expression must be normalized: no zero exponent, no repeated or cancelling factor, factors sorted (build it with dim/logDim/multiplyMonomials)",
    }
  )

/**
 * `G` (Def. 2.1) as data. Authored, never parsed from source: nothing in
 * this workspace derives a cost graph from a program (`lib/leetype/
 * rewrite`), so a graph that misdescribes its program is a review defect,
 * the same way a wrong μ is (Ax. 6.1, Prop. 2.1).
 */
export const CostGraphSchema: z.ZodType<CostGraph> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("work"), cost: z.number() }),
    z.object({ kind: z.literal("seq"), children: z.array(CostGraphSchema) }),
    z.object({
      kind: z.literal("loop"),
      repetition: RepetitionSchema,
      body: CostGraphSchema,
    }),
  ])
)

/**
 * Every round's `A` is Rust (decided 2026-09-26, #1540). The language is
 * mechanical: the propositions are about cost graphs and never about syntax
 * (Thm. 5.1), so one fixed language keeps the corpus uniform and lets
 * `paulgsc/server#381` run a single toolchain. `AlgorithmSchema` itself
 * still admits four languages for the renderers that predate this decision.
 */
const RoundAlgorithmSchema = AlgorithmSchema.extend({
  language: z.literal("rust"),
})

/** Def. 8.2 case 1's candidate `C″`, with the proposition explaining why it rescues. */
const RescueCandidateSchema = z.object({
  constraints: ConstraintSetSchema,
  propositionId: PropositionIdSchema,
})

/**
 * One member of `D` plus what `lib/leetype/round-cycle` needs the instant it
 * is selected (`RoundDiffOption`): `graph` is `G_{A+d}` (Thm. 5.1),
 * `rescueCandidates` are Def. 8.2 case 1's `C″`s, and
 * `explanationPropositionId` is case 2's fallback question.
 */
const RoundDiffOptionSchema = z.object({
  member: DiffSetMemberSchema,
  graph: CostGraphSchema,
  rescueCandidates: z.array(RescueCandidateSchema),
  explanationPropositionId: PropositionIdSchema,
})

/**
 * Def. 1.7's `(A, C, B, D, μ)`. `constraintDiff.before` is the `C` under
 * which `A` is admissible and `constraintDiff.after` the `C′` under which
 * it is not, so the round opens on Def. 8.1 case 1's constraint diff and
 * poses `D` at `C′` (case 2). μ is each member's `propositionId`.
 * `diffOptions`' members are held to `DiffSetSchema`'s own rules: at least
 * two, exactly one authored admissible, no repeated hunk.
 */
export const RoundSchema = z
  .object({
    id: z.string().min(1),
    algorithm: RoundAlgorithmSchema,
    constraintDiff: ConstraintDiffSchema,
    budget: BudgetSchema,
    graph: CostGraphSchema,
    diffOptions: z.array(RoundDiffOptionSchema),
  })
  .superRefine((round, context) => {
    const result = DiffSetSchema.safeParse(
      round.diffOptions.map((option) => option.member)
    )
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: ["diffOptions"],
        })
      }
    }
  })
export type Round = z.infer<typeof RoundSchema>
