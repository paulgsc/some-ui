/**
 * What the owner says in Studio that is filed as a pending issue (SFEED5,
 * #2746): a take kept on home whose `ref` names what it is about, filed by
 * the reflections routine (`packages/ui/topik/ROUTINE.md`, part E) through
 * `render pending`, which runs `toFile`. Each filed issue ends with
 * `filedLine(note)`, so no take is filed twice. A new kind of take to file
 * is a branch in `pendingOfRef` and a bullet in part E's E3, never a second
 * way of filing.
 *
 * A note left on an episode (SFEED6, #2745) is filed the same way, from the
 * mailbox's `feedback` folder (`some-ui.episode-note/1`): one issue per place
 * its categories send it (`./feedback`), each ending with
 * `noteFiledLine(note, goes)`, with what home heard in its spoken note when
 * it has one.
 *
 * A Studio take the owner moved to ready for pickup on the conveyor
 * (CONVEYOR3, #2875) is filed the same way, from the mailbox's `pickup`
 * folder (`some-ui.take-pickup/1`): one issue per take, ending with the same
 * `filedLine(note)`, and the routine puts back `some-ui.take-picked/1` with
 * the issue so home records the take as picked up. Only a take the owner
 * marked ready reaches that folder: recording one, or leaving it cooking,
 * files nothing.
 */

import { z } from "zod"

import { askId, parseAskId } from "./ask"
import type { Category, Destination } from "./feedback"
import {
  CATEGORIES,
  destinationOf,
  DESTINATIONS,
  destinationsOf,
} from "./feedback"
import type { Repo } from "./refs"

export const PENDING_LABELS = ["pending", "from-studio"] as const

/** The mailbox's transcript of a voice note, as far as filing reads it. */
const TranscriptSchema = z.object({
  schema: z.literal("some-ui.voice-transcript/1"),
  note: z.string().min(1),
  of: z.string(),
  ref: z.string(),
  at: z.iso.datetime({ offset: true }),
  text: z.string().trim().min(1),
})

