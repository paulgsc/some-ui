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
