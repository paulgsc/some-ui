/**
 * The diff as witness (LTY-COST G4): canon Def. 5.1, Thm. 5.1, Def. 5.2,
 * Prop. 5.1, Rem. 5.1, Rem. 5.2.
 *
 * Thm. 5.1: every diff determines a rewrite `(G_A, G_{A'})`, and the rewrite,
 * not the diff's text, is what a proposition `μ(d)` is about. Nothing parses
 * source into a cost graph, so `G_{A'}` is authored like `G_A`; `rewriteOf`
 * gives the theorem one named place.
 *
 * Engine-free: no wasm loader or hook.
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
import { assertNever, fnv1a } from "@some-ui/core-utils"

/**
 * A rewrite (Def. 5.1): a pair of cost graphs, the algorithm's own before
 * `G_A` and the diff-applied after `G_{A'}`.
 */
export type Rewrite = {
  readonly before: CostGraph
  readonly after: CostGraph
}

/**
 * Thm. 5.1's pairing: a diff determines the rewrite `(G_A, G_{A'})`. The only
 * place a `Rewrite` is assembled.
 */
export function rewriteOf(before: CostGraph, after: CostGraph): Rewrite {
  return { before, after }
}

/**
 * Def. 5.1: a rewrite is *admissibility-restoring* for `(C, B)` iff
 * `T(G) > B` and `T(G') <= B` at `C`'s bounds. Derived via `evaluate`, never
 * authored.
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
 * The before/after `Θ`-class pair a round shows, derived via `printClass`
 * (Prop. 2.1). No round authors "before: Θ(nm)".
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
 * One edge of a cost graph: a `Loop` node, the only kind with a repetition
 * (Def. 2.1). `position` is the structural path from the root (`.${i}` for a
 * `Seq` child, `.body` for a `Loop` body). `id` is the correspondence key
 * across a rewrite (see `EdgeIdentity`).
 */
type CostGraphEdge = {
  readonly id: string
  readonly position: string
  readonly repetition: Monomial
}

/**
 * Assigns a `Loop` edge its correspondence key across a rewrite: which edge
 * of `after` is "the same edge, possibly moved". The graphs alone cannot say.
 *
 * `Loop(n, W(1))` → `Loop(n, Loop(n, W(1)))` is either a new inner loop
 * (distance 0) or a new outer loop with the original pushed inside
 * (distance 1); both give the same `after`. The default keys by `position`
 * and reports 0 for both.
 *
 * So identity is authored (like μ, Ax. 6.1): a caller who reuses the exact
 * `before` sub-object inside `after` can pass an `identify` that recognizes
 * it. This only answers "same edge?"; `semanticDistance` still compares
 * positions to decide whether it moved.
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

/**
 * `semanticDistance(G, G')` (Def. 5.2): the number of `G`'s edges whose
 * repetition or position changes in `G'`, never lines (Rem. 5.1).
 * Directional: an edge of `before` counts when its match in `after` (by
 * `identify`) is missing or differs in position or repetition. New edges in
 * `after` are not counted.
 */
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
 * A rewrite with the round's authored claim that it preserves observable
 * behaviour. No semantic verifier exists, so this is recorded, never derived
 * (like `DiffSetMember.admissible`), and not yet wired into `D`.
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

const hex = (hash: number): string => hash.toString(16).padStart(8, "0")

/**
 * A rewrite's structural identity (used by the ledger): two
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
  return `rw:${hex(fnv1a(canonical))}${hex(fnv1a(canonical, 0x01000193))}`
}
