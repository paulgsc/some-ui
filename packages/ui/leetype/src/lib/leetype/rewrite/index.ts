/**
 * The diff as witness (LTY-COST, G4, #1212) — `docs/canon/complexity-witness-canon.typ`
 * Def. 5.1, Thm. 5.1, Def. 5.2, Prop. 5.1, Rem. 5.1, Rem. 5.2.
 *
 * Theorem 5.1: every diff determines a rewrite `(G_A, G_{A'})`, and that
 * rewrite — not the text of the diff — is what a proposition `μ(d)` is
 * about. Nothing in this workspace parses program source into a cost
 * graph (R4's `DiffHunk` is textual segments, nothing more), so `G_{A'}`
 * is authored data, the same posture `G_A` itself already takes: `rewriteOf`
 * gives Theorem 5.1's claim one named place to live, not a parser.
 *
 * Engine-free, in the register of `lib/leetype/cost` and
 * `lib/leetype/admissibility`: nothing here imports the wasm loader or any
 * hook, and nothing live imports this yet.
 */

import { evaluate } from "@leetype/lib/leetype/admissibility"
import type { CostGraph, Monomial } from "@leetype/lib/leetype/cost"
import { costOf, printClass, printMonomial } from "@leetype/lib/leetype/cost"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import { assertNever } from "some-ui-utils"

/**
 * A rewrite (Def. 5.1): a pair of cost graphs, the algorithm's own before
 * `G_A` and the diff-applied after `G_{A'}`.
 */
export type Rewrite = {
  readonly before: CostGraph
  readonly after: CostGraph
}

/**
 * Theorem 5.1's pairing: a diff determines the rewrite `(G_A, G_{A'})`.
 * Deliberately the only place this workspace assembles a `Rewrite` — every
 * call site names the theorem instead of destructuring two graphs ad hoc.
 */
export function rewriteOf(before: CostGraph, after: CostGraph): Rewrite {
  return { before, after }
}

/**
 * Def. 5.1's second sentence: a rewrite is *admissibility-restoring* for
 * `(C, B)` iff `T(G) > B` and `T(G') <= B` at `C`'s bounds — derived from
 * the two graphs via `evaluate` (the same exact-count comparison Def. 3.1's
 * own `isAdmissible` uses), never authored.
 */
export function isAdmissibilityRestoring(
  rewrite: Rewrite,
  constraints: ConstraintSet,
  budget: Budget
): boolean {
  const before = evaluate(costOf(rewrite.before), constraints)
  const after = evaluate(costOf(rewrite.after), constraints)
  return before > budget.operations && after <= budget.operations
}

/**
 * The before/after `Θ`-class pair a round shows — computed from the two
 * graphs via `printClass`/`costOf`, the same derivation Prop. 2.1 already
 * requires of a single graph. This story's own acceptance criterion: "No
 * round authors 'before: Θ(nm)'."
 */
export function classesOf(rewrite: Rewrite): {
  readonly before: string
  readonly after: string
} {
  return {
    before: printClass(costOf(rewrite.before)),
    after: printClass(costOf(rewrite.after)),
  }
}

/**
 * One edge of a cost graph in Def. 2.1's own sense: a `Loop` node, which is
 * the only node kind Def. 2.1 gives a repetition expression to (`Seq` and
 * `W` carry none). `position` is the structural path from the graph's root
 * to this edge — a `Seq`'s `i`-th child extends the path with `.${i}`, a
 * `Loop`'s body extends it with `.body` — so two edges compare equal in
 * position only when they sit at exactly the same place in the tree, not
 * merely at the same depth.
 */
type CostGraphEdge = {
  readonly position: string
  readonly repetition: Monomial
}

function edgesOf(
  graph: CostGraph,
  position: string
): ReadonlyArray<CostGraphEdge> {
  switch (graph.kind) {
    case "work": {
      return []
    }
    case "seq": {
      return graph.children.flatMap((child, index) =>
        edgesOf(child, `${position}.${index}`)
      )
    }
    case "loop": {
      return [
        { position, repetition: graph.repetition },
        ...edgesOf(graph.body, `${position}.body`),
      ]
    }
    default: {
      return assertNever(graph)
    }
  }
}

/**
 * `semanticDistance(G, G')` (Def. 5.2): the number of `G`'s own edges whose
 * repetition expression or position changes in `G'` — never lines (Rem.
 * 5.1). Directional, per the definition's own wording ("edges of `G_A`"):
 * an edge of `before` counts once it either has no counterpart at the same
 * `position` in `after`, or has one whose repetition expression differs:
 * either condition alone is "changes," matching the definition's "or." An
 * edge `after` introduces with no counterpart in `before` is not itself
 * counted — Def. 5.2 counts `G_A`'s edges, not a symmetric edit distance —
 * though restructuring a graph so that none of its old edges survive at
 * their old positions (as CW-P5 and CW-P7 both do, below) still counts
 * every one of `before`'s edges, since none of them has a same-position
 * counterpart left to match.
 */
export function semanticDistance(before: CostGraph, after: CostGraph): number {
  const afterByPosition = new Map(
    edgesOf(after, "").map((edge) => [edge.position, edge.repetition])
  )
  return edgesOf(before, "").filter((edge) => {
    const afterRepetition = afterByPosition.get(edge.position)
    return (
      afterRepetition === undefined ||
      printMonomial(afterRepetition) !== printMonomial(edge.repetition)
    )
  }).length
}

/**
 * A rewrite together with the round's own authored claim about whether it
 * preserves the algorithm's observable behaviour. `isAdmissibilityRestoring`
 * above is *derived* from the two graphs and `(C, B)` — but no semantic
 * verifier exists for behaviour preservation (this story's own "out of
 * scope" line defers one), so whether a rewrite actually preserves
 * behaviour is never decided by this module. It is an authored, reviewed
 * claim, the same posture `DiffSetMember.admissible` (R4, `types/round.ts`)
 * and `AdmissibleClaim.authoredAdmissible` (G3, `lib/leetype/admissibility`)
 * already take on their own authored booleans — recorded here, never
 * derived. Wiring this into `D` (R4's diff set) so a corpus lint can compare
 * it against anything is a later story's job, not this one's — the same
 * "records the claim, does not yet wire it" posture R4's own `DiffSetSchema`
 * doc comment already takes toward G4.
 */
export type RewriteWitness = {
  readonly rewrite: Rewrite
  readonly behaviourPreserving: boolean
}
