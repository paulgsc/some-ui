// GENERATED FILE — do not hand-edit.
//
// Produced by `pnpm --filter @some-ui/leetype run generate:proposition-register`
// by parsing `docs/canon/complexity-witness-canon.typ` §7 (the proposition
// register, Def. 1.5, Rem. 7.1) — a second, hand-maintained list of `CW-P`
// ids is exactly the drift Rem. 7.2 warns against, so this file exists to
// be the only one. `scripts/check-proposition-citations.ts` fails CI if
// this file drifts from what the canon generates today.

import type { PropositionRegisterEntry } from "./parse-canon"

export type PropositionId =
  | "CW-P1"
  | "CW-P2"
  | "CW-P3"
  | "CW-P4"
  | "CW-P5"
  | "CW-P6"
  | "CW-P7"
  | "CW-P8"
  | "CW-P9"
  | "CW-P10"
  | "CW-P11"
  | "CW-P12"
  | "CW-P13"
  | "CW-P14"
  | "CW-P15"
  | "CW-P16"

export const PROPOSITION_REGISTER: Readonly<
  Record<PropositionId, PropositionRegisterEntry>
> = {
  "CW-P1": {
    id: "CW-P1",
    title: "Sequential composition adds",
    statement:
      "Sibling control flow executed in sequence contributes the sum of its members' costs: T(Seq(G_1, ..., G_m)) = sum_i T(G_i).",
    status: "active",
  },
  "CW-P2": {
    id: "CW-P2",
    title: "Nested repetition multiplies",
    statement:
      "A body enclosed in a repetition contributes the product of the repetition count and the body's cost: T(Loop(r, G)) = r · T(G).",
    status: "active",
  },
  "CW-P3": {
    id: "CW-P3",
    title: "The dominant term survives",
    statement:
      "A finite sum of terms in one input dimension is Θ of its largest: sum_j n^(a_j) = Θ(n^(max_j a_j)).",
    status: "active",
  },
  "CW-P4": {
    id: "CW-P4",
    title: "A bound change does not change the class",
    statement:
      "Raising or lowering a bound in C leaves T as a function unchanged; it changes only whether T_A (C) ≤ B holds. (Thm. 3.1, Cor. 3.1.)",
    status: "active",
  },
  "CW-P5": {
    id: "CW-P5",
    title: "Preprocessing substitutes space for repeated search",
    statement:
      "Replacing a repeated linear search inside a loop with one preprocessing pass plus expected constant-time membership rewrites n m into n + m expected, at Θ(m) additional space.",
    status: "active",
  },
  "CW-P6": {
    id: "CW-P6",
    title: "Ordering substitutes a logarithm for a scan",
    statement:
      "Sorting one collection once and binary-searching it per query rewrites n m into m log m + n log m, without the space of CW-P5 and without its dependence on expected-case hashing.",
    status: "active",
  },
  "CW-P7": {
    id: "CW-P7",
    title: "Sorting collapses pairwise comparison",
    statement:
      "A comparison over all pairs that is answerable from adjacency in sorted order rewrites n^2 into n log n + n = Θ(n log n).",
    status: "active",
  },
  "CW-P8": {
    id: "CW-P8",
    title: "An early exit does not change the worst case",
    statement:
      "A return inside a loop improves the best case and leaves the worst-case cost graph unchanged. Admissibility (Def. 3.1) is a worst-case relation, so an early exit cannot restore it. It says nothing about the typical case without an input distribution and a reason the exit condition fires early under it: an exit that triggers only on the final iteration, or almost never, leaves typical cost untouched. A round asserting a typical-case improvement is asserting something about the inputs, and owes that assumption explicitly.",
    status: "active",
  },
  "CW-P9": {
    id: "CW-P9",
    title: "Triangular iteration is a constant factor",
    statement:
      "sum_(i<n) (n - i) = n(n-1)/2 = Θ(n^2). Iterating only the upper triangle halves the work and does not change the class.",
    status: "active",
  },
  "CW-P10": {
    id: "CW-P10",
    title: "Amortization is a claim about a sequence",
    statement:
      "An amortized bound constrains the total cost of a sequence of operations and does not bound any single operation. A per-operation worst case may exceed the amortized figure without contradicting it.",
    status: "active",
  },
  "CW-P11": {
    id: "CW-P11",
    title: "Only the dominant path matters",
    statement:
      "A rewrite confined to nodes off every dominant path cannot change Θ(T), however much code it touches. (Prop. 5.1.)",
    status: "active",
  },
  "CW-P12": {
    id: "CW-P12",
    title: "Loop depth is not the exponent",
    statement:
      "Nesting depth k implies O(n^k) only when every level contributes Θ(n). In general the exponent is the maximum over root-to-leaf paths of the sum of that path's loop exponents. (Cor. 2.1, Rem. 2.1.)",
    status: "active",
  },
  "CW-P13": {
    id: "CW-P13",
    title: "Expected-case membership is not worst-case membership",
    statement:
      "Hash-based membership is expected O(1) and worst-case O(m); a rewrite relying on it (CW-P5) trades a worst-case guarantee for an expected one, and that trade is part of what the rewrite witnesses.",
    status: "active",
  },
  "CW-P14": {
    id: "CW-P14",
    title: "Two input dimensions do not collapse into one",
    statement:
      "n + m and n m are distinct, and neither is Θ(n^2) unless a constraint relates m to n. A cost expression over two dimensions evaluated as though there were one is the most common source of a wrong admissibility verdict in practice.",
    status: "active",
  },
  "CW-P15": {
    id: "CW-P15",
    title: "A recurrence is not a loop nest",
    statement:
      "The cost of a recursive procedure is the solution of its recurrence over its call tree; reading its source's visible loop nesting as the exponent is invalid. Loop in Def. 2.1 does not model recursion, and a round about recursion must author its recurrence rather than pretend a nest.",
    status: "active",
  },
  "CW-P16": {
    id: "CW-P16",
    title: "A cost independent of the bounds is not a constraint problem",
    statement:
      'A term of T that does not vary with any dimension C bounds — a fixed setup cost, an unbounded wait, work in a dimension C says nothing about — is unaffected by every assignment of those bounds. If such a term already exceeds B, no constraint diff makes the program admissible, and the failure is of a different kind from "too slow at this size."',
    status: "active",
  },
}
