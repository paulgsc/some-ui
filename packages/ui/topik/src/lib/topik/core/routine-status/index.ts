/**
 * What the handheld says of the reflections routine (`adapter/routine-runs`):
 * when it last ran, whether it brought anything new, and whether it has gone
 * quiet. Pure, and the one place those words live, so they stay in the
 * person's terms: what the routine did and what this phone holds, never how
 * it travels (`index.test.ts`).
 *
 * The phone can say the routine went quiet only from what home told it after
 * the run was due: a look made before then, away from home, says only when
 * it last looked.
 *
 * Two axes, never folded into one: the shape says what the last run did,
 * and `voice` says, beside it, what became of the voice notes in what it
 * found. Each state on either axis has its own mark and its own words.
 */

import { counted, dayWords } from "@some-ui/core-utils"
import { routineKey } from "@topik/lib/topik/adapter/routine-files"
import type {
  HeldRuns,
  RoutineRun,
} from "@topik/lib/topik/adapter/routine-runs"

export type RoutineShape =
  /** Something it added is not opened yet. */
  | "fresh"
  /** It ran and everything it added is opened. */
  | "opened"
  /** It ran and had nothing to answer. */
  | "rested"
  /** No run is known yet. */
  | "unheard"
  /** Home has heard of no run since the last one was due. */
  | "quiet"
  /** Its last run answered some of what it found and left the rest. */
  | "partly"
  /** Its last run ended early. */
  | "stopped"
  /** Its run is due, and this phone hasn't looked at home since. */
  | "away"

/** What became of the voice notes in what the last run found. */
export type VoiceShape =
  /** Something waits for home to hear its voice note. */
  | "waiting"
  /** Something was answered without a voice note home never heard. */
  | "missed"
  /** The run couldn't read what home heard, so every voice note waits. */
  | "unread"

export type VoiceView = { shape: VoiceShape; line: string }

export type RoutineView = {
  shape: RoutineShape
  /** Beside the mark: a word or two. */
  word: string
  /** The sentence the mark stands for. */
  line: string
  /** One per voice state the last run reported, in `VOICE_ORDER`; none when it reported none. */
  voice: ReadonlyArray<VoiceView>
}

/** The voice marks in the order they show. */
export const VOICE_ORDER: ReadonlyArray<VoiceShape> = [
  "unread",
  "missed",
  "waiting",
]

/** A run is due again a day and two hours after it started, unless it says otherwise. */
const DUE_AFTER_MS = 26 * 60 * 60 * 1000

