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
import type { CostGraph, Dimension, Monomial } from "@leetype/lib/leetype/cost"
import {
  costOf,
  dimensionsOfGraph,
  multiplyMonomials,
  ONE,
  printClass,
  printMonomial,
} from "@leetype/lib/leetype/cost"
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
 * `Loop`'s body extends it with `.body` — so two edges sit at exactly the
 * same place in the tree only when their positions match exactly, not
 * merely at the same depth. `id` is this edge's correspondence key across
 * a rewrite — see `EdgeIdentity`'s own doc comment for why it is not
 * simply `position` again.
 */
type CostGraphEdge = {
  readonly id: string
  readonly position: string
  readonly repetition: Monomial
}

/**
 * Assigns a `Loop` edge its correspondence key across a rewrite — which
 * edge of `after` is "the same edge as this one from `before`, possibly
 * moved," a question the two graphs cannot answer on their own.
 *
 * Concretely: `Loop(n, W(1))` becomes `Loop(n, Loop(n, W(1)))` either by
 * adding a new inner loop (the original outer edge is untouched — distance
 * 0) or by adding a new outer loop and pushing the original into its body
 * (the original edge moved — distance 1). Both rewrites produce the
 * identical `after` graph, so `semanticDistance(before, after)` alone
 * cannot tell them apart; no function of the graph pair can (review
 * finding on this PR, chatgpt-codex-connector). The default identity below
 * (`defaultEdgeIdentity`) keys an edge by its own `position`, which is
 * exactly wrong for this case — it reports 0 for *both* rewrites, since
 * position-keyed matching cannot see that the second one moved anything.
 *
 * Resolving that requires information the graphs alone don't carry, so —
 * the same posture μ (Ax. 6.1) and every other cross-state identity claim
 * in this workspace already takes — it is authored, never inferred: a
 * caller who retains object identity across `before`/`after` while
 * constructing the rewrite (e.g. reusing the exact `before` sub-object as
 * part of `after`'s tree, the natural way to author "this loop, now
 * nested") can pass an `identify` that recognizes that object and assigns
 * it a stable id regardless of where it moved, while everything else falls
 * back to position. `semanticDistance` compares the matched pair's
 * `position` in addition to `repetition`, so a same-id match whose
 * position differs still counts as changed — this function only needs to
 * answer "is this the same edge," not "did it move."
 */
export type EdgeIdentity = (
  loop: Extract<CostGraph, { kind: "loop" }>,
  position: string
) => string

function defaultEdgeIdentity(
  _loop: Extract<CostGraph, { kind: "loop" }>,
  position: string
): string {
  return position
}

