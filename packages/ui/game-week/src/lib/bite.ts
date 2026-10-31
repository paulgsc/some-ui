/**
 * A bite as home is told it (GW4, paulgsc/server GWB5 `SaidBite`): every
 * field set on the phone, at the moment the bite is kept, from what the
 * screen showed when talking started. Pure.
 *
 * The fields travel as the query of the voice note that carries the audio
 * (`PUT /voice-notes/:id?of=game&ref=<game>&at=<kept>&…`), so they are kept
 * with the bite as the strings home reads, and nothing on the way home has
 * to know what a bite is.
 */
import type { ScenarioId } from "@some-ui/game-scenarios"
import { CATALOG_VERSION } from "@some-ui/game-scenarios"

import type { ModeId } from "./modes"

/** How the bite was said: what the person tapped to say it. */
export type BiteHow =
  | "offered"
  | "just-happened"
  | "said-first"
  | "every-scenario"

/** What the bite is about, as far as the person said. */
export type Said =
  | { readonly how: "said-first" }
  | {
      readonly how: Exclude<BiteHow, "said-first">
      readonly scenario: ScenarioId
      /** The card's live detail; empty when it had none. */
      readonly context: string
    }

/** What the screen showed, and how the phone stood, when talking started. */
export type BiteMoment = {
  readonly gameId: string
  /** The offer on screen, or null when there was none (away). */
  readonly seq: number | null
  /** The live strip as shown, empty when there was none. */
  readonly strip: string
  readonly watching: boolean
  readonly mode: ModeId
  /**
   * Home's clock minus the phone's, in milliseconds, as the live socket last
   * measured it; null when it never has (GW5).
   */
  readonly offsetMs: number | null
}

/** Home's limit on the strip and the context line (`MAX_LINE_CHARS`). */
export const MAX_LINE_CHARS = 500

/** A bite kept on the phone until home holds it. */
export type KeptBite = {
  readonly id: string
  /** ESPN's id for the game. */
  readonly gameId: string
  /** When it was kept, ISO 8601. */
  readonly at: string
  readonly contentType: string
  readonly durationMs: number
  /** The query home reads it by (`biteFields`). */
  readonly fields: Readonly<Record<string, string>>
  /**
   * Not offered home before this (milliseconds since the epoch): the
   * moments Undo, and the question of what a bite said first was about,
   * are still open.
   */
  readonly holdUntil: number
}

/** `text` as one line home keeps: control characters gone, at most 500. */
export function line(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what home refuses in a line
  return [...text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")]
    .slice(0, MAX_LINE_CHARS)
    .join("")
}

/**
 * The bite's fields, by home's names: `how`, `strip`, `watching`,
 * `started`, `mode` and `catalog` always; `scenario` whenever `said` names
 * one (every bite but one said first); `seq` and `context` when there was
 * one; `offset` (home's clock minus the phone's, whole milliseconds) once
 * the live socket has measured it (GW5).
 */
export function biteFields(
  said: Said,
  moment: BiteMoment,
  startedAt: number
): Record<string, string> {
  const fields: Record<string, string> = { how: said.how }
  if (said.how !== "said-first") {
    fields.scenario = said.scenario
    const context = line(said.context)
    if (context !== "") fields.context = context
  }
  if (moment.seq !== null) fields.seq = String(moment.seq)
  fields.strip = line(moment.strip)
  fields.watching = moment.watching ? "1" : "0"
  fields.started = new Date(startedAt).toISOString()
  if (moment.offsetMs !== null)
    fields.offset = String(Math.round(moment.offsetMs))
  fields.mode = moment.mode
  fields.catalog = String(CATALOG_VERSION)
  return fields
}

/**
 * A bite said first, once what it was about is picked after it
 * (paulgsc/server#536): the picked card's `scenario` and `context`, and
 * `how` still `said-first`. Left for later, it keeps the fields it was
 * kept with, which name no scenario.
 */
export function pickedAfter(
  picked: Said,
  moment: BiteMoment,
  startedAt: number
): Record<string, string> {
  return { ...biteFields(picked, moment, startedAt), how: "said-first" }
}
