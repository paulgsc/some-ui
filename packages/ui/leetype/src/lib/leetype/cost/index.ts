/**
 * The cost algebra (LTY-COST): canon Def. 2.1, Def. 2.2.
 *
 * `W`/`Seq`/`Loop` build a cost graph `G`; `costOf` computes `T(G)`. Sibling
 * control flow adds, nested control flow multiplies, nothing else. `T` is a
 * *symbolic* expression over input dimensions, never a number. A round that
 * authors a `Θ` string instead of a graph is the error Prop. 2.1 forbids;
 * this module makes the class derived.
 *
 * Engine-free: no wasm loader or hook.
 */

import { assertNever } from "some-ui-utils"

/** An input dimension's identifier — `n`, `m`, whatever a round's author names (Def. 1.2). */
export type Dimension = string

type PowFactor = {
  readonly kind: "pow"
  readonly dimension: Dimension
  readonly exponent: number
}
type LogFactor = {
  readonly kind: "log"
  readonly dimension: Dimension
  readonly exponent: number
}

/** One factor of a monomial: a dimension, or a logarithm of one, raised to an integer power. */
type MonomialFactor = PowFactor | LogFactor

/**
 * A repetition expression (Def. 2.1): a monomial in the input dimensions —
 * `n`, `n^2`, `log n`, `m`, or a product of several. Normalized as factors
 * sorted by kind and dimension with like factors merged, so two monomials
 * built by different routes compare equal by structure. The empty product
 * (`ONE`) is the constant monomial 1.
 */
export type Monomial = ReadonlyArray<MonomialFactor>

function factorKey(factor: MonomialFactor): string {
  return `${factor.kind}:${factor.dimension}`
}

function normalizeMonomial(factors: ReadonlyArray<MonomialFactor>): Monomial {
  const byKey = new Map<string, MonomialFactor>()
  for (const factor of factors) {
    const key = factorKey(factor)
    const exponent = (byKey.get(key)?.exponent ?? 0) + factor.exponent
    byKey.set(key, { ...factor, exponent })
  }
  return [...byKey.values()]
    .filter((factor) => factor.exponent !== 0)
    .sort((a, b) => factorKey(a).localeCompare(factorKey(b)))
}

/** The constant monomial 1 — an empty product of factors. */
export const ONE: Monomial = []

/** `dim("n")` is `n`; `dim("n", 2)` is `n^2`. */
export function dim(dimension: Dimension, exponent = 1): Monomial {
  validateDimension(dimension)
  return normalizeMonomial([{ kind: "pow", dimension, exponent }])
}

/** `logDim("n")` is `log n`; `logDim("n", 2)` is `(log n)^2`. */
export function logDim(dimension: Dimension, exponent = 1): Monomial {
  validateDimension(dimension)
  return normalizeMonomial([{ kind: "log", dimension, exponent }])
}

/** Nested `Loop`s multiply: combines two monomials, merging shared factors' exponents. */
export function multiplyMonomials(a: Monomial, b: Monomial): Monomial {
  return normalizeMonomial([...a, ...b])
}

function printFactor(factor: MonomialFactor): string {
  const base =
    factor.kind === "log" ? `log ${factor.dimension}` : factor.dimension
  if (factor.exponent === 1) return base
  return factor.kind === "log"
    ? `(${base})^${factor.exponent}`
    : `${base}^${factor.exponent}`
}

/** Prints a monomial in the notation an author would write it: `n^2`, `log n`, `n * m`. */
export function printMonomial(monomial: Monomial): string {
  if (monomial.length === 0) return "1"
  return monomial.map(printFactor).join(" * ")
}

// One identifier shape for `validateDimension` and `parseFactor`, so every
// name `dim`/`logDim` accept parses back (`parseMonomial` inverts `printMonomial`).
const DIMENSION_SOURCE = "[A-Za-z]\\w*"
const DIMENSION_NAME = new RegExp(`^${DIMENSION_SOURCE}$`)
const LOG_PAREN = new RegExp(`^\\(log\\s+(${DIMENSION_SOURCE})\\)\\^(-?\\d+)$`)
const LOG_PLAIN = new RegExp(`^log\\s+(${DIMENSION_SOURCE})$`)
const POW = new RegExp(`^(${DIMENSION_SOURCE})(?:\\^(-?\\d+))?$`)