function edgesOf(
  graph: CostGraph,
  position: string,
  identify: EdgeIdentity
): ReadonlyArray<CostGraphEdge> {
  switch (graph.kind) {
    case "work": {
      return []
    }
    case "seq": {
      return graph.children.flatMap((child, index) =>
        edgesOf(child, `${position}.${index}`, identify)
      )
    }
    case "loop": {
      return [
        {
          id: identify(graph, position),
          position,
          repetition: graph.repetition,
        },
        ...edgesOf(graph.body, `${position}.body`, identify),
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
 * an edge of `before` counts once its matched counterpart in `after` (by
 * `identify`, `position`-keyed by default — see `EdgeIdentity`'s own doc
 * comment for the ambiguity that default cannot resolve) either does not
 * exist, or exists with a different `position` or a different repetition
 * expression: either condition alone is "changes," matching the
 * definition's "or." An edge `after` introduces with no counterpart in
 * `before` is not itself counted — Def. 5.2 counts `G_A`'s edges, not a
 * symmetric edit distance — though restructuring a graph so that none of
 * its old edges survive at their old positions (as CW-P5 and CW-P7 both
 * do, below) still counts every one of `before`'s edges, since none of
 * them has a same-position counterpart left to match under the default
 * identity.
 */
function edgeUnchanged(
  before: CostGraphEdge,
  match: CostGraphEdge | undefined
): boolean {
  if (match === undefined) return false
  return (
    match.position === before.position &&
    printMonomial(match.repetition) === printMonomial(before.repetition)
  )
}

export function semanticDistance(
  before: CostGraph,
  after: CostGraph,
  identify: EdgeIdentity = defaultEdgeIdentity
): number {
  const afterById = new Map(
    edgesOf(after, "", identify).map((edge) => [edge.id, edge])
  )
  return edgesOf(before, "", identify).filter(
    (edge) => !edgeUnchanged(edge, afterById.get(edge.id))
  ).length
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

/**
 * Beyond this many dimensions `rewriteKeyOf` stops trying every renaming
 * (`n!` of them) and renames in sorted-name order instead. Six is 720
 * serializations of two small graphs; every authored round names two.
 */
const CANONICAL_RENAMING_MAX_DIMENSIONS = 6

function permutations<T>(items: ReadonlyArray<T>): Array<Array<T>> {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest]
    )
  )
}

function renamedMonomial(
  monomial: Monomial,
  rename: ReadonlyMap<Dimension, Dimension>
): string {
  return printMonomial(
    multiplyMonomials(
      monomial.map((factor) => ({
        ...factor,
        dimension: rename.get(factor.dimension) ?? factor.dimension,
      })),
      ONE
    )
  )
}

/**
 * A graph's shape: `Seq` and `Loop` in order, each loop's repetition under
 * `rename`, and every `W` as a bare `W`. A work node's constant is not
 * structure: Def. 2.1 gives only a `Loop` a repetition expression, Def.
 * 5.2's distance counts only loop edges, and `W(1)` against `W(3)` is a
 * constant factor no Θ-class (Def. 2.2) can see.
 */
function shapeOf(
  graph: CostGraph,
  rename: ReadonlyMap<Dimension, Dimension>
): string {
  switch (graph.kind) {
    case "work": {
      return "W"
    }
    case "seq": {
      return `S(${graph.children.map((child) => shapeOf(child, rename)).join(",")})`
    }
    case "loop": {
      return `L[${renamedMonomial(graph.repetition, rename)}](${shapeOf(graph.body, rename)})`
    }
    default: {
      return assertNever(graph)
    }
  }
}

/** FNV-1a over UTF-16 code units, 32 bits, from a given offset basis. */
function fnv1a(text: string, basis: number): string {
  let hash = basis >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * A rewrite's structural identity (#1212 G4, consumed by #1229 L3): two
 * rewrites share a key exactly when their `(G_A, G_{A'})` pairs have the
 * same shape up to renaming the input dimensions, so it is computed from
 * the rewrite, never from a round id. Def. 10.2's positive transfer counts
 * rounds whose diffs "induce structurally distinct rewrites"; three rounds
 * carrying the same rewrite are one piece of evidence under this key,
 * however their programs, ids or dimension names differ.
 *
 * Why not `semanticDistance`: Def. 5.2 is a count, and two unrelated
 * rewrites can each move one edge. Distinctness needs an identity, so this
 * keys the whole pair's shape (see `shapeOf` for what counts as shape).
 *
 * Renaming: `n` in one round and `m` in another are author's choices
 * (`Dimension`), so the key is the least serialization over every renaming
 * of the pair's dimensions onto `d0, d1, ...`, applied to both graphs at
 * once so a dimension shared by before and after stays shared. That is a
 * canonical form: equal keys mean isomorphic shapes, and isomorphic shapes
 * give equal keys. Past `CANONICAL_RENAMING_MAX_DIMENSIONS` it renames in
 * sorted-name order, which stays sound (equal keys still mean equal
 * shapes) and may split one shape across two keys.
 *
 * The serialization is hashed (two FNV-1a passes, 64 bits) because the
 * ledger stores a key on every observation (`lib/leetype/ledger`) and
 * Thm. 7.1 of the sibling canon prices each byte of it.
 */
export function rewriteKeyOf(rewrite: Rewrite): string {
  const dimensions = [
    ...new Set([
      ...dimensionsOfGraph(rewrite.before),
      ...dimensionsOfGraph(rewrite.after),
    ]),
  ].sort()
  const orders =
    dimensions.length <= CANONICAL_RENAMING_MAX_DIMENSIONS
      ? permutations(dimensions)
      : [dimensions]
  let least: string | undefined
  for (const order of orders) {
    const rename = new Map(
      order.map((dimension, index) => [dimension, `d${index}`])
    )
    const shape = `${shapeOf(rewrite.before, rename)}=>${shapeOf(rewrite.after, rename)}`
    if (least === undefined || shape < least) least = shape
  }
  const canonical = least ?? ""
  return `rw:${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01000193)}`
}