/** A note on an episode, as home files it for the routine. */
const FeedbackSchema = z.object({
  schema: z.literal("some-ui.episode-note/1"),
  note: z.string().min(1),
  feed: z.enum(["call", "playoff-delta"]),
  episode: z.string().min(1),
  atMs: z.number().int().nonnegative(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  take: z.string().min(1).nullable(),
  writtenAt: z.iso.datetime({ offset: true }),
})

/** A take moved to ready for pickup, as home files it for the routine (CONVEYOR3). */
const PickupSchema = z.object({
  schema: z.literal("some-ui.take-pickup/1"),
  note: z.string().min(1),
  ref: z.string(),
  heard: z.string().trim().min(1),
  labels: z.array(z.string()),
  readyAt: z.iso.datetime({ offset: true }),
  seq: z.number().int().positive(),
})

/** What a take is to be filed as. */
export type Pending = {
  /** An answer to an ask. */
  readonly kind: "ask"
  readonly repo: Repo
  /** The issue it is about: for an answer, the ask's number. */
  readonly about: number
}

const ASK = "ask:"

/** The `ref` a take answering `ask` is kept under on home. */
export const answerRef = (ask: {
  readonly repo: Repo
  readonly number: number
}): string => `${ASK}${askId(ask)}`

/** What a Studio take's `ref` says it is to be filed as, or `null`. */
export function pendingOfRef(ref: string): Pending | null {
  if (!ref.startsWith(ASK)) return null
  const ask = parseAskId(ref.slice(ASK.length))
  return ask === null
    ? null
    : { kind: "ask", repo: ask.repo, about: ask.number }
}

/**
 * The line a filed issue ends with. Its wording is how a later run knows a
 * take was filed: changing it would file every past take again.
 */
export const filedLine = (note: string): string =>
  `Kept on home as the take \`${note}\`.`

// A body edited on GitHub ends its lines in CRLF.
const FILED = /^Kept on home as the take `([^`]+)`\.\r?$/gm

/** Each take an issue was filed for, by its id, with that issue when known. */
function filedNotes(filed: ReadonlyArray<Filed>): Map<string, string | null> {
  const notes = new Map<string, string | null>()
  for (const one of filed)
    for (const match of bodyOf(one).matchAll(FILED)) {
      const note = match[1]
      if (note === undefined) continue
      const issue = typeof one === "string" ? null : one.issue
      if (!notes.has(note) || notes.get(note) === null) notes.set(note, issue)
    }
  return notes
}

/** One take left to file. */
export type TakeToFile = Pending & {
  /** The take's id on home. */
  readonly note: string
  readonly at: string
  /** What home heard, for the routine to paraphrase; never quoted. */
  readonly heard: string
  readonly labels: typeof PENDING_LABELS
  /** The line the issue's body ends with (`filedLine`). */
  readonly line: string
}

/** One place a note on an episode goes, left to file. */
export type FeedbackToFile = {
  readonly kind: "feedback"
  readonly repo: Repo
  /** Where the issue sends it: the feed's next fill, its template, or a slide to fix. */
  readonly goes: Destination
  readonly note: string
  readonly feed: "call" | "playoff-delta"
  readonly episode: string
  readonly atMs: number
  /** Of the note's categories, those that send it here. */
  readonly categories: ReadonlyArray<Category>
  /** When it was written. */
  readonly at: string
  /** The spoken note's take on home, if one was said. */
  readonly take: string | null
  /**
   * What home heard in the spoken note, for the routine to paraphrase; never
   * quoted. `null` with a `take` when home hadn't heard it within `HEARD_WITHIN_MS`.
   */
  readonly heard: string | null
  /** The places this note already has an issue for, which this one links. */
  readonly filed: ReadonlyArray<Destination>
  readonly labels: typeof PENDING_LABELS
  readonly line: string
}

/** A take moved to ready for pickup, left to file (CONVEYOR3). */
export type PickupToFile = {
  readonly kind: "pickup"
  readonly repo: "some-ui"
  /** The take's id on home. */
  readonly note: string
  /** Its ready-for-pickup move's number, which its answer names. */
  readonly seq: number
  /** What it belongs to on home, `<project>:<shot>:<take>`. */
  readonly ref: string
  /** When it was moved to ready for pickup. */
  readonly at: string
  /** What home heard, for the routine to paraphrase; never quoted. */
  readonly heard: string
  /** The owner's labels on it, said in the body as context. */
  readonly takeLabels: ReadonlyArray<string>
  readonly labels: typeof PENDING_LABELS
  readonly line: string
  /** The answer's name in the mailbox's `picked` folder, once it is filed. */
  readonly picked: string
}

/** One item left to file. */
export type ToFile = TakeToFile | FeedbackToFile | PickupToFile

/**
 * The routine's answer to a pickup (`some-ui.take-picked/1`), put in the
 * mailbox's `picked` folder under `name`: the issue the take was filed as.
 */
export type PickedAnswer = {
  readonly name: string
  readonly body: {
    readonly schema: "some-ui.take-picked/1"
    readonly note: string
    readonly seq: number
    /** `<owner>/<repo>#<n>`. */
    readonly issue: string
  }
}

/** An answer's name in the mailbox's `picked` folder. */
export const pickedName = (note: string, seq: number): string =>
  `picked-${note}-${String(seq)}.json`

/** The answer to `note`'s pickup `seq`, filed as `issue` (`<owner>/<repo>#<n>`). */
export const pickedAnswer = (
  note: string,
  seq: number,
  issue: string
): PickedAnswer => ({
  name: pickedName(note, seq),
  body: { schema: "some-ui.take-picked/1", note, seq, issue },
})

/**
 * An issue already filed: its body, and where it is (`<owner>/<repo>#<n>`)
 * when the list said, which a pickup already filed is answered with.
 */
export type Filed =
  | string
  | { readonly body: string; readonly issue: string | null }

/** `https://github.com/<owner>/<repo>/issues/<n>`, its parts. */
const ISSUE_URL =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/([1-9]\d{0,8})$/
/** `<owner>/<repo>`. */
const REPO_NAME = /^[\w.-]{1,100}\/[\w.-]{1,100}$/