function validateDimension(dimension: Dimension): void {
  if (!DIMENSION_NAME.test(dimension)) {
    throw new Error(
      `not a valid dimension name: "${dimension}" (expected ${DIMENSION_NAME})`
    )
  }
}

function parseFactor(token: string): MonomialFactor {
  const raw = token.trim()

  const paren = LOG_PAREN.exec(raw)
  if (paren)
    return { kind: "log", dimension: paren[1]!, exponent: Number(paren[2]) }

  const plainLog = LOG_PLAIN.exec(raw)
  if (plainLog) return { kind: "log", dimension: plainLog[1]!, exponent: 1 }

  const pow = POW.exec(raw)
  if (pow)
    return {
      kind: "pow",
      dimension: pow[1]!,
      exponent: pow[2] ? Number(pow[2]) : 1,
    }

  throw new Error(`not a repetition expression: "${token}"`)
}

/**
 * Parses a monomial from the notation `printMonomial` produces — `n^2`,
 * `log n`, `n * m` — the inverse of `printMonomial` on any monomial this
 * module can construct.
 */
export function parseMonomial(text: string): Monomial {
  const trimmed = text.trim()
  if (trimmed === "1") return ONE
  return normalizeMonomial(trimmed.split("*").map(parseFactor))
}

/** One term of a cost expression: a coefficient times a monomial. */
type CostTerm = {
  readonly coefficient: number
  readonly monomial: Monomial
}

/**
 * `T(G)` (Def. 2.2): a symbolic sum of monomials, never a number and never a
 * `Θ` string. Normalized like `Monomial` — terms sharing a monomial are
 * combined and zero-coefficient terms dropped, so two expressions built by
 * different derivations compare equal by structure. The empty sum is 0.
 */
export type CostExpr = ReadonlyArray<CostTerm>

function monomialKey(monomial: Monomial): string {
  return monomial
    .map((factor) => `${factor.kind}:${factor.dimension}:${factor.exponent}`)
    .join(",")
}

function normalizeCostExpr(terms: ReadonlyArray<CostTerm>): CostExpr {
  const byKey = new Map<string, CostTerm>()
  for (const term of terms) {
    const key = monomialKey(term.monomial)
    const coefficient = (byKey.get(key)?.coefficient ?? 0) + term.coefficient
    byKey.set(key, { coefficient, monomial: term.monomial })
  }
  return [...byKey.values()]
    .filter((term) => term.coefficient !== 0)
    .sort((a, b) =>
      monomialKey(a.monomial).localeCompare(monomialKey(b.monomial))
    )
}

/** `T(W(c))`: a constant, unit-monomial term. */
export function constantCost(cost: number): CostExpr {
  return normalizeCostExpr([{ coefficient: cost, monomial: ONE }])
}

/** `T(Seq(G₁ … Gₘ))`: siblings add. */
export function sumCost(...exprs: ReadonlyArray<CostExpr>): CostExpr {
  return normalizeCostExpr(exprs.flat())
}

/** `T(Loop(r, G)) = r · T(G)`: nesting multiplies, distributing `r` over every term. */
export function scaleCost(repetition: Monomial, expr: CostExpr): CostExpr {
  return normalizeCostExpr(
    expr.map((term) => ({
      coefficient: term.coefficient,
      monomial: multiplyMonomials(repetition, term.monomial),
    }))
  )
}

/** A cost graph (Def. 2.1): `G ::= W(c) | Seq(G₁ … Gₘ) | Loop(r, G)`. */
export type CostGraph =
  | { readonly kind: "work"; readonly cost: number }
  | { readonly kind: "seq"; readonly children: ReadonlyArray<CostGraph> }
  | {
      readonly kind: "loop"
      readonly repetition: Monomial
      readonly body: CostGraph
    }

/** Constant or parameterized straight-line work. */
export function W(cost: number): CostGraph {
  return { kind: "work", cost }
}

/** Sequential composition of siblings. */
export function Seq(...children: ReadonlyArray<CostGraph>): CostGraph {
  return { kind: "seq", children }
}

/** `body`, repeated `repetition` times. */
export function Loop(repetition: Monomial, body: CostGraph): CostGraph {
  return { kind: "loop", repetition, body }
}

/**
 * `T(G)` (Def. 2.2): the cost graph's symbolic cost, computed rather than
 * asserted. A round authors `G` and derives everything downstream from this
 * — never the reverse (Prop. 2.1).
 */
