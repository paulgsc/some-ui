import type { PropositionId } from "./generated"
import { PROPOSITION_REGISTER } from "./generated"

/**
 * B2 (LTY-PROBE, #1219) — `docs/canon/complexity-witness-canon.typ` Rem.
 * 6.2, Def. 2.1.
 *
 * Rem. 6.2 prefers a distractor proposition sharing "an input-dimension or
 * structural family" with the register entry being witnessed. Neither
 * property is text `parsePropositionRegister` can extract from canon §7 —
 * §7's own prose is free-form English, not data — so this is a second,
 * hand-authored table alongside the generated one, the same relationship
 * `concepts` has to a step in `lib/leetype/exercises` (LTY-MOBILE):
 * authored classification metadata, reviewed by a human, total over every
 * register id.
 *
 * # Where `family` comes from
 *
 * Def. 2.1's grammar has exactly three productions: `W(c)`, `Seq`, `Loop`.
 * The grammar's own "one line" restatement (canon, "Sibling control flow
 * adds. Nested control flow multiplies.") gives `"seq"` and `"loop"`
 * directly. The third bucket, `"substitution"`, is `W(c)`'s: a leaf unit of
 * work traded for a different one, or a term whose relationship to
 * structure is the point rather than its shape — CW-P5 and CW-P6 use the
 * word "substitutes" in their own titles, which is where the name comes
 * from. A proposition is filed under whichever production its own canon
 * statement is centrally about, not by mechanical rule — the same authored
 * judgement `claimOf`'s family field rests on for a step.
 *
 * # Where `dimensions` comes from
 *
 * The symbolic input dimension(s) (Def. 1.2) each proposition's own
 * worked statement is stated over — `["n"]` for the ordinary single-
 * dimension case, `["n", "m"]` where the statement is explicitly about two
 * (CW-P5, CW-P6, CW-P14), and `[]` for `CW-P16`, whose entire point is a
 * term *independent* of every bound. `[]` is not a gap in this table — it
 * is `CW-P16`'s own content, faithfully modeled: nothing shares a
 * dimension with a proposition that has none, so `CW-P16`'s distractors
 * are chosen by family and seed alone (`round-probe/index.test.ts` proves
 * this does not throw or degenerate).
 */
export type PropositionFamily = "seq" | "loop" | "substitution"

export type PropositionClassification = {
  readonly family: PropositionFamily
  readonly dimensions: ReadonlyArray<string>
}

export const PROPOSITION_CLASSIFICATION: Readonly<
  Record<PropositionId, PropositionClassification>
> = {
  "CW-P1": { family: "seq", dimensions: ["n"] },
  "CW-P2": { family: "loop", dimensions: ["n"] },
  "CW-P3": { family: "seq", dimensions: ["n"] },
  "CW-P4": { family: "substitution", dimensions: ["n"] },
  "CW-P5": { family: "substitution", dimensions: ["n", "m"] },
  "CW-P6": { family: "substitution", dimensions: ["n", "m"] },
  "CW-P7": { family: "substitution", dimensions: ["n"] },
  "CW-P8": { family: "loop", dimensions: ["n"] },
  "CW-P9": { family: "loop", dimensions: ["n"] },
  "CW-P10": { family: "seq", dimensions: ["n"] },
  "CW-P11": { family: "seq", dimensions: ["n"] },
  "CW-P12": { family: "loop", dimensions: ["n"] },
  "CW-P13": { family: "substitution", dimensions: ["m"] },
  "CW-P14": { family: "loop", dimensions: ["n", "m"] },
  "CW-P15": { family: "substitution", dimensions: ["n"] },
  "CW-P16": { family: "substitution", dimensions: [] },
}

/**
 * Narrows a bare `string` (an entry's own `.id` field, typed as plain
 * `string` on `PropositionRegisterEntry`) to `PropositionId` by checking it
 * against the live register, rather than asserting it with `as` — the same
 * `Object.hasOwn`-against-the-register technique `types/round.ts`'s own
 * private `isKnownPropositionId` uses for the identical reason. Exported
 * because `round-probe/index.ts` needs the same narrowing at its own
 * register-entry boundary; kept as one definition rather than a third
 * private copy, unlike `reading-probe`'s deliberately-duplicated
 * `withoutContextDelimiters` — that duplication was justified by the two
 * copies having different jobs (a lint's approximation vs. a renderer's
 * ground truth) that could legitimately drift; this predicate has exactly
 * one job everywhere it's used.
 */
export function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
}

/**
 * Every id `PROPOSITION_REGISTER` carries that this table does not, or vice
 * versa — empty for a table that classifies exactly the current register,
 * neither more nor less.
 *
 * `PROPOSITION_CLASSIFICATION`'s own type already forces every
 * `PropositionId` to have an entry, so the only way these two can actually
 * drift apart at runtime is `generated.ts` regenerating with a *new* id an
 * old build of this file predates — the same amendment-lands-before-corpus
 * ordering Rem. 7.2 already states. `classification.test.ts` runs this
 * against the live `PROPOSITION_REGISTER` so a canon amendment adding
 * `CW-P17` fails here, loudly, until this table is amended too.
 */
export function classificationCoverageGaps(
  register: Readonly<
    Record<string, { readonly id: string }>
  > = PROPOSITION_REGISTER
): ReadonlyArray<string> {
  const registerIds = new Set(Object.keys(register))
  const classifiedIds = new Set(Object.keys(PROPOSITION_CLASSIFICATION))

  const gaps: Array<string> = []
  for (const id of registerIds) {
    if (!classifiedIds.has(id)) {
      gaps.push(
        `${id} is in the proposition register with no classification entry.`
      )
    }
  }
  for (const id of classifiedIds) {
    if (!registerIds.has(id) || !isPropositionId(id)) {
      gaps.push(`${id} is classified but is not a proposition register id.`)
    }
  }
  return gaps
}