/** An instant as a person says it beside `today`: "today at 9:02". */
function when(iso: string, today: string): string {
  const time = new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${dayWords(iso, today)} at ${time}`
}

const dueBy = (run: RoutineRun): string =>
  run.nextBy ??
  new Date(new Date(run.startedAt).getTime() + DUE_AFTER_MS).toISOString()

/** "a drama", "2 dramas", or null for none. */
const some = (n: number, noun: string): string | null =>
  n === 0 ? null : n === 1 ? `a ${noun}` : counted(n, noun)

const joined = (parts: ReadonlyArray<string | null>): string =>
  parts.filter((part) => part !== null).join(" and ")

/** "2 word sets and a drama". */
function whatOf(added: RoutineRun["added"]): string {
  const scenes = added.filter((file) => file.folder === "scene").length
  return joined([
    some(scenes, "word set"),
    some(added.length - scenes, "drama"),
  ])
}

/** "2 reflections and a drama prompt", or null for nothing. */
function foundOf(found: RoutineRun["found"]): string | null {
  const parts = [
    some(found.reflections, "reflection"),
    some(found.prompts, "drama prompt"),
  ]
  return parts.every((part) => part === null) ? null : joined(parts)
}

export const ROUTINE_WORDS = {
  title: "The routine",
  /** The mark's button name: what it opens. */
  open: (view: RoutineView): string =>
    [`The routine: ${view.line}`, ...view.voice.map((v) => v.line)].join(" "),
  what: "Each morning the routine answers what you shared: a word set for each study reflection, a drama for each drama prompt. With nothing new to answer, it adds nothing.",
  history: "Its runs",
  legend: "What the mark says",
  done: "Done",
  kept: (since: string, today: string): string =>
    `Kept on this phone, as home told it, since ${dayWords(since, today)}.`,
  /** Each shape, as the legend says it. */
  shapes: {
    fresh: "Something new it left that you haven't opened.",
    opened: "It ran, and you've opened all it left.",
    rested: "It ran with nothing to answer.",
    quiet: "Home has no word of a run since one was due.",
    partly: "Its last run answered some of what it found and left the rest.",
    stopped: "Its last run ended early.",
    away: "A run is due, and this phone hasn't looked at home since.",
    unheard: "No run heard of yet.",
  } satisfies Record<RoutineShape, string>,
  /** Each voice mark, as the legend says it. */
  voiceShapes: {
    waiting: "Something you shared waits for home to hear its voice note.",
    missed:
      "Something was answered without its voice note, because home never heard it.",
    unread:
      "The routine couldn't read what home heard in your voice notes, so they wait.",
  } satisfies Record<VoiceShape, string>,
} as const

/** "One thing you shared", "3 things you shared". */
const things = (n: number): string =>
  n === 1 ? "One thing you shared" : `${n} things you shared`

/** What the run said of its voice notes, one view per state it reported. */
function voiceOf(run: RoutineRun): ReadonlyArray<VoiceView> {
  const { voice } = run
  if (voice === null) return []
  const lines: Record<VoiceShape, string | null> = {
    unread: voice.unread
      ? "The routine couldn't read what home heard in your voice notes, so they wait for its next run."
      : null,
    missed:
      voice.missed === 0
        ? null
        : `${things(voice.missed)} ${voice.missed === 1 ? "was" : "were"} answered without a voice note home never heard. Voice notes reach home only while this phone keeps them there.`,
    waiting:
      voice.waiting === 0
        ? null
        : `${things(voice.waiting)} ${voice.waiting === 1 ? "waits" : "wait"} for home to hear a voice note.`,
  }
  return VOICE_ORDER.flatMap((shape) => {
    const line = lines[shape]
    return line === null ? [] : [{ shape, line }]
  })
}

/** What the mark says now, given what the phone holds and has opened. */
export function routineView(
  held: HeldRuns,
  opened: ReadonlySet<string>,
  now: Date,
  today: string
): RoutineView {
  const last = held.runs.at(0)
  if (last === undefined || held.lookedAt === null) {
    return {
      shape: "unheard",
      word: "Not yet",
      line: "No run of the routine heard of yet. It answers your reflections each morning.",
      voice: [],
    }
  }
  const voice = voiceOf(last)
  const due = dueBy(last)
  if (now.toISOString() > due) {
    if (held.lookedAt < due) {
      return {
        shape: "away",
        word: "Away",
        line: `This phone last looked at home ${when(held.lookedAt, today)}. The routine last ran ${when(last.startedAt, today)}.`,
        voice,
      }
    }
    return {
      shape: "quiet",
      word: "Quiet",
      line: `Home has no word of a run since ${when(last.startedAt, today)}. The routine may not have run.`,
      voice,
    }
  }
  if (last.outcome !== "done") {
    const why = last.problems.at(0)
    const ran = `The routine ran ${when(last.startedAt, today)}`
    const said = why === undefined ? "." : `: ${why}`
    return last.outcome === "stopped"
      ? {
          shape: "stopped",
          word: "Stopped",
          line: `${ran} and ended early${said}`,
          voice,
        }
      : {
          shape: "partly",
          word: "Partly",
          line: `${ran} and left some of what it found${said}`,
          voice,
        }
  }
  const waiting = held.runs
    .flatMap((run) => run.added)
    .filter((file) => !opened.has(routineKey(file.folder, file.name)))
  if (waiting.length > 0) {
    return {
      shape: "fresh",
      word: `${waiting.length} new`,
      line: `New from the routine: ${whatOf(waiting)}, not opened yet. It last ran ${when(last.startedAt, today)}.`,
      voice,
    }
  }
  if (last.added.length === 0) {
    return {
      shape: "rested",
      word: "Nothing new",
      line: `The routine ran ${when(last.startedAt, today)} with nothing to answer. It writes new words from your study reflections, and there were none since its last run.`,
      voice,
    }
  }
  return {
    shape: "opened",
    word: "All opened",
    line: `You've opened all the routine left. It last ran ${when(last.startedAt, today)}.`,
    voice,
  }
}

/** One run, as its history row says it. */
export function runLine(run: RoutineRun, today: string): string {
  const found = foundOf(run.found)
  const added =
    run.added.length === 0
      ? found === null
        ? "Nothing to answer."
        : `Found ${found}, and added nothing.`
      : `Added ${whatOf(run.added)}: ${run.added.map((file) => file.title).join("; ")}.`
  const problems = [...run.problems, ...voiceOf(run).map((v) => v.line)]
    .map((sentence) => ` ${sentence}`)
    .join("")
  const outcome =
    run.outcome === "done"
      ? ""
      : run.outcome === "stopped"
        ? " It stopped early."
        : " Some of it couldn't be done."
  return `${when(run.startedAt, today)}. ${added}${outcome}${problems}`
}
