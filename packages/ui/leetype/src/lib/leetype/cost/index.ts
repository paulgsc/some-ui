/**
 * The cost algebra (LTY-COST, G1) — `docs/canon/complexity-witness-canon.typ`
 * Def. 2.1, Def. 2.2.
 *
 * Three constructors, one pure function: `W`/`Seq`/`Loop` build a cost graph
 * `G`, and `costOf` computes `T(G)`. Sibling control flow adds, nested
 * control flow multiplies — nothing else is in the grammar. `T` returns a
 * *symbolic* cost expression over input dimensions, never a number:
 * evaluating it at a point (admissibility) and reducing it to a dominant
 * term (the Θ-class) are later stories' jobs, not this one's. A round that
 * authors a `Θ` string instead of a graph is the exact error Prop. 2.1
 * forbids — this module is what makes the class derived instead.
 *
 * Engine-free, in the register of `lib/leetype/reading-probe`: nothing here
 * imports the wasm loader or any hook, and nothing live imports this yet.
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

// Single source for the identifier shape a dimension name must have — reused
// by `validateDimension` below so a name `dim`/`logDim` accepts is always one
// `parseFactor` can read back, which is what makes `parseMonomial` actually
// the inverse of `printMonomial` on every monomial this module can construct.
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
 * Every dimension any `Loop` in the graph repeats over (Def. 2.1: only a
 * `Loop`'s repetition expression carries a dimension — `W`'s cost is a bare
 * number). The identifiers a constraint's own `dimension` is checked
 * against (R2, #1205's own acceptance criterion: "dimension identifiers
 * are shared with the cost graph's repetition expressions").
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
 * G2 (#1210), Thm. 2.1 / Cor. 2.1 / Def. 2.3 / Rem. 2.1: `T(G)` decomposed
 * into the root-to-leaf paths whose products sum to it, and the "dominant"
 * subset among them — the structure a future renderer (#1199) points at to
 * show *which* nesting is the expensive one, rather than only naming the
 * class.
 */

/** One root-to-leaf path through a cost graph (Thm. 2.1): the `Loop` nodes traversed, root to leaf, and the `W` leaf the path ends at — actual node references, not a reduced monomial, so a caller walking `G` can identify by `===` which nodes a path passes through (what "renderable" means for this story: "the round can highlight the nesting chain that dominates"). */
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
 * `paths(G)` (Thm. 2.1): every root-to-leaf path through the graph. `Seq`
 * branches into one path set per child (disjoint union, per the theorem's
 * own proof); `Loop` prefixes its repetition onto every path through its
 * body; `W` terminates exactly one path. A graph with several `Seq`
 * siblings nested several levels deep has as many paths as leaves — not
 * the same count as `costOf`'s own `CostExpr`, which merges paths that
 * land on the same monomial (`normalizeCostExpr`) into one term.
 */
export function paths(graph: CostGraph): ReadonlyArray<CostPath> {
  return pathsOf(graph, [])
}

/** `Π_{v∈p} r_v` (Thm. 2.1): a path's own repetition monomials, multiplied — nesting still multiplies, the same rule `scaleCost` already encodes, just walked as a path instead of recursed as a tree. */
export function monomialOfPath(path: CostPath): Monomial {
  return path.loops.reduce(
    (product, loop) => multiplyMonomials(product, loop.repetition),
    ONE
  )
}

/** One path's own contribution to `T(G)`: its leaf's constant, times its monomial. Summing this over every `paths(G)` reconstructs `costOf(G)` exactly — Thm. 2.1's identity, and the two independent computations this story's own test holds against each other. */
export function costOfPath(path: CostPath): CostExpr {
  return normalizeCostExpr([
    { coefficient: path.leaf.cost, monomial: monomialOfPath(path) },
  ])
}

/**
 * A path's degree (Cor. 2.1's `Σ_v a_v`, generalized): the sum of its
 * `pow`-kind factors' exponents, primary; the sum of its `log`-kind
 * factors' exponents, secondary. Cor. 2.1's own precondition is a single
 * shared dimension with every repetition a bare power of it — where that
 * holds, `log` is `0` for every path and only `pow` ever decides.
 * `pow` alone stops being sufficient the moment a repetition legitimately
 * combines a power with a logarithm of the *same* dimension (`n * log n`,
 * a `Monomial` `Loop` already accepts): `log n` grows strictly slower
 * than any positive power of `n`, but strictly *faster* than doing
 * nothing — a path of `n * log n` genuinely dominates a same-degree path
 * of `n` alone, and comparing `pow` only would wrongly call them tied
 * (review finding on #1252). Comparing multiple *different* dimensions'
 * degrees this way (`n²` against `m³`) remains outside what this can
 * justify — that comparison depends on the relationship between `n` and
 * `m`, which nothing here knows, and stays out of scope the same way
 * non-monomial repetition expressions do (this story's own "out of
 * scope" line).
 */
