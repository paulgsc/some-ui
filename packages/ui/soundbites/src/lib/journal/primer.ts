import { JOURNAL_BUDGET_MAX_MS } from "@soundbites/lib/policy"

/**
 * A primer: what an agent prepared for one Build Journal episode, as the
 * phone reads it. An ordered list of cuts, each an artifact the video will
 * show and what to say over it, with a target length; the cuts
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
 * Version 2 (STUDIO ST2) runs up to six minutes and 24 cuts, and says how
 * each cut is voiced. A cut has a `point` (what to make the case for), an
 * optional `line` (words to read), and `keep`, the facts a take may neither
 * drop nor contradict. The primer's `voice` plan is `ad-lib` (the default:
 * say the point in your own words), `read` (read each line) or `mixed` (read
 * the cuts that have a line); a cut's own `voice` overrides it:
 *
 * ```json
 * {
 *   "version": 2,
 *   "title": "Playoff Delta, week 8",
 *   "voice": "ad-lib",
 *   "cuts": [
 *     { "id": "path", "artifact": "The path card",
 *       "point": "Following the model paid off this week",
 *       "keep": ["3 of 4 picks hit"], "targetSec": 40 }
 *   ]
 * }
 * ```
 *
 * A version 1 primer reads as it always did: at most three minutes and 12
 * cuts, each cut's `prompt` its line, read word for word.
 *
 * `budgetSec` is optional and at most the version's longest. A cut's `id`
 * names its take's file, so it is short, lowercase and unique.
 */

/** A cut's target is a guide, never under this or over the budget. */
export const CUT_TARGET_MIN_MS = 3_000

/** The longest and the most cuts each version allows. */
const LIMITS = {
  1: { budgetMs: 180_000, cuts: 12 },
  2: { budgetMs: JOURNAL_BUDGET_MAX_MS, cuts: 24 },
} as const

/** How the whole episode is voiced. */
type VoicePlan = "ad-lib" | "read" | "mixed"

/** How one cut is voiced: in your own words, or word for word. */
type CutVoice = "ad-lib" | "read"

export type Cut = {
  readonly id: string
  /** What the video shows during this cut. */
  readonly artifact: string
  /** What to make the case for. */
  readonly point: string
  /** Words to read, when there are any. */
  readonly line: string | null
  /** Facts a take may neither drop nor contradict. */
  readonly keep: ReadonlyArray<string>
  readonly voice: CutVoice
  /** What the Record screen asks for: the line when read, else the point. */
  readonly prompt: string
  readonly targetMs: number
}

export type Primer = {
  readonly title: string
  readonly budgetMs: number
  readonly voice: VoicePlan
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

function texts(value: unknown): ReadonlyArray<string> | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const all = value.map(text)
  return all.every((t): t is string => t !== null) ? all : null
}

const isVoicePlan = (value: unknown): value is VoicePlan =>
  value === "ad-lib" || value === "read" || value === "mixed"

const isCutVoice = (value: unknown): value is CutVoice =>
  value === "ad-lib" || value === "read"

function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value * 1_000)
    : null
}

const fail = (problem: string): PrimerReading => ({ ok: false, problem })

/** A version 1 cut: its prompt is a line, read word for word. */
export function cutV1(fields: {
  readonly id: string
  readonly artifact: string
  readonly prompt: string
  readonly targetMs: number
}): Cut {
  const { id, artifact, prompt, targetMs } = fields
  return {
    id,
    artifact,
    point: prompt,
    line: prompt,
    keep: [],
    voice: "read",
    prompt,
    targetMs,
  }
}

function readCut(
  raw: unknown,
  n: number,
  version: 1 | 2,
  plan: VoicePlan,
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
  const targetMs = seconds(raw.targetSec)
  if (targetMs === null || targetMs < CUT_TARGET_MIN_MS || targetMs > budgetMs)
    return {
      problem: `Cut ${n}'s targetSec should be between ${CUT_TARGET_MIN_MS / 1_000} and ${budgetMs / 1_000}.`,
    }
  if (version === 1) {
    const prompt = text(raw.prompt)
    if (prompt === null) return { problem: `Cut ${n} has no prompt.` }
    return cutV1({ id, artifact, prompt, targetMs })
  }
  const point = text(raw.point)
  if (point === null) return { problem: `Cut ${n} has no point.` }
  const line = raw.line === undefined ? null : text(raw.line)
  if (raw.line !== undefined && line === null)
    return { problem: `Cut ${n}'s line is empty.` }
  const keep = texts(raw.keep)
  if (keep === null)
    return {
      problem: `Cut ${n}'s keep should be a list of facts, each written out.`,
    }
  if (raw.voice !== undefined && !isCutVoice(raw.voice))
    return { problem: `Cut ${n}'s voice should be ad-lib or read.` }
  const voice: CutVoice = isCutVoice(raw.voice)
    ? raw.voice
    : plan === "mixed"
      ? line === null
        ? "ad-lib"
        : "read"
      : plan
  if (voice === "read" && line === null)
    return { problem: `Cut ${n} is read word for word but has no line.` }
  return {
    id,
    artifact,
    point,
    line,
    keep,
    voice,
    prompt: voice === "read" && line !== null ? line : point,
    targetMs,
  }
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
  const version = raw.version
  if (version !== 1 && version !== 2)
    return fail("That primer's version isn't one this app reads (1 or 2).")
  const limits = LIMITS[version]
  const title = text(raw.title)
  if (title === null) return fail("That primer has no title.")
  const budgetMs =
    raw.budgetSec === undefined ? limits.budgetMs : seconds(raw.budgetSec)
  if (budgetMs === null || budgetMs > limits.budgetMs)
    return fail(`budgetSec should be at most ${limits.budgetMs / 1_000}.`)
  const voice =
    version === 1 ? "read" : raw.voice === undefined ? "ad-lib" : raw.voice
  if (!isVoicePlan(voice))
    return fail("The primer's voice should be ad-lib, read or mixed.")
  if (!Array.isArray(raw.cuts) || raw.cuts.length === 0)
    return fail("That primer has no cuts.")
  if (raw.cuts.length > limits.cuts)
    return fail(`A primer has at most ${limits.cuts} cuts.`)
  const cuts: Array<Cut> = []
  for (const [i, each] of raw.cuts.entries()) {
    const cut = readCut(each, i + 1, version, voice, budgetMs)
    if ("problem" in cut) return fail(cut.problem)
    if (cuts.some((other) => other.id === cut.id))
      return fail(`Two cuts share the id "${cut.id}".`)
    cuts.push(cut)
  }
  return { ok: true, primer: { title, budgetMs, voice, cuts } }
}
