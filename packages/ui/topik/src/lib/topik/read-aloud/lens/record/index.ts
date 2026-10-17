/**
 * The grammar-lens record (adaptive-learning canon Rem. 4.18): one entry per
 * closed item, written for the learner's own agent to read in the export.
 * Nothing on the device reads it back (Rem. 4.15, Rem. 4.17).
 *
 * - An item's outcome is an observation (Def. 3.1): what was shown, what was
 *   answered, whether it was right or expired, and when.
 * - The sealed checks ride with it as text: the step-down's questions and
 *   answers and the rung it stopped on, and the situation chosen.
 * - An answer is rushed when it came sooner than reading the line, and the
 *   cue when it was shown, at twice the level's read-aloud rate (Rem. 4.17,
 *   Cor. 4.6 (ii)); a session is racing once three of its last five answers
 *   were rushed, and stays so.
 */

import { assertNever } from "@some-ui/core-utils"
import type {
  CueModality,
  LensItem,
  Probe,
} from "@topik/lib/topik/read-aloud/lens/items"
import { shownMistakes } from "@topik/lib/topik/read-aloud/lens/items"
import type {
  LensOutcome,
  StepDownEnd,
} from "@topik/lib/topik/read-aloud/lens/machine"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { LEVEL_RATE, syllablesOf } from "@topik/lib/topik/read-aloud/timing"

export type LensRecordEntry = {
  /** The session it was answered in: when that session began, as ISO. */
  session: string
  /** The line it asked about. */
  line: string
  /** When it was shown, as ISO; with `session` and `line`, its identity. */
  shownAt: string
  /** When it closed, as ISO: the observation's time, and its expiry's start. */
  closedAt: string
  cue: CueModality | null
  shape: "pick" | "judge-misform" | "judge-authored"
  /** The candidate's surface, the word tapped as shown, "looks right", or null. */
  answer: string | null
  right: boolean
  expired: boolean
  /** The catalogue entries it showed, and the one chosen, if a misform was. */
  shown: Array<MistakeId>
  chosen: MistakeId | null
  /** From its showing to its answer, its pauses left out. */
  answerMs: number | null
  rushed: boolean | null
  /** Whether its session was racing by then (Rem. 4.17); it stays so. */
  racing: boolean
  stepDown: {
    /** Each question asked, its word if it names one, and the answer as text. */
    asked: Array<{
      rung: number
      kind: Probe["kind"]
      word: string | null
      answer: string
      right: boolean
    }>
    /** How it ended; "left" when the session ended or was left during it. */
    end: StepDownEnd | "left"
    /** The rung it stopped on rightly; 0 when it ran out; else null. */
    floor: number | null
  } | null
  situation: { chosen: string | null; intended: boolean | null } | null
  /** The learner's takes of the line (Rem. 4.16), as counts, never audio. */
  take: { count: number; lastMs: number; heardFirst: boolean } | null
}

/** Rem. 4.17's threshold for the item as it was shown. */
export function rushFloorMs(item: LensItem, cueShown: boolean): number {
  const syllables =
    syllablesOf(item.korean) +
    (cueShown && item.cue ? syllablesOf(item.cue.korean) : 0)
  return (syllables * 1000) / (2 * LEVEL_RATE[item.level])
}

function answerText(item: LensItem, outcome: LensOutcome): string | null {
  const { answer } = outcome
  const { shape } = item
  if (answer === null) return null
  if (answer.kind === "fine") return "looks right"
  if (answer.kind === "word") {
    // As tapped: a judge's misformed word showed its misform.
    return shape.kind === "judge" && shape.misform?.word === answer.word
      ? shape.misform.surface
      : (item.words[answer.word] ?? null)
  }
  return shape.kind === "pick"
    ? (shape.candidates[answer.candidate]?.surface ?? null)
    : null
}

/** A step-down question, and its answer as the learner saw it. */
function askedOf(
  item: LensItem,
  probe: Probe,
  answer: string
): { word: string | null; answer: string } {
  switch (probe.kind) {
    case "tense": {
      return { word: probe.word, answer }
    }
    case "split": {
      const cut = Number(answer)
      return {
        word: probe.word,
        answer: `${probe.word.slice(0, cut)}|${probe.word.slice(cut)}`,
      }
    }
    case "subject":
    case "object":
    case "verb": {
      return { word: null, answer: item.words[Number(answer)] ?? answer }
    }
    default: {
      return assertNever(probe)
    }
  }
}

/**
 * The entry for an item, closed or left. `audio`: whether its cue was heard,
 * speech having begun to say it; a cue never voiced was read. `earlier`: its session's entries before it, for `racing`.
 */
export function recordEntry(
  item: LensItem,
  outcome: LensOutcome,
  {
    session,
    closedAt,
    audio,
    earlier,
    take,
  }: {
    session: string
    closedAt: number
    audio: boolean
    earlier: ReadonlyArray<LensRecordEntry>
    take: LensRecordEntry["take"]
  }
): LensRecordEntry {
  const { shape } = item
  const cue = item.cue ? (audio ? item.cue.modality : "glyph") : null
  const answerMs =
    outcome.answeredAt === null || outcome.expired
      ? null
      : outcome.answeredAt - outcome.shownAt - outcome.pausedMs
  const rushed =
    answerMs === null ? null : answerMs < rushFloorMs(item, cue !== "audio")
  // A miss with questions to ask entered the step-down; closed before it
  // ended, it was left.
  const steppedDown =
    outcome.answer !== null && !outcome.right && item.probes.length > 0
  const shown = shownMistakes(item)
  const situations = item.situations
  return {
    session,
    line: item.lineId,
    shownAt: new Date(outcome.shownAt).toISOString(),
    closedAt: new Date(closedAt).toISOString(),
    cue,
    shape:
      shape.kind === "pick"
        ? "pick"
        : shape.misform
          ? "judge-misform"
          : "judge-authored",
    answer: answerText(item, outcome),
    right: outcome.right,
    expired: outcome.expired,
    shown,
    chosen: outcome.chosen,
    answerMs,
    rushed,
    racing:
      earlier.some((entry) => entry.racing) || racing([...earlier, { rushed }]),
    stepDown: steppedDown
      ? {
          asked: outcome.probes.flatMap(({ rung, answer, right }, index) => {
            const probe = item.probes[index]
            return probe
              ? [
                  {
                    rung,
                    kind: probe.kind,
                    ...askedOf(item, probe, answer),
                    right,
                  },
                ]
              : []
          }),
          end: outcome.stepDown ?? "left",
          floor: outcome.floor,
        }
      : null,
    situation: outcome.situation
      ? {
          chosen:
            outcome.situation.chosen === null
              ? null
              : (situations?.options[outcome.situation.chosen] ?? null),
          intended:
            outcome.situation.chosen === null
              ? null
              : outcome.situation.chosen === situations?.intended,
        }
      : null,
    take,
  }
}

/** Rem. 4.17: three of a session's last five answers rushed, at any point. */
export function racing(
  entries: ReadonlyArray<Pick<LensRecordEntry, "rushed">>
): boolean {
  const answered = entries.filter((entry) => entry.rushed !== null)
  return answered.some((_, index) => {
    const window = answered.slice(Math.max(0, index - 4), index + 1)
    return window.filter((entry) => entry.rushed).length >= 3
  })
}
