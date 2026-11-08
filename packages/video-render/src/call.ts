/**
 * The weekly call, the first template: once a week, the agents that worked
 * both repositories report to the owner the way a stand-up does, so the
 * owner learns where things stand by watching one video instead of reading
 * archived sessions. It is public, as everything the owner makes is.
 *
 * Every call has the same sections in the same order (`callFormat`); only the
 * week's data (`CallWeekSchema`) changes. The sections, in order:
 *
 * 1. `open`: the week and the commits it read.
 * 2. `board`: everything open in the Residual Ledger, at a glance.
 * 3. `moved`: where each epic that moved this week stands.
 * 4. `done`: what merged, in batches of related pull requests the agent
 *    chose.
 * 5. `gray`: technical calls in a gray area: a promise or invariant
 *    declared, amended or retired, not the details of the code.
 * 6. `mine`: calls an agent made without the owner's word, worth hearing:
 *    the options it had, the one it took, why, and how to undo it.
 * 7. `asks`: what waits on the owner: why it is theirs, the options and
 *    what each unblocks. Each ask is one scene with a stable id, so the
 *    owner can pause on it and answer it (a later slice); the asks not
 *    voiced this week are listed on screen (`later`).
 * 8. `close`.
 *
 * The week's data is the call's DNA with the template: the words said
 * (`said`, an agent's, never the owner's) and everything shown come from it,
 * so the video can always be made again from it, and sharing it is sharing
 * the video. The ids are stable: a reply to an ask names the ask's id.
 */

import { z } from "zod"

import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import { FORMAT_SCHEMA, inTheme, repeatedId, showId, words } from "./format"
import type { Format, Shape } from "./format"
import { OptionSchema, RefSchema } from "./refs"
import type { CallRef } from "./refs"
import { estimatedMs, hasCaptions, stillFile, stillsCutList } from "./stills"
import type { StillTake } from "./stills"
import sample from "./templates/conference-call/sample-week.json"

export const CALL_WEEK_SCHEMA = "some-ui.call-week/1"

/** The call's template: its format's id, and its series'. */
export const CALL_ID = "conference-call"

/**
 * The newest version `callFormat` gives, pinned as `v<n>.json` under
 * `templates/`. A week names the version it was written for, and is drawn in
 * that version's shape; the routine writes this one (`CALL-ROUTINE.md`).
 *
 * 2 (SFEED2, #2670): the shape (`shapeOf`).
 * 3 (SFEED10 #2675, SFEED14 #2766): drawn in Mochi Night, the palette made
 *   for video, the mark too, in the series' version 2, which is Mochi
 *   Night's ground and plays our music bed (#2673).
 */
export const CALL_VERSION = 3

/** The first version drawn in Mochi Night, with the music bed. */
const NIGHT_VERSION = 3

/** The call's shape from version 2. */
const CALL_SHAPE: Shape = {
  brand: { intro: true, outro: true },
  chapters: ["board", "moved", "done", "gray", "mine", "asks"],
  subtitles: "word",
}

const shapeOf = (version: number): Shape =>
  version >= NIGHT_VERSION ? inTheme(CALL_SHAPE, "mochi-night") : CALL_SHAPE

export const CALL_MOST = {
  moved: 12,
  done: 12,
  gray: 8,
  mine: 8,
  asks: 12,
} as const

export const CALL_BOARD_MOST = 60
export const CALL_LATER_MOST = 200

/** The longest a week runs, in days: two, when a week's call was missed. */
export const CALL_DAYS_MOST = 14

/** The width the stage draws at, in CSS px: the series' frame. */
export const CALL_STAGE_WIDTH = 1920

type Repeated = keyof typeof CALL_MOST
type Section = Repeated | "open" | "board" | "close"

/**
 * The scenes a shape adds around the sections (`Shape`): the locked intro,
 * the brand intro and outro, and a chapter slide before a section.
 */
type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

const isRepeated = (section: Section): section is Repeated =>
  section in CALL_MOST

const scene = (
  id: Section,
  name: string,
  point: string,
  holdMs: number
): Format["scenes"][number] => ({
  id,
  name,
  point,
  picture: {
    kind: "capture",
    from: `the call's ${id} view`,
    cssWidth: CALL_STAGE_WIDTH,
  },
  holdMs,
  ...(isRepeated(id) ? { repeat: { max: CALL_MOST[id] } } : {}),
})