export function costOf(graph: CostGraph): CostExpr {
  switch (graph.kind) {
    case "work": {
      return constantCost(graph.cost)
    }
    case "seq": {
      return sumCost(...graph.children.map(costOf))
    }
    case "loop": {
      return scaleCost(graph.repetition, costOf(graph.body))
    }
    default: {
      return assertNever(graph)
    }
  }
}

/** Every dimension named by any factor of a monomial. */
export function dimensionsOfMonomial(
  monomial: Monomial
): ReadonlySet<Dimension> {
  return new Set(monomial.map((factor) => factor.dimension))
}

/**
 * Every dimension any `Loop` in the graph repeats over (only repetitions
 * carry dimensions; `W`'s cost is a number). Constraint dimensions are
 * checked against these.
 */
export function dimensionsOfGraph(graph: CostGraph): ReadonlySet<Dimension> {
  switch (graph.kind) {
    case "work": {
      return new Set()
    }
    case "seq": {
      const dimensions = new Set<Dimension>()
      for (const child of graph.children) {
        for (const dimension of dimensionsOfGraph(child)) {
          dimensions.add(dimension)
        }
      }
      return dimensions
    }
    case "loop": {
      const dimensions = new Set(dimensionsOfMonomial(graph.repetition))
      for (const dimension of dimensionsOfGraph(graph.body)) {
        dimensions.add(dimension)
      }
      return dimensions
    }
    default: {
      return assertNever(graph)
    }
  }
}

/**
 * Thm. 2.1 / Cor. 2.1 / Def. 2.3 / Rem. 2.1: `T(G)` decomposed into the
 * root-to-leaf paths whose products sum to it, and the dominant subset, so a
 * renderer can show *which* nesting is expensive.
 */

/** One root-to-leaf path through a cost graph (Thm. 2.1): the `Loop` nodes traversed and the `W` leaf, as node references so a caller can match them by `===` to highlight the chain. */
export type CostPath = {
  readonly loops: ReadonlyArray<Extract<CostGraph, { kind: "loop" }>>
  readonly leaf: Extract<CostGraph, { kind: "work" }>
}

function pathsOf(
  graph: CostGraph,
  loopsSoFar: ReadonlyArray<Extract<CostGraph, { kind: "loop" }>>
): ReadonlyArray<CostPath> {
  switch (graph.kind) {
    case "work": {
      return [{ loops: loopsSoFar, leaf: graph }]
    }
    case "seq": {
      return graph.children.flatMap((child) => pathsOf(child, loopsSoFar))
    }
    case "loop": {
      return pathsOf(graph.body, [...loopsSoFar, graph])
    }
    default: {
      return assertNever(graph)
    }
  }
}

/**
 * `paths(G)` (Thm. 2.1): every root-to-leaf path. `Seq` unions its children's
 * paths, `Loop` prefixes onto its body's, `W` ends one. One path per leaf,
 * unlike `costOf`, which merges paths landing on the same monomial.
 */
export function paths(graph: CostGraph): ReadonlyArray<CostPath> {
  return pathsOf(graph, [])
}

/** `Π_{v∈p} r_v` (Thm. 2.1): a path's repetition monomials, multiplied. */
export function monomialOfPath(path: CostPath): Monomial {
  return path.loops.reduce(
    (product, loop) => multiplyMonomials(product, loop.repetition),
    ONE
  )
}

/** One path's contribution to `T(G)`: leaf constant times monomial. Summed over `paths(G)` it equals `costOf(G)` (Thm. 2.1). */
export function costOfPath(path: CostPath): CostExpr {
  return normalizeCostExpr([
    { coefficient: path.leaf.cost, monomial: monomialOfPath(path) },
  ])
}

/**
 * A path's degree (Cor. 2.1's `Σ_v a_v`, generalized): summed `pow`
 * exponents first, summed `log` exponents as tie-break. The `log` part
 * matters for `n * log n` against `n`: slower than any power, faster than
 * nothing. Comparing different dimensions (`n²` vs `m³`) is out of scope,
 * since it depends on how `n` and `m` relate.
 */
type Degree = { readonly pow: number; readonly log: number }

