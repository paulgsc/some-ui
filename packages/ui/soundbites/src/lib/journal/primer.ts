import { JOURNAL_BUDGET_MAX_MS } from "@soundbites/lib/policy"

/**
 * A primer: what an agent prepared for one Build Journal episode, as the
 * phone reads it. An ordered list of cuts, each an artifact the video will
 * show and a prompt for what to say over it, with a target length; the cuts
 * play one after another, so each one's place on the video's timeline is the
 * sum of the targets before it. The agent writes it as JSON to the journal's
 * Drive folder (`Build Journal/voice/primers/`) and the phone opens it from
 * there through the file picker. Nothing here reaches Drive.
 *
 * ```json
 * {
 *   "version": 1,
 *   "title": "AMO release notes",
 *   "budgetSec": 180,
 *   "cuts": [
 *     { "id": "gap", "artifact": "Old flow's gap",
 *       "prompt": "What did 0.2.1's notes miss?", "targetSec": 30 }
 *   ]
 * }
 * ```
 *
 * `budgetSec` is optional and at most `JOURNAL_BUDGET_MAX_MS`. A cut's `id`
 * names its take's file, so it is short, lowercase and unique.
 */

/** A cut's target is a guide, never under this or over the budget. */
export const CUT_TARGET_MIN_MS = 3_000

/** More cuts than this is not a three-minute episode. */
const PRIMER_CUTS_MAX = 12

export type Cut = {
  readonly id: string
  /** What the video shows during this cut. */
  readonly artifact: string
  /** What to talk about over it. */
  readonly prompt: string
  readonly targetMs: number
}

export type Primer = {
  readonly title: string
  readonly budgetMs: number
  readonly cuts: ReadonlyArray<Cut>
}

export type PrimerReading =
  | { readonly ok: true; readonly primer: Primer }
  /** `problem` is a sentence for the person, naming what to fix. */
  | { readonly ok: false; readonly problem: string }

const CUT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

type Fields = Readonly<Record<string, unknown>>

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value * 1_000)
    : null
}

const fail = (problem: string): PrimerReading => ({ ok: false, problem })

function readCut(
  raw: unknown,
  n: number,
  budgetMs: number
): Cut | { problem: string } {
  if (!isFields(raw)) return { problem: `Cut ${n} isn't an object.` }
  const id = typeof raw.id === "string" ? raw.id : ""
  if (!CUT_ID.test(id))
    return {
      problem: `Cut ${n}'s id should be short, lowercase letters, digits or dashes.`,
    }
  const artifact = text(raw.artifact)
  if (artifact === null) return { problem: `Cut ${n} has no artifact.` }
  const prompt = text(raw.prompt)
  if (prompt === null) return { problem: `Cut ${n} has no prompt.` }
  const targetMs = seconds(raw.targetSec)
  if (targetMs === null || targetMs < CUT_TARGET_MIN_MS || targetMs > budgetMs)
    return {
      problem: `Cut ${n}'s targetSec should be between ${CUT_TARGET_MIN_MS / 1_000} and ${budgetMs / 1_000}.`,
    }
  return { id, artifact, prompt, targetMs }
}

/** Reads a primer file's text, or says what is wrong with it. */
export function readPrimer(source: string): PrimerReading {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return fail("That file isn't JSON.")
  }
  if (!isFields(raw)) return fail("That file isn't a primer.")
  if (raw.version !== 1)
    return fail("That primer's version isn't one this app reads (1).")
  const title = text(raw.title)
  if (title === null) return fail("That primer has no title.")
  const budgetMs =
    raw.budgetSec === undefined ? JOURNAL_BUDGET_MAX_MS : seconds(raw.budgetSec)
  if (budgetMs === null || budgetMs > JOURNAL_BUDGET_MAX_MS)
    return fail(`budgetSec should be at most ${JOURNAL_BUDGET_MAX_MS / 1_000}.`)
  if (!Array.isArray(raw.cuts) || raw.cuts.length === 0)
    return fail("That primer has no cuts.")
  if (raw.cuts.length > PRIMER_CUTS_MAX)
    return fail(`A primer has at most ${PRIMER_CUTS_MAX} cuts.`)
  const cuts: Array<Cut> = []
  for (const [i, each] of raw.cuts.entries()) {
    const cut = readCut(each, i + 1, budgetMs)
    if ("problem" in cut) return fail(cut.problem)
    if (cuts.some((other) => other.id === cut.id))
      return fail(`Two cuts share the id "${cut.id}".`)
    cuts.push(cut)
  }
  return { ok: true, primer: { title, budgetMs, cuts } }
}