/**
 * The call's format at `version`: its sections, in the order every call says
 * them, and from version 2 its shape.
 */
export function callFormat(version: number = CALL_VERSION): Format {
  return {
    schema: FORMAT_SCHEMA,
    id: CALL_ID,
    version,
    title: "The weekly call",
    series: { id: CALL_ID, version: version >= NIGHT_VERSION ? 2 : 1 },
    look: "calm",
    scenes: [
      scene("open", "The week", "Which week this is, and what it read", 8_000),
      scene(
        "board",
        "The board",
        "Everything still open, and how much of it waits on you",
        30_000
      ),
      scene(
        "moved",
        "Where we are",
        "Where this epic stands now, and what is next",
        25_000
      ),
      scene(
        "done",
        "What landed",
        "What these pull requests changed, together",
        30_000
      ),
      scene(
        "gray",
        "A call in a gray area",
        "A technical call no check could make, and what it holds",
        30_000
      ),
      scene(
        "mine",
        "A call made without you",
        "What an agent chose without your word, why, and how to undo it",
        40_000
      ),
      scene(
        "asks",
        "Waiting on you",
        "What is yours to decide, why, the options and what each unblocks",
        45_000
      ),
      scene("close", "Close", "What the week comes to", 10_000),
    ],
    ...(version >= 2 ? { shape: shapeOf(version) } : {}),
  }
}

const IssueSchema = RefSchema.extend({ kind: z.literal("issue") })
const PrSchema = RefSchema.extend({ kind: z.literal("pr") })

/** A ref's one name: "server#681". */
const refKey = (ref: CallRef): string => `${ref.repo}#${ref.number}`

/** A day, as `YYYY-MM-DD`. */
const day = z.iso.date()

/** A commit, by its full sum. */
const commit = z.string().regex(/^[0-9a-f]{40}$/)

const refs = z.array(RefSchema).min(1)

const BoardRowSchema = z.strictObject({
  /** The Residual Ledger item's id. */
  ledger: showId,
  title: words,
  status: z.enum(["decide", "open", "doing", "done"]),
  /** How many of its stories wait on the owner, as the ledger's tally says. */
  waitsOnYou: z.number().int().nonnegative(),
})

const MovedSchema = z.strictObject({
  id: showId,
  /** The epic's tag, as its title carries it: "STUDIO". */
  tag: z.string().regex(/^[A-Z][A-Z0-9-]{0,23}$/),
  epic: IssueSchema,
  said: words,
  /** What landed for it this week: each is in a batch of `done`. */
  landed: z.array(PrSchema),
  next: z.array(words),
})

const PullSchema = PrSchema.extend({
  title: words,
  /** Its commits' `Change-Kind:`, where its repository writes one. */
  change: z.enum(["story", "defect"]).optional(),
})

const BatchSchema = z.strictObject({
  id: showId,
  /** What ties the batch together, as the agent grouped it. */
  title: words,
  said: words,
  pulls: z.array(PullSchema).min(1),
})

const GraySchema = z.strictObject({
  id: showId,
  title: words,
  said: words,
  /** The promise or invariant it declares, amends or retires: "SS2". */
  promise: z
    .string()
    .regex(/^[A-Z][A-Z0-9]*[0-9]+[a-z]?$/)
    .optional(),
  refs,
})

const MineSchema = z.strictObject({
  id: showId,
  title: words,
  said: words,
  options: z.array(words).min(2).max(4),
  /** The option it took, by its place in `options`. */
  chose: z.number().int().nonnegative(),
  why: words,
  /** How the owner undoes it, if they would rather not. */
  undo: words,
  refs,
})

const AskSchema = z.strictObject({
  id: showId,
  question: words,
  said: words,
  /** Why it is the owner's, not an agent's. */
  whyYours: words,
  options: z.array(OptionSchema).min(2).max(4),
  /** The option the agent recommends, by its place in `options`. */
  recommended: z.number().int().nonnegative().optional(),
  refs,
})

const LaterSchema = z.strictObject({
  id: showId,
  question: words,
  refs,
})

const SaidSchema = z.strictObject({ said: words })

