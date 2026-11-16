/**
 * What home made of a take it heard (HEARD1, paulgsc/server#908): its
 * verdict, and the problem codes a take that needs the owner's attention is
 * listed under (HEARD3, #3075). Pure; the words are `./words`', the screen is
 * `components/take-reconcile`.
 *
 * - **One code each, never one bucket** (owner, #3070: "we don't want to
 *   call out all error codes under one thing"). Garbled takes carry any of
 *   `GARBLED_CODES`, failed ones one of `FAILED_CODES`, and a take home
 *   heard nothing said in is its own code. A code a newer home names that
 *   this phone doesn't know reads as its verdict's own (`garbled`,
 *   `failed`), so no take is left out for a word the phone lacks.
 * - **A take says every code it carries,** in `CODES`' order, and is
 *   listed under the first of them (C440).
 */

import { assertNever } from "@some-ui/core-utils"

/** Why home couldn't make out what it heard. */
export const GARBLED_CODES = [
  "low_confidence",
  "repetitive",
  "no_speech",
  "off_language",
  "sparse",
] as const

/** Why home never heard a take. */
export const FAILED_CODES = [
  "unreadable",
  "too_long",
  "deadline",
  "engine",
] as const

/**
 * Every code a take can be listed under, in the order the page shows them:
 * what home couldn't make out, what it heard nothing in, what it never
 * heard. `garbled` and `failed` stand for a reason this phone doesn't know.
 */
export const CODES = [
  ...GARBLED_CODES,
  "garbled",
  "nothing_said",
  ...FAILED_CODES,
  "failed",
] as const

export type ProblemCode = (typeof CODES)[number]

/** What home made of a take's transcript. */
type VerdictKind = "heard" | "garbled" | "nothing_said" | "failed"

/** Home's verdict on a take, as every read of what it heard carries it. */
export type TakeVerdict = {
  readonly kind: VerdictKind
  /** Home's codes for why: empty for heard and nothing said. */
  readonly reasons: ReadonlyArray<string>
  /** Which thresholds judged it (`heard-1`). */
  readonly rule: string
  /**
   * The languages home detected and expected, for a take heard: what the
   * page can say of a take heard in another language. Null when home sent
   * no signals (a take that failed, or nothing said).
   */
  readonly language: {
    readonly heard: string
    readonly expected: string | null
  } | null
}

/**
 * The codes `verdict` lists a take under, in `CODES`' order: none for a
 * take home heard, or one it hasn't judged.
 */
export function codesOf(
  verdict: TakeVerdict | null | undefined
): ReadonlyArray<ProblemCode> {
  if (verdict === null || verdict === undefined) return []
  switch (verdict.kind) {
    case "heard": {
      return []
    }
    case "nothing_said": {
      return ["nothing_said"]
    }
    case "garbled":
    case "failed": {
      const known: ReadonlyArray<string> =
        verdict.kind === "garbled" ? GARBLED_CODES : FAILED_CODES
      const unknown = verdict.reasons.some((reason) => !known.includes(reason))
      const said = new Set(
        verdict.reasons.filter((reason) => known.includes(reason))
      )
      if (unknown || said.size === 0) said.add(verdict.kind)
      return CODES.filter((code) => said.has(code))
    }
    default: {
      return assertNever(verdict.kind)
    }
  }
}

/** One code's place on the page: the takes listed first under it. */
export type CodeGroup<T> = {
  readonly code: ProblemCode
  readonly takes: ReadonlyArray<T>
}

/**
 * The takes needing attention, one group per code in `CODES`' order, each
 * take in the group of its first code; a take with no code is left out.
 * Each group keeps the order the takes came in.
 */
export function groupByCode<T>(
  takes: ReadonlyArray<T>,
  codes: (take: T) => ReadonlyArray<ProblemCode>
): ReadonlyArray<CodeGroup<T>> {
  const groups = new Map<ProblemCode, Array<T>>()
  for (const take of takes) {
    const first = codes(take)[0]
    if (first === undefined) continue
    const group = groups.get(first) ?? []
    group.push(take)
    groups.set(first, group)
  }
  return CODES.flatMap((code) => {
    const group = groups.get(code)
    return group === undefined ? [] : [{ code, takes: group }]
  })
}

/**
 * How many takes carry each code, for the chips: a take with two codes
 * counts under both, so tapping a chip shows as many as it says.
 */
export function codeCounts<T>(
  takes: ReadonlyArray<T>,
  codes: (take: T) => ReadonlyArray<ProblemCode>
): ReadonlyArray<{ readonly code: ProblemCode; readonly count: number }> {
  return CODES.flatMap((code) => {
    const count = takes.filter((take) => codes(take).includes(code)).length
    return count === 0 ? [] : [{ code, count }]
  })
}