/**
 * An issue already filed, as the routine saves it: its body as text, or the
 * issue with its `body` and where it is, by its `repo` (`<owner>/<repo>`,
 * the repository the routine listed) and `number`, or by its `html_url`.
 */
export const FiledSchema = z.union([
  z.string(),
  z
    .object({
      body: z.string().nullable(),
      repo: z.string().optional(),
      number: z.number().int().positive().optional(),
      html_url: z.string().optional(),
    })
    .transform(({ body, repo, number, html_url: url }): Filed => {
      if (
        repo !== undefined &&
        REPO_NAME.test(repo) &&
        number !== undefined &&
        number < 1e9
      )
        return { body: body ?? "", issue: `${repo}#${String(number)}` }
      const [, owner, name, n] = ISSUE_URL.exec(url ?? "") ?? []
      return {
        body: body ?? "",
        issue:
          owner === undefined || name === undefined || n === undefined
            ? null
            : `${owner}/${name}#${n}`,
      }
    }),
])

const bodyOf = (filed: Filed): string =>
  typeof filed === "string" ? filed : filed.body

/**
 * The line an issue filed from a note on an episode ends with, one per place
 * it goes. Like `filedLine`, its wording is how a later run knows it was filed.
 */
export const noteFiledLine = (note: string, goes: Destination): string =>
  `Kept on home as the note \`${note}\`, for ${PLACE_WORDS[goes]}.`

/** Each place, as an issue's last line says it. */
const PLACE_WORDS = {
  nextFill: "the next fill",
  template: "the template",
  defect: "a slide to fix",
} as const satisfies Record<Destination, string>

const PLACE_OF = new Map<string, Destination>(
  DESTINATIONS.map((goes) => [PLACE_WORDS[goes], goes])
)