export const CallWeekSchema = z.strictObject({
  schema: z.literal(CALL_WEEK_SCHEMA),
  template: z.strictObject({
    id: z.literal(CALL_ID),
    /** The format version it was written for, and so is drawn in. */
    version: z.number().int().min(1).max(CALL_VERSION),
  }),
  /** The days it covers, both included. */
  week: z.strictObject({ from: day, to: day }),
  /** The commits on each repository's main it read: how fresh it is. */
  read: z.strictObject({ "some-ui": commit, server: commit }),
  open: SaidSchema,
  board: z.strictObject({
    said: words,
    rows: z.array(BoardRowSchema).min(1).max(CALL_BOARD_MOST),
  }),
  moved: z.array(MovedSchema).max(CALL_MOST.moved),
  done: z.array(BatchSchema).max(CALL_MOST.done),
  gray: z.array(GraySchema).max(CALL_MOST.gray),
  mine: z.array(MineSchema).max(CALL_MOST.mine),
  asks: z.array(AskSchema).max(CALL_MOST.asks),
  /** The asks waiting on the owner that aren't voiced this week. */
  later: z.array(LaterSchema).max(CALL_LATER_MOST),
  close: SaidSchema,
})

export type CallWeek = z.infer<typeof CallWeekSchema>

export const CALL_INDEX_SCHEMA = "some-ui.call-index/1"

/**
 * The weeks `paulgsc/testing` keeps under `call/`, newest first, each
 * `<from>.json` beside it. `keep` is how many it aims to keep: older weeks
 * are home's alone (ST36), and one leaves the repository only once home holds
 * it, so the list runs past `keep` until home does.
 */
export const CallIndexSchema = z
  .strictObject({
    schema: z.literal(CALL_INDEX_SCHEMA),
    keep: z.number().int().min(1).max(52),
    weeks: z.array(z.strictObject({ from: day, to: day })),
  })
  .refine(
    (index) =>
      index.weeks.every(
        (week, i) => i === 0 || week.from < (index.weeks[i - 1]?.from ?? "")
      ),
    { message: "its weeks aren't newest first, each once", path: ["weeks"] }
  )

export type CallIndex = z.infer<typeof CallIndexSchema>

export function parseCallIndex(raw: unknown): Parsed<CallIndex> {
  const parsed = CallIndexSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "call index") }
}

/**
 * Every reason a `call/` folder can't be published: its index unread, a week
 * it lists missing or unable to make a call, a week whose file names another
 * week or days, and a week file the index forgets. `files` is the folder's
 * JSON files by name, `index.json` among them.
 */
export function callFolderProblems(
  files: ReadonlyMap<string, unknown>
): Array<string> {
  const index = parseCallIndex(files.get("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const problems: Array<string> = []
  const listed = new Set<string>()
  for (const [i, { from, to }] of index.value.weeks.entries()) {
    const name = `${from}.json`
    listed.add(name)
    if (!files.has(name)) {
      problems.push(`${name}: the index lists it, and there is no such file`)
      continue
    }
    const week = parseCallWeek(files.get(name))
    if (!week.ok) {
      problems.push(...week.problems.map((p) => `${name}: ${p}`))
      continue
    }
    // The newest week is written for the newest template; older ones keep
    // the version they were drawn in.
    if (i === 0 && week.value.template.version !== CALL_VERSION)
      problems.push(
        `${name}: it's written for version ${week.value.template.version} of the template, and the newest week is written for version ${CALL_VERSION}`
      )
    if (week.value.week.from !== from || week.value.week.to !== to)
      problems.push(
        `${name}: it holds ${week.value.week.from} to ${week.value.week.to}, and the index says ${from} to ${to}`
      )
  }
  for (const name of files.keys())
    if (name !== "index.json" && !listed.has(name))
      problems.push(`${name}: the index doesn't list it`)
  return problems
}

/** Every reason the week's parsed data contradicts itself. */
function weekProblems(week: CallWeek): Array<string> {
  const problems: Array<string> = []
  const days =
    (Date.parse(week.week.to) - Date.parse(week.week.from)) / 86_400_000 + 1
  if (days < 1) problems.push("week: it ends before it starts")
  if (days > CALL_DAYS_MOST)
    problems.push(`week: it runs more than ${CALL_DAYS_MOST} days`)
  const ids = [
    ...week.moved,
    ...week.done,
    ...week.gray,
    ...week.mine,
    ...week.asks,
    ...week.later,
  ].map((item) => item.id)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${id}: two items share this id`)
    seen.add(id)
  }
  const merged = new Set<string>()
  for (const batch of week.done) {
    const pulls = batch.pulls.map(refKey)
    for (const pull of new Set(pulls)) {
      if (merged.has(pull)) problems.push(`${pull}: it is in two batches`)
      merged.add(pull)
    }
    if (new Set(pulls).size !== pulls.length)
      problems.push(`${batch.id}: it lists a pull request twice`)
  }
  for (const epic of week.moved)
    for (const pull of epic.landed.map(refKey))
      if (!merged.has(pull))
        problems.push(`${epic.id}: ${pull} landed, and no batch has it`)
  for (const item of [...week.mine, ...week.asks]) {
    const says = item.options.map((o) => (typeof o === "string" ? o : o.says))
    if (new Set(says).size !== says.length)
      problems.push(`${item.id}: two options say the same`)
  }
  const ledger = week.board.rows.map((row) => row.ledger)
  if (new Set(ledger).size !== ledger.length)
    problems.push("board: a ledger item is listed twice")
  week.mine.forEach((call) => {
    if (call.chose >= call.options.length)
      problems.push(`${call.id}: it chose an option it doesn't list`)
  })
  week.asks.forEach((ask) => {
    if (ask.recommended !== undefined && ask.recommended >= ask.options.length)
      problems.push(`${ask.id}: it recommends an option it doesn't list`)
  })
  return once(problems)
}

