import type { PropositionRegisterEntry } from "./parse-canon"

export type Citation = {
  readonly id: string
  readonly file: string
  readonly line: number
}

function locate(citation: Citation): string {
  return `${citation.file}:${citation.line}`
}

/**
 * Failure mode 1 of Rem. 7.1: every `CW-P` identifier cited anywhere
 * resolves against the register. Two distinct violation kinds, on
 * purpose — a dangling id is very likely a typo, while a retired id is a
 * real register entry that should no longer be cited (Amendment protocol
 * rule 2); conflating the two messages would make the fix non-obvious.
 *
 * A retired id still resolves here (it is a real key in `register`, so it
 * is never reported as dangling) — the union that generates `register`'s
 * keys never removes a retired id (Rem. 7.1/7.2), which is what "old ones
 * resolving" means structurally: existing code citing a since-retired
 * proposition keeps type-checking and keeps finding real register text at
 * runtime. This check still flags the citation itself, distinctly from a
 * dangling one, because Amendment protocol rule 2 expects a retiring
 * amendment to update any citation it retires in the same change.
 */
export function checkCitations(
  citations: ReadonlyArray<Citation>,
  register: Readonly<Record<string, PropositionRegisterEntry>>
): Array<string> {
  const violations: Array<string> = []
  for (const citation of citations) {
    const entry = register[citation.id]
    if (entry === undefined) {
      violations.push(
        `${locate(citation)}: "${citation.id}" is not in the proposition register (docs/canon/complexity-witness-canon.typ §7) — dangling citation.`
      )
      continue
    }
    if (entry.status === "retired") {
      violations.push(
        `${locate(citation)}: "${citation.id}" (${entry.title}) is retired — cite the proposition that superseded it instead (docs/canon/complexity-witness-canon.typ, Amendment protocol).`
      )
    }
  }
  return violations
}

/**
 * Failure mode 2 of Rem. 7.1: a register entry marked instantiable (i.e.
 * active — a retired entry, Rem. 7.3, is exempt) with no corpus instance.
 *
 * Not yet wired against real data in CI: R4 (#1207, `types/round.ts`) has
 * landed a `μ` mapping as code (`DiffSetMember.propositionId`), but no live
 * corpus data holds one yet — nothing outside R4's own tests constructs a
 * `DiffSet` today — so there is still no real source for `instantiatedIds`.
 * Proven here by test fixture per B1's own acceptance criteria
 * (`citation-check.test.ts`); #1208 R5 — explicitly out of scope for B1 —
 * is where this becomes load-bearing against the real corpus, reading the
 * register this function already exposes.
 */
export function checkRegisterCoverage(
  instantiatedIds: ReadonlySet<string>,
  register: Readonly<Record<string, PropositionRegisterEntry>>
): Array<string> {
  const violations: Array<string> = []
  for (const entry of Object.values(register)) {
    if (entry.status === "active" && !instantiatedIds.has(entry.id)) {
      violations.push(
        `${entry.id} (${entry.title}) is an active proposition register entry with no corpus instance.`
      )
    }
  }
  return violations
}