function sumExponents(monomial: Monomial, kind: "pow" | "log"): number {
  return monomial
    .filter((factor) => factor.kind === kind)
    .reduce((total, factor) => total + factor.exponent, 0)
}

/** A monomial's degree, so `dominantTerms` compares terms as `dominantPaths` compares paths. */
function degreeOfMonomial(monomial: Monomial): Degree {
  return {
    pow: sumExponents(monomial, "pow"),
    log: sumExponents(monomial, "log"),
  }
}

function degreeOfPath(path: CostPath): Degree {
  return degreeOfMonomial(monomialOfPath(path))
}

/** `true` iff `a` is strictly greater than `b` — `pow` decides first, `log` breaks a `pow` tie. */
function degreeExceeds(a: Degree, b: Degree): boolean {
  if (a.pow !== b.pow) return a.pow > b.pow
  return a.log > b.log
}

function degreesEqual(a: Degree, b: Degree): boolean {
  return a.pow === b.pow && a.log === b.log
}

/**
 * `dominantPaths(G)` (Def. 2.3, Cor. 2.1): every path whose degree equals
 * the maximum. **A set, not a path**: a dominant path "need not be unique;
 * where it is not, the round may not assert that it is", so there is no
 * singular export to reach for.
 *
 * Paths whose leaf costs `0` are excluded: they contribute nothing to
 * `T(G)`, so they are not "the expensive nesting". If every path costs `0`
 * this returns the empty set.
 *
 * Compared by degree, not depth (Rem. 2.1): siblings `n` and `n³` inside an
 * outer `n`-loop give degrees 2 and 4, so `Θ(n⁴)`, never `Θ(n⁵)`.
 */
export function dominantPaths(graph: CostGraph): ReadonlyArray<CostPath> {
  const contributingPaths = paths(graph).filter((path) => path.leaf.cost !== 0)
  if (contributingPaths.length === 0) return []

  const degrees = contributingPaths.map(degreeOfPath)
  const maxDegree = degrees.reduce((max, degree) =>
    degreeExceeds(degree, max) ? degree : max
  )
  return contributingPaths.filter((path) =>
    degreesEqual(degreeOfPath(path), maxDegree)
  )
}

/** A monomial's own dimension set, as a stable, order-independent map key. */
function dimensionSetKey(monomial: Monomial): string {
  return [...dimensionsOfMonomial(monomial)].sort().join(",")
}

function isMaximalDegree(
  degree: Degree,
  maxDegreeInGroup: Degree | undefined
): boolean {
  return (
    maxDegreeInGroup !== undefined && degreesEqual(degree, maxDegreeInGroup)
  )
}

/**
 * The dominant term(s) of `T(G)` (Prop. 2.1): `dominantPaths`' comparison
 * over a cost expression's terms, for a caller holding only `T`. Distinct
 * monomials of equal degree (`n^2`, `n * m`) can tie, and every tied term is
 * returned (Def. 2.3).
 *
 * Degree is compared only **within** terms over the same dimension set:
 * `m` may grow independently of `n`, so `n^3 + m^2` keeps both terms.
 */
export function dominantTerms(cost: CostExpr): CostExpr {
  if (cost.length === 0) return []

  const maxDegreeByDimensionSet = new Map<string, Degree>()
  for (const term of cost) {
    const key = dimensionSetKey(term.monomial)
    const degree = degreeOfMonomial(term.monomial)
    const currentMax = maxDegreeByDimensionSet.get(key)
    if (currentMax === undefined || degreeExceeds(degree, currentMax)) {
      maxDegreeByDimensionSet.set(key, degree)
    }
  }

  return cost.filter((term) => {
    const key = dimensionSetKey(term.monomial)
    return isMaximalDegree(
      degreeOfMonomial(term.monomial),
      maxDegreeByDimensionSet.get(key)
    )
  })
}

/**
 * The rendered `Θ`-class of a cost expression: Prop. 2.1's derivation, and
 * the only producer of a `Θ(...)` string, so no schema holds one. Ties print
 * as a sum (the canon prefers none); coefficients are dropped (Ax. 3.1).
 * `T(G) ≡ 0` prints `Θ(0)`.
 */
export function printClass(cost: CostExpr): string {
  const dominant = dominantTerms(cost)
  if (dominant.length === 0) return "Θ(0)"
  return `Θ(${dominant.map((term) => printMonomial(term.monomial)).join(" + ")})`
}