/** The week's data, or every reason it can't make a call. */
export function parseCallWeek(raw: unknown): Parsed<CallWeek> {
  const parsed = CallWeekSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "call week") }
  const problems = weekProblems(parsed.data)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** The template's sample week: what a call looks like with nothing real in it. */
export const sampleCallWeek = (): Parsed<CallWeek> => parseCallWeek(sample)

/** One scene of a call: its section, its id in the video, and what it says. */
export type CallScene =
  | {
      readonly section: Exclude<Section | Framing, "chapter">
      /** The scene's id: its section's, or `<section>-<n>` for an item. */
      readonly id: string
      /** The item it shows, by the week's id; absent for a section's own scene. */
      readonly item?: string
      /** What is said over it; empty for a brand slide, which says nothing. */
      readonly said: string
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The section the chapter slide opens. */
      readonly of: Section
      readonly said: string
    }

/** What each chapter slide shows and says: the section it opens. */
export const CALL_CHAPTERS: Readonly<Record<Section, string>> = {
  open: "The week",
  board: "The board",
  moved: "Where things stand",
  done: "What landed",
  gray: "Calls in a gray area",
  mine: "Calls made without you",
  asks: "Waiting on you",
  close: "Close",
}

/** A day as it is said: "October 30". */
const sayDay = (day: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

/**
 * The locked intro (SFEED2): who wrote the call, what drew it, that its
 * voices are synthetic, and whose calls are inside, each a row on the frame,
 * and all of it said. Filled here, by code, from the week and the template,
 * never by the routine that writes the week, so the fill can't change who
 * it says made the video.
 */
export function callIntro(week: CallWeek): {
  readonly rows: ReadonlyArray<{
    readonly label: string
    readonly says: string
  }>
  readonly said: string
} {
  const counted: ReadonlyArray<readonly [number, string, string]> = [
    [week.asks.length, "question waits on you", "questions wait on you"],
    [
      week.mine.length,
      "call Claude made without you",
      "calls Claude made without you",
    ],
    [
      week.gray.length,
      "technical call in a gray area",
      "technical calls in a gray area",
    ],
  ]
  const calls = counted
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => count(n, one, many))
  const days = `${sayDay(week.week.from)} to ${sayDay(week.week.to)}`
  return {
    rows: [
      {
        label: "Written by",
        says: "Claude, from the two repositories and the Residual Ledger",
      },
      {
        label: "Drawn by",
        says: `Code: the weekly call's template, version ${week.template.version}, in paulgsc/some-ui`,
      },
      {
        label: "Voices",
        says: "Kokoro, a synthetic speaker. No voice here is a person's",
      },
      { label: "Calls inside", says: calls.join(" · ") || "None this week" },
    ],
    said: [
      `This is the weekly call for ${days}.`,
      "Claude wrote the words, from the two repositories and the ledger.",
      "Code drew every frame, and every voice you hear is synthetic.",
      calls.length === 0
        ? "There are no calls inside this week."
        : `Inside: ${calls.join(", ")}.`,
    ].join(" "),
  }
}

