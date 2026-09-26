import {
  checkAdmissibleClaimsAgreeWithDerivation,
  isAdmissible,
} from "@leetype/lib/leetype/admissibility"
import { checkConstraintDimensions } from "@leetype/lib/leetype/constraint"
import type { CostGraph } from "@leetype/lib/leetype/cost"
import { lintRoundEntries } from "@leetype/lib/leetype/exercises/corpus-lint"
import type {
  RoundCycleAdmissibleAdvance,
  RoundCyclePosingDiffSelection,
  RoundDiffOption,
} from "@leetype/lib/leetype/round-cycle"
import {
  checkUnrescuableExplanationsResolve,
  initialRoundCycleState,
} from "@leetype/lib/leetype/round-cycle"
import type { Round } from "@leetype/types/authored-round"
import { RoundSchema } from "@leetype/types/authored-round"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import { ConstraintDiffSchema } from "@leetype/types/constraint"
import type { DiffHunk } from "@leetype/types/exercise"

/**
 * LTY-AUTHOR (#1540): turns an authored `Round` (`types/authored-round.ts`)
 * into what the round surface and `lib/leetype/round-cycle` consume, and
 * holds the authored corpus to the checks that make its data real rather
 * than illustrative — every hunk applies to its round's `A`, every authored
 * admissibility claim agrees with `isAdmissible`, and the round's own
 * premise (admissible before the constraint diff, inadmissible after) holds.
 *
 * Engine-free, in the register of `lib/leetype/round-cycle`: nothing here
 * imports the wasm loader, a hook, or a component. Wiring the result into
 * `WideRoundSurface`/`ArtifactSwitcher` is the Leetype cutover's job (#1440).
 */

/** The outcome of applying one hunk to a source: the patched source, or why it does not apply. */
export type HunkApplication =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly reason: string }

/** Byte offset of the start of 1-based `line` in `source`, or `undefined` past the end. */
function offsetOfLine(source: string, line: number): number | undefined {
  let offset = 0
  for (let current = 1; current < line; current += 1) {
    const newline = source.indexOf("\n", offset)
    if (newline === -1) return undefined
    offset = newline + 1
  }
  return offset
}

/**
 * Applies a Def. 1.4 hunk to `A`'s source. The hunk's context and deletion
 * segments, concatenated, must appear verbatim starting at line `oldStart`;
 * they are replaced by its context and addition segments. A diff in `D` is
 * one hunk against one `A`, so `newStart` must equal `oldStart`: nothing
 * earlier in the file has moved.
 */
export function applyHunk(source: string, hunk: DiffHunk): HunkApplication {
  if (hunk.oldStart < 1) {
    return {
      ok: false,
      reason: `oldStart is ${hunk.oldStart}; lines are numbered from 1`,
    }
  }
  if (hunk.newStart !== hunk.oldStart) {
    return {
      ok: false,
      reason: `newStart (${hunk.newStart}) differs from oldStart (${hunk.oldStart}); a single hunk against A cannot shift its own start line`,
    }
  }

  const oldText = hunk.segments
    .filter((segment) => segment.kind !== "addition")
    .map((segment) => segment.text)
    .join("")
  const newText = hunk.segments
    .filter((segment) => segment.kind !== "deletion")
    .map((segment) => segment.text)
    .join("")
  if (oldText === newText) {
    return {
      ok: false,
      reason: "the hunk has no addition or deletion, so it changes nothing",
    }
  }

  const offset = offsetOfLine(source, hunk.oldStart)
  if (offset === undefined) {
    return {
      ok: false,
      reason: `oldStart ${hunk.oldStart} is past the end of the source`,
    }
  }
  if (!source.startsWith(oldText, offset)) {
    return {
      ok: false,
      reason: `the hunk's context and deletion text does not match the source at line ${hunk.oldStart}`,
    }
  }

  return {
    ok: true,
    source:
      source.slice(0, offset) + newText + source.slice(offset + oldText.length),
  }
}

/** A round ready for the surface: `A + d` for each member, and the cycle's opening state at `C′`. */
export type AssembledRound = {
  readonly round: Round
  readonly diffOptions: ReadonlyArray<RoundDiffOption>
  /** `A + d`, index-aligned with `diffOptions`. */
  readonly patchedSources: ReadonlyArray<string>
  /** Def. 8.1 at `C′` (`constraintDiff.after`). A linted round is always `posingDiffSelection` here. */
  readonly initialState:
    | RoundCycleAdmissibleAdvance
    | RoundCyclePosingDiffSelection
}

/**
 * Assembles an authored round. Throws if a hunk does not apply: a round
 * that cannot build `A + d` for one of its own members is malformed data,
 * and `lintAuthoredRounds` is where that is reported with context.
 */
export function assembleRound(round: Round): AssembledRound {
  const patchedSources = round.diffOptions.map((option, index) => {
    const applied = applyHunk(round.algorithm.source, option.member.hunk)
    if (!applied.ok) {
      throw new Error(
        `assembleRound: round "${round.id}", diff option ${index}: ${applied.reason}`
      )
    }
    return applied.source
  })
  const diffOptions: ReadonlyArray<RoundDiffOption> = round.diffOptions
  return {
    round,
    diffOptions,
    patchedSources,
    initialState: initialRoundCycleState(
      round.graph,
      round.constraintDiff.after,
      round.budget,
      diffOptions
    ),
  }
}

