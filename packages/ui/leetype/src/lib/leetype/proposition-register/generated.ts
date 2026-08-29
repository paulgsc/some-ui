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
    status: "active",
  },
  "CW-P2": {
    id: "CW-P2",
    title: "Nested repetition multiplies",
    status: "active",
  },
  "CW-P3": {
    id: "CW-P3",
    title: "The dominant term survives",
    status: "active",
  },
  "CW-P4": {
    id: "CW-P4",
    title: "A bound change does not change the class",
    status: "active",
  },
  "CW-P5": {
    id: "CW-P5",
    title: "Preprocessing substitutes space for repeated search",
    status: "active",
  },
  "CW-P6": {
    id: "CW-P6",
    title: "Ordering substitutes a logarithm for a scan",
    status: "active",
  },
  "CW-P7": {
    id: "CW-P7",
    title: "Sorting collapses pairwise comparison",
    status: "active",
  },
  "CW-P8": {
    id: "CW-P8",
    title: "An early exit does not change the worst case",
    status: "active",
  },
  "CW-P9": {
    id: "CW-P9",
    title: "Triangular iteration is a constant factor",
    status: "active",
  },
  "CW-P10": {
    id: "CW-P10",
    title: "Amortization is a claim about a sequence",
    status: "active",
  },
  "CW-P11": {
    id: "CW-P11",
    title: "Only the dominant path matters",
    status: "active",
  },
  "CW-P12": {
    id: "CW-P12",
    title: "Loop depth is not the exponent",
    status: "active",
  },
  "CW-P13": {
    id: "CW-P13",
    title: "Expected-case membership is not worst-case membership",
    status: "active",
  },
  "CW-P14": {
    id: "CW-P14",
    title: "Two input dimensions do not collapse into one",
    status: "active",
  },
  "CW-P15": {
    id: "CW-P15",
    title: "A recurrence is not a loop nest",
    status: "active",
  },
  "CW-P16": {
    id: "CW-P16",
    title: "A cost independent of the bounds is not a constraint problem",
    status: "active",
  },
}