/**
 * The call's scenes in the order said: one per section that shows once, and
 * one per item of a repeated section, none where it has no items. In a week
 * written for a version with a shape, the locked intro opens it, then the
 * brand intro; a chapter slide comes before the first scene of each section
 * the shape marks; and the brand outro closes it.
 */
export function callScenes(week: CallWeek): ReadonlyArray<CallScene> {
  const items = (
    section: Repeated,
    list: ReadonlyArray<{ readonly id: string; readonly said: string }>
  ): Array<CallScene & { readonly section: Section }> =>
    list.map((item, i) => ({
      section,
      id: repeatedId(section, i + 1),
      item: item.id,
      said: item.said,
    }))
  const body: ReadonlyArray<CallScene & { readonly section: Section }> = [
    { section: "open", id: "open", said: week.open.said },
    { section: "board", id: "board", said: week.board.said },
    ...items("moved", week.moved),
    ...items("done", week.done),
    ...items("gray", week.gray),
    ...items("mine", week.mine),
    ...items("asks", week.asks),
    { section: "close", id: "close", said: week.close.said },
  ]
  const shape = callFormat(week.template.version).shape
  if (shape === undefined) return body
  const scenes: Array<CallScene> = [
    { section: "intro", id: "intro", said: callIntro(week).said },
  ]
  if (shape.brand.intro)
    scenes.push({ section: "brand-in", id: "brand-in", said: "" })
  for (const [i, scene] of body.entries()) {
    const first = body[i - 1]?.section !== scene.section
    if (first && shape.chapters.includes(scene.section))
      scenes.push({
        section: "chapter",
        id: `chapter-${scene.section}`,
        of: scene.section,
        said: `${CALL_CHAPTERS[scene.section]}.`,
      })
    scenes.push(scene)
  }
  if (shape.brand.outro)
    scenes.push({ section: "brand-out", id: "brand-out", said: "" })
  return scenes
}

/**
 * The voice each section is said in, by Kokoro's voice names (home's speaker,
 * paulgsc/server `infra/kokoro/say.py`, ST36): a host who opens, reads the
 * board, the intro and the chapters, and closes, and one voice per kind of
 * report, so a listener hears who is speaking change with the section. The
 * `a` and `b` voices are American and British English.
 */
export const CALL_VOICES: Readonly<Record<Section | Framing, string>> = {
  intro: "am_michael",
  "brand-in": "am_michael",
  chapter: "am_michael",
  "brand-out": "am_michael",
  open: "am_michael",
  board: "am_michael",
  moved: "af_heart",
  done: "am_fenrir",
  gray: "af_bella",
  mine: "bm_george",
  asks: "af_nicole",
  close: "am_michael",
}

/**
 * About how long a week's call runs, from its words alone, before any is
 * said: each scene for its reading time. The recorder refuses a week past
 * the policy's length on this, before it spends an hour on the speaker; the
 * renderer checks the placed length exactly.
 */
export const estimatedCallMs = (week: CallWeek): number =>
  estimatedMs(callScenes(week))

/**
 * The call as a cut list the renderer draws (`stillsCutList`, which holds
 * CV1): one still per scene (`<file>.png`, the stage recorded), and its take
 * (`<file>.wav`, home's speaker's) where one was said, `takes[i]`.
 * Captions are drawn as the week's shape says, and the music bed plays
 * under the voice once the series names one (`bed`).
 */
export function callCutList(
  week: CallWeek,
  takes: ReadonlyArray<StillTake | null>,
  { bed = false }: { readonly bed?: boolean } = {}
): CutList {
  return stillsCutList(
    {
      title: `The weekly call, ${week.week.from} to ${week.week.to}`,
      series: callFormat(week.template.version).series,
      look: "calm",
      captions: hasCaptions(callFormat(week.template.version)),
      bed,
    },
    callScenes(week).map((scene, i) => ({
      id: scene.id,
      file: stillFile(i, scene.id),
      said: scene.said,
    })),
    takes
  )
}