/** `isAdmissible`, with Def. 3.1's "undefined" case (an unbounded dimension) reported rather than thrown. */
function admissibilityOf(
  graph: CostGraph,
  constraints: ConstraintSet,
  budget: Budget
): { readonly admissible: boolean } | { readonly error: string } {
  try {
    return { admissible: isAdmissible(graph, constraints, budget) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Every per-round check that needs the whole `Round`, beyond the schema and `lintRoundEntries`. */
function checkAuthoredRound(round: Round): Array<string> {
  const where = `round "${round.id}"`
  const violations: Array<string> = []
  const { before, after } = round.constraintDiff

  const atBefore = admissibilityOf(round.graph, before, round.budget)
  if ("error" in atBefore) {
    violations.push(`${where}, G_A at C: ${atBefore.error}`)
  } else if (!atBefore.admissible) {
    violations.push(
      `${where}: A is not admissible under constraintDiff.before — Def. 8.1 case 1 opens on an admissible A, so the constraint diff has nothing to break.`
    )
  }
  const atAfter = admissibilityOf(round.graph, after, round.budget)
  if ("error" in atAfter) {
    violations.push(`${where}, G_A at C′: ${atAfter.error}`)
  } else if (atAfter.admissible) {
    violations.push(
      `${where}: A is still admissible under constraintDiff.after — Def. 8.1 poses D only when T_A(C′) > B, so this round would never present its diffs.`
    )
  }

  violations.push(
    ...checkConstraintDimensions(after, round.graph).map(
      (violation) => `${where}, G_A: ${violation}`
    )
  )

  const paths = new Set(
    round.diffOptions.map((option) => option.member.hunk.path)
  )
  if (paths.size > 1) {
    violations.push(
      `${where}: hunks name ${paths.size} different paths (${[...paths].join(", ")}) — Def. 1.4's D is a set of diffs against one A.`
    )
  }

  round.diffOptions.forEach((option, index) => {
    const applied = applyHunk(round.algorithm.source, option.member.hunk)
    if (!applied.ok) {
      violations.push(
        `${where}, diff option ${index}: the hunk does not apply to A — ${applied.reason}.`
      )
    }
    violations.push(
      ...checkConstraintDimensions(after, option.graph).map(
        (violation) => `${where}, diff option ${index}, G_{A+d}: ${violation}`
      )
    )
    option.rescueCandidates.forEach((candidate, candidateIndex) => {
      const result = ConstraintDiffSchema.safeParse({
        before: after,
        after: candidate.constraints,
      })
      if (!result.success) {
        violations.push(
          `${where}, diff option ${index}, rescue candidate ${candidateIndex}: not a valid constraint diff from C′ — ${result.error.issues.map((issue) => issue.message).join("; ")}.`
        )
      }
    })
  })

  const claims = round.diffOptions.map((option, index) => ({
    label: `diff option ${index} (${option.member.propositionId})`,
    graph: option.graph,
    authoredAdmissible: option.member.admissible,
  }))
  try {
    violations.push(
      ...checkAdmissibleClaimsAgreeWithDerivation(
        claims,
        after,
        round.budget,
        where
      )
    )
  } catch (error) {
    violations.push(
      `${where}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  violations.push(
    ...checkUnrescuableExplanationsResolve(round.diffOptions).map(
      (violation) => `${where}, ${violation}`
    )
  )

  return violations
}

/**
 * Every violation across the authored round corpus. Empty means clean.
 * Each round is parsed with `RoundSchema` first and its remaining checks
 * are skipped if that fails. `lintRoundEntries` then applies R5's
 * per-round rules to each round's `(C′, D)` slice. The register-wide
 * coverage checks in `lintRoundCorpus` are not run: the authored corpus
 * does not cover the register yet (#1540).
 */
export function lintAuthoredRounds(
  rounds: ReadonlyArray<unknown>
): Array<string> {
  const violations: Array<string> = []
  const parsed: Array<Round> = []

  rounds.forEach((candidate, index) => {
    const result = RoundSchema.safeParse(candidate)
    if (!result.success) {
      for (const issue of result.error.issues) {
        violations.push(
          `authored round ${index} (${issue.path.join(".") || "root"}): ${issue.message}`
        )
      }
      return
    }
    parsed.push(result.data)
  })

  const ids = parsed.map((round) => round.id)
  for (const id of new Set(ids)) {
    if (ids.filter((other) => other === id).length > 1) {
      violations.push(`round id "${id}" is used by more than one round`)
    }
  }

  violations.push(
    ...lintRoundEntries(
      parsed.map((round) => ({
        id: round.id,
        constraints: round.constraintDiff.after,
        diffSet: round.diffOptions.map((option) => option.member),
      }))
    )
  )
  for (const round of parsed) {
    violations.push(...checkAuthoredRound(round))
  }

  return violations
}