const NOTE_FILED =
  /^Kept on home as the note `([^`]+)`, for (the next fill|the template|a slide to fix)\.\r?$/gm

/** The places each note already has an issue for, by its id. */
function filedPlaces(
  filed: ReadonlyArray<Filed>
): Map<string, Set<Destination>> {
  const places = new Map<string, Set<Destination>>()
  for (const one of filed)
    for (const match of bodyOf(one).matchAll(NOTE_FILED)) {
      const goes = PLACE_OF.get(match[2] ?? "")
      if (match[1] === undefined || goes === undefined) continue
      const of = places.get(match[1]) ?? new Set<Destination>()
      of.add(goes)
      places.set(match[1], of)
    }
  return places
}

/**
 * How long a note whose spoken note home hasn't heard yet waits to be filed:
 * a take is heard within minutes once it reaches home, and one that isn't by
 * then is filed saying so.
 */
export const HEARD_WITHIN_MS = 48 * 60 * 60 * 1000

/** A transcript or note that doesn't read, by its place in its list. */
export type Passed = {
  readonly place: number
  readonly why: string
  /** The list it is in; a transcript's when absent. */
  readonly in?: "feedback" | "pickup"
}

/**
 * The takes left to file, oldest said first, from the mailbox's transcripts
 * (one per note, its newest; of two of one note, the later in the list) and the bodies of the issues already labelled
 * `from-studio` in either repository, open or closed: `pending` comes off
 * once the owner starts on one, and `from-studio` never does.
 */
export function toFile(
  transcripts: ReadonlyArray<unknown>,
  filed: ReadonlyArray<Filed>,
  feedback: ReadonlyArray<unknown> = [],
  now: number = Date.now(),
  pickups: ReadonlyArray<unknown> = [],
  /** The names already in the mailbox's `picked` folder. */
  picked: ReadonlyArray<string> = []
): {
  readonly items: ReadonlyArray<ToFile>
  readonly passed: ReadonlyArray<Passed>
  /** Notes waiting for home to hear their spoken note, by id. */
  readonly waiting: ReadonlyArray<string>
  /**
   * Answers to put in the `picked` folder now: pickups of takes an issue
   * already carries (an answer to an ask, or one filed by a run whose answer
   * didn't land), each naming that issue.
   */
  readonly answers: ReadonlyArray<PickedAnswer>
  /** Pickups of takes already filed whose issue the list didn't say, by note. */
  readonly unanswered: ReadonlyArray<string>
} {
  const done = filedNotes(filed)
  const passed: Array<Passed> = []
  const byNote = new Map<string, TakeToFile>()
  /** What home heard in each note, its newest transcript's. */
  const heardIn = new Map<string, string>()
  transcripts.forEach((raw, place) => {
    const read = TranscriptSchema.safeParse(raw)
    if (!read.success) {
      passed.push({ place, why: "it doesn't read as a voice transcript" })
      return
    }
    const heard = read.data
    heardIn.set(heard.note, heard.text)
    const pending = heard.of === "studio" ? pendingOfRef(heard.ref) : null
    if (pending === null || done.has(heard.note)) return
    byNote.set(heard.note, {
      ...pending,
      note: heard.note,
      at: heard.at,
      heard: heard.text,
      labels: PENDING_LABELS,
      line: filedLine(heard.note),
    })
  })
  const placesDone = filedPlaces(filed)
  const places: Array<FeedbackToFile> = []
  const waiting: Array<string> = []
  feedback.forEach((raw, place) => {
    const read = FeedbackSchema.safeParse(raw)
    if (!read.success) {
      passed.push({
        place,
        why: "it doesn't read as a note on an episode",
        in: "feedback",
      })
      return
    }
    const note = read.data
    const heard = note.take === null ? null : (heardIn.get(note.take) ?? null)
    const already = placesDone.get(note.note) ?? new Set<Destination>()
    const goesTo = destinationsOf(note.categories).filter(
      (g) => !already.has(g)
    )
    if (
      goesTo.length > 0 &&
      note.take !== null &&
      heard === null &&
      now - Date.parse(note.writtenAt) < HEARD_WITHIN_MS
    ) {
      waiting.push(note.note)
      return
    }
    for (const goes of goesTo) {
      places.push({
        kind: "feedback",
        repo: "some-ui",
        goes,
        note: note.note,
        feed: note.feed,
        episode: note.episode,
        atMs: note.atMs,
        categories: note.categories.filter((c) => destinationOf(c) === goes),
        at: note.writtenAt,
        take: note.take,
        heard,
        filed: DESTINATIONS.filter((g) => already.has(g)),
        labels: PENDING_LABELS,
        line: noteFiledLine(note.note, goes),
      })
    }
  })
  // Of a take's pickups, only its newest move counts: home records a pickup
  // only while that move is the take's newest, and a take is filed once.
  const newest = new Map<string, z.infer<typeof PickupSchema>>()
  pickups.forEach((raw, place) => {
    const read = PickupSchema.safeParse(raw)
    if (!read.success) {
      passed.push({
        place,
        why: "it doesn't read as a take ready for pickup",
        in: "pickup",
      })
      return
    }
    const was = newest.get(read.data.note)
    if (was === undefined || read.data.seq > was.seq)
      newest.set(read.data.note, read.data)
  })
  const answered = new Set(picked)
  const ready: Array<PickupToFile> = []
  const answers: Array<PickedAnswer> = []
  const unanswered: Array<string> = []
  for (const take of newest.values()) {
    const name = pickedName(take.note, take.seq)
    if (answered.has(name)) continue
    if (done.has(take.note) || byNote.has(take.note)) {
      // Filed already, or filed this run as an answer to an ask: no second
      // issue. Answer with the one there is, once its number is known.
      const issue = done.get(take.note) ?? null
      if (issue === null) unanswered.push(take.note)
      else answers.push(pickedAnswer(take.note, take.seq, issue))
      continue
    }
    ready.push({
      kind: "pickup",
      repo: "some-ui",
      note: take.note,
      seq: take.seq,
      ref: take.ref,
      at: take.readyAt,
      heard: take.heard,
      takeLabels: take.labels,
      labels: PENDING_LABELS,
      line: filedLine(take.note),
      picked: name,
    })
  }
  const items = [...byNote.values(), ...places, ...ready].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || a.note.localeCompare(b.note)
  )
  return { items, passed, waiting, answers, unanswered }
}