type Degree = { readonly pow: number; readonly log: number }

function sumExponents(monomial: Monomial, kind: "pow" | "log"): number {
  return monomial
    .filter((factor) => factor.kind === kind)
    .reduce((total, factor) => total + factor.exponent, 0)
}

/** A monomial's own degree — `pow` primary, `log` secondary — independent of any path or graph it came from, so `dominantTerms` (below) can compare a `CostExpr`'s terms the same way `dominantPaths` compares a graph's paths. */
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
 * `dominantPaths(G)` (Def. 2.3, Cor. 2.1): the maximizing set among
 * `paths(G)` — every path whose degree equals the graph's maximum. **A
 * set, not a path**: Def. 2.3 says a dominant path "need not be unique;
 * where it is not, the round may not assert that it is" — there is
 * deliberately no singular `dominantPath(G)` export a caller could reach
 * for instead, which is what makes that rule true by construction rather
 * than by a convention every call site has to remember.
 *
 * A path whose leaf costs `0` is excluded before the comparison, never a
 * candidate for dominance regardless of degree: Thm. 2.1's own proof
 * takes "the leaf's own constant" as the product's last factor, so a
 * zero leaf makes the whole product — and the path's real contribution to
 * `T(G)` — zero (`costOfPath`'s term is dropped by `normalizeCostExpr`'s
 * own zero-coefficient filter, the same one `costOf` itself relies on). A
 * higher-degree path that contributes nothing is not "the expensive
 * nesting" Def. 2.3 means (review finding on #1252). If every path costs
 * `0`, `T(G)` is identically `0` and nothing meaningfully dominates —
 * this returns the empty set rather than picking one arbitrarily.
 *
 * Rem. 2.1's own counterexample is why this compares by degree (summed
 * exponents) rather than by depth or path length: two siblings, one `n`
 * and one `n³`, inside an outer `n`-loop, give two paths of degree 2 and
 * 4 — the degree-4 path is dominant (`Θ(n⁴)`), never a `Θ(n⁵)` a
 * depth-3-implies-cubed-again misreading would produce.
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

/**
 * G3 (#1211), Prop. 2.1: the dominant term(s) of `T(G)` itself — the same
 * degree comparison `dominantPaths` runs over a graph's paths, run instead
 * over a cost expression's own (already-summed) terms, so a caller holding
 * only `T` (no graph reference) can still find what dominates it. `T`'s
 * terms are already normalized (`normalizeCostExpr`), so two paths landing
 * on the same monomial have already been merged into one term by the time
 * this runs — but two *distinct* monomials of equal degree (`n^2` and
 * `n * m`) are not merged and can genuinely tie. Def. 2.3's "need not be
 * unique" applies here exactly as it does to `dominantPaths`, so this
 * returns every tied term rather than choosing one.
 */
export function dominantTerms(cost: CostExpr): CostExpr {
  if (cost.length === 0) return []

  const degrees = cost.map((term) => degreeOfMonomial(term.monomial))
  const maxDegree = degrees.reduce((max, degree) =>
    degreeExceeds(degree, max) ? degree : max
  )
  return cost.filter((term) =>
    degreesEqual(degreeOfMonomial(term.monomial), maxDegree)
  )
}

/**
 * The rendered `Θ`-class of a cost expression — Prop. 2.1's own "a round
 * ... derives ... its `Θ`-class. It never authors the `Θ`-class directly":
 * this is that derivation, the only function in this workspace allowed to
 * produce a `Θ(...)` string, so that no schema needs a field to hold one
 * (G3's own acceptance criterion). A genuine tie among `dominantTerms`
 * prints as a sum (canon gives no rule for preferring one tied monomial
 * over another); coefficients are dropped the same way `printMonomial`
 * already drops them, since Ax. 3.1's coarseness means a constant factor
 * was never part of the class. `T(G) ≡ 0` (every leaf costs `0`) has no
 * dominant term and prints as `Θ(0)` rather than throwing — a graph that
 * does no work at all is a legitimate, if degenerate, cost graph.
 */
export function printClass(cost: CostExpr): string {
  const dominant = dominantTerms(cost)
  if (dominant.length === 0) return "Θ(0)"
  return `Θ(${dominant.map((term) => printMonomial(term.monomial)).join(" + ")})`
}
