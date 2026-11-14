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

import { callFit } from "./call-fit"
import type { CallPageShows } from "./call-fit"
import type { ChapterMark } from "./chapters"
import { chapterSlides } from "./chapters"
import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import {
  FORMAT_SCHEMA,
  inTheme,
  REPEAT_MOST,
  repeatedId,
  showId,
  versionRefusal,
  words,
} from "./format"
import type { Format, Shape } from "./format"
import {
  choiceProblems,
  ChoiceSchema,
  epicTag,
  IssueSchema,
  OptionSchema,
  PrSchema,
  refKey,
  RefSchema,
} from "./refs"
import {
  BRAND_MOTION,
  estimatedMs,
  hasCaptions,
  readingMs,
  stillFile,
  stillsCutList,
} from "./stills"
import type { StillTake } from "./stills"
import { boardSceneOf, storyboardOf } from "./storyboard"
import type { Storyboard } from "./storyboard"
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
 * 4 (HYPER5, #2728): the brand intro and outro are `brand-v1`, the code's
 *   mark moving in the mark's theme, rather than the stage's slides.
 * 5 (#2918, C360): a long week is a series of parts (`callParts`), each at
 *   most ten minutes by its words, and a section lists up to
 *   `CALL_SERIES_MOST` items, so nothing is left out to fit one video.
 */
export const CALL_VERSION = 5

/** The first version drawn in Mochi Night, with the music bed. */
const NIGHT_VERSION = 3

/** The first version whose brand intro and outro move (HYPER5). */
const MOTION_VERSION = 4

/** The first version a long week is a series of parts (#2918). */
const SERIES_VERSION = 5

/**
 * How long a part of the call runs, by its words (owner, 2026-11-14): at
 * most ten minutes, broken at a chapter once it reaches about eight.
 */
const CALL_PARTS = { mostMs: 600_000, aimMs: 480_000 } as const

/** The call's shape from version 2. */
const CALL_SHAPE: Shape = {
  brand: { intro: true, outro: true },
  chapters: ["board", "moved", "done", "gray", "mine", "asks"],
  subtitles: "word",
}

/** `shape` in Mochi Night, its brand intro and outro moving (HYPER5): the call's from version 4, and the essay's. */
export const nightInMotion = (shape: Shape): Shape => {
  const night = inTheme(shape, "mochi-night")
  return { ...night, brand: { ...night.brand, motion: BRAND_MOTION } }
}

function shapeOf(version: number): Shape {
  if (version < NIGHT_VERSION) return CALL_SHAPE
  if (version >= SERIES_VERSION)
    return { ...nightInMotion(CALL_SHAPE), parts: CALL_PARTS }
  return version >= MOTION_VERSION
    ? nightInMotion(CALL_SHAPE)
    : inTheme(CALL_SHAPE, "mochi-night")
}

/** The most items a section lists, up to version 4. */
export const CALL_MOST = {
  moved: 12,
  done: 12,
  gray: 8,
  mine: 8,
  asks: 12,
} as const

/**
 * The most items a section lists from version 5, where a long week is a
 * series: enough that only a broken file reaches it.
 */
export const CALL_SERIES_MOST = REPEAT_MOST

/** The most items `section` lists in `version`. */
const mostIn = (version: number, section: keyof typeof CALL_MOST): number =>
  version >= SERIES_VERSION ? CALL_SERIES_MOST : CALL_MOST[section]

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

/** The sections that show once per item. */
const REPEATED = [
  "moved",
  "done",
  "gray",
  "mine",
  "asks",
] as const satisfies ReadonlyArray<Repeated>

const isRepeated = (section: Section): section is Repeated =>
  REPEATED.some((each) => each === section)

const scene = (
  version: number,
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
  ...(isRepeated(id) ? { repeat: { max: mostIn(version, id) } } : {}),
})

/** Why `version` of the call's template can't be drawn here, or null (VS1). */
export const callVersionRefusal = (version: number): string | null =>
  versionRefusal("the call's template", CALL_VERSION, version)

/**
 * The call's format at `version`: its sections, in the order every call says
 * them, and from version 2 its shape. Throws for a version this build doesn't
 * know (`callVersionRefusal`).
 */
export function callFormat(version: number = CALL_VERSION): Format {
  const refused = callVersionRefusal(version)
  if (refused !== null) throw new Error(refused)
  return {
    schema: FORMAT_SCHEMA,
    id: CALL_ID,
    version,
    title: "The weekly call",
    series: { id: CALL_ID, version: version >= NIGHT_VERSION ? 2 : 1 },
    look: "calm",
    scenes: [
      scene(
        version,
        "open",
        "The week",
        "Which week this is, and what it read",
        8_000
      ),
      scene(
        version,
        "board",
        "The board",
        "Everything still open, and how much of it waits on you",
        30_000
      ),
      scene(
        version,
        "moved",
        "Where we are",
        "Where this epic stands now, and what is next",
        25_000
      ),
      scene(
        version,
        "done",
        "What landed",
        "What these pull requests changed, together",
        30_000
      ),
      scene(
        version,
        "gray",
        "A call in a gray area",
        "A technical call no check could make, and what it holds",
        30_000
      ),
      scene(
        version,
        "mine",
        "A call made without you",
        "What an agent chose without your word, why, and how to undo it",
        40_000
      ),
      scene(
        version,
        "asks",
        "Waiting on you",
        "What is yours to decide, why, the options and what each unblocks",
        45_000
      ),
      scene(version, "close", "Close", "What the week comes to", 10_000),
    ],
    ...(version >= 2 ? { shape: shapeOf(version) } : {}),
  }
}

/** A day, as `YYYY-MM-DD`. */
export const day = z.iso.date()

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
  tag: epicTag,
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

const MineSchema = ChoiceSchema.extend({ id: showId, said: words, refs })

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

/** A section said once: its words. */
export const SaidSchema = z.strictObject({ said: words })

export const CallWeekSchema = z.strictObject({
  schema: z.literal(CALL_WEEK_SCHEMA),
  template: z.strictObject({
    id: z.literal(CALL_ID),
    /**
     * The format version it was written for, and so is drawn in; one newer
     * than this build knows is refused (VS1), never drawn in an older look.
     */
    version: z
      .number()
      .int()
      .min(1)
      .max(CALL_VERSION, {
        message: `newer than this build knows: it draws up to version ${CALL_VERSION}, so publish a newer stage first`,
      }),
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
  moved: z.array(MovedSchema).max(CALL_SERIES_MOST),
  done: z.array(BatchSchema).max(CALL_SERIES_MOST),
  gray: z.array(GraySchema).max(CALL_SERIES_MOST),
  mine: z.array(MineSchema).max(CALL_SERIES_MOST),
  asks: z.array(AskSchema).max(CALL_SERIES_MOST),
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
  for (const call of week.mine) problems.push(...choiceProblems(call.id, call))
  for (const ask of week.asks) {
    const says = ask.options.map((o) => o.says)
    if (new Set(says).size !== says.length)
      problems.push(`${ask.id}: two options say the same`)
  }
  const ledger = week.board.rows.map((row) => row.ledger)
  if (new Set(ledger).size !== ledger.length)
    problems.push("board: a ledger item is listed twice")
  week.asks.forEach((ask) => {
    if (ask.recommended !== undefined && ask.recommended >= ask.options.length)
      problems.push(`${ask.id}: it recommends an option it doesn't list`)
  })
  for (const section of REPEATED)
    if (week[section].length > mostIn(week.template.version, section))
      problems.push(
        `${section}: it lists more than ${mostIn(week.template.version, section)}, the most version ${week.template.version} draws`
      )
  // CF1
  if (captioned(week)) problems.push(...fitOf(week).problems)
  return once(problems)
}

/** The week's fit (CF1): a paragraph carries on, word by word, from version 5. */
const fitOf = (week: CallWeek): ReturnType<typeof callFit> =>
  callFit(week, { words: week.template.version >= SERIES_VERSION })

/** Whether the week's frame keeps its foot for captions: version 2 on. */
const captioned = (week: CallWeek): boolean =>
  hasCaptions(callFormat(week.template.version))

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
      /**
       * Which page of its scene it is (CF1, `./call-fit`), and what of each
       * list it shows; absent in a week with no caption band, which shows
       * its scene whole.
       */
      readonly page?: CallScenePage
      /** How long it holds, said over by nothing: a page after the first. */
      readonly holdMs?: number
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The section the chapter slide opens. */
      readonly of: Section
      /** Whether an earlier part of the series began the section. */
      readonly continued?: boolean
      readonly said: string
    }

/**
 * A scene's page: its place among its scene's pages, what it shows, and how
 * tall the model says it is, in px.
 */
export type CallScenePage = {
  readonly n: number
  readonly of: number
  readonly shows: CallPageShows
  readonly h: number
}

/** Whether `scene` is its scene's first page, or a scene with no pages. */
export const isFirstPage = (scene: CallScene): boolean =>
  !("page" in scene) || scene.page === undefined || scene.page.n === 1

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
export const sayDay = (day: string): string =>
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
/** A locked intro (SFEED2): its rows on the frame, and all of it said. */
export type LockedIntro = {
  readonly rows: ReadonlyArray<{
    readonly label: string
    readonly says: string
  }>
  readonly said: string
}

/** Which part of a series a video is, and of how many. */
export type CallPartOf = { readonly n: number; readonly of: number }

export function callIntro(
  week: CallWeek,
  part: CallPartOf = { n: 1, of: 1 }
): LockedIntro {
  const series = part.of > 1
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
      ...(series ? [{ label: "Part", says: `${part.n} of ${part.of}` }] : []),
    ],
    said: [
      series
        ? `This is part ${part.n} of ${part.of} of the weekly call for ${days}.`
        : `This is the weekly call for ${days}.`,
      "Claude wrote the words, from the two repositories and the ledger.",
      "Code drew every frame, and every voice you hear is synthetic.",
      calls.length === 0
        ? "There are no calls inside this week."
        : `Inside: ${calls.join(", ")}.`,
    ].join(" "),
  }
}

/**
 * Where the call's chapters start (SFEED4): each chapter slide, and each ask
 * on its own, titled by its question, so it can be heard again before it is
 * answered.
 */
export function callChapterMarks(
  week: CallWeek,
  part: number = 1
): Array<ChapterMark> {
  const scenes = callScenes(week, part)
  const asks = scenes.flatMap((scene) => {
    if (scene.section !== "asks" || !("item" in scene)) return []
    if (!isFirstPage(scene)) return []
    const ask = week.asks.find((each) => each.id === scene.item)
    return ask === undefined ? [] : [{ scene: scene.id, title: ask.question }]
  })
  return [
    ...chapterSlides(scenes.filter((scene) => scene.section === "chapter")),
    ...asks,
  ]
}

/** A section's scene, as the body of a call lays it out. */
type BodyScene = CallScene & { readonly section: Section }

/**
 * The call's body in the order said: one scene per section that shows once,
 * and one per item of a repeated section, none where it has no items; in a
 * captioned frame, each in its pages (CF1).
 */
function bodyOf(week: CallWeek): ReadonlyArray<BodyScene> {
  const items = (
    section: Repeated,
    list: ReadonlyArray<{ readonly id: string; readonly said: string }>
  ): Array<BodyScene> =>
    list.map((item, i) => ({
      section,
      id: repeatedId(section, i + 1),
      item: item.id,
      said: item.said,
    }))
  const whole: ReadonlyArray<BodyScene> = [
    { section: "open", id: "open", said: week.open.said },
    { section: "board", id: "board", said: week.board.said },
    ...items("moved", week.moved),
    ...items("done", week.done),
    ...items("gray", week.gray),
    ...items("mine", week.mine),
    ...items("asks", week.asks),
    { section: "close", id: "close", said: week.close.said },
  ]
  return captioned(week) ? pagedScenes(week, whole) : whole
}

/** One video of a week's call: its place in the series, and its scenes. */
export type CallPart = CallPartOf & {
  readonly scenes: ReadonlyArray<CallScene>
}

/**
 * `body`, a part's run of the week's body, as the video says it: the locked
 * intro, then the brand intro; a chapter slide before the first scene of
 * each section the shape marks, "continued" where an earlier part began it;
 * and the brand outro last.
 */
function framed(
  week: CallWeek,
  shape: Shape,
  body: ReadonlyArray<BodyScene>,
  part: CallPartOf,
  begun: ReadonlySet<Section>
): ReadonlyArray<CallScene> {
  const scenes: Array<CallScene> = [
    { section: "intro", id: "intro", said: callIntro(week, part).said },
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
        ...(begun.has(scene.section) ? { continued: true } : {}),
        said: begun.has(scene.section)
          ? `${CALL_CHAPTERS[scene.section]}, continued.`
          : `${CALL_CHAPTERS[scene.section]}.`,
      })
    scenes.push(scene)
  }
  if (shape.brand.outro)
    scenes.push({ section: "brand-out", id: "brand-out", said: "" })
  return scenes
}

/** The units a part may break between: an item with its pages, or a section said once. */
function unitsOf(body: ReadonlyArray<BodyScene>): Array<Array<BodyScene>> {
  const units: Array<Array<BodyScene>> = []
  for (const scene of body) {
    const last = units.at(-1)
    if (last !== undefined && !isFirstPage(scene)) last.push(scene)
    else units.push([scene])
  }
  return units
}

/**
 * `body` broken into the parts of a series (#2918): whole sections while a
 * part stays under `aimMs` by its words, framing included; a section that
 * would carry a part past it starts the next part, unless the part so far
 * is short; and a section longer than a part can hold is broken between its
 * items, each part filled to the aim. A part runs past `mostMs` only for a
 * single item that does.
 */
function brokenIntoParts(
  week: CallWeek,
  shape: Shape,
  body: ReadonlyArray<BodyScene>,
  { mostMs, aimMs }: { readonly mostMs: number; readonly aimMs: number }
): Array<ReadonlyArray<BodyScene>> {
  const ms = (scenes: ReadonlyArray<BodyScene>): number =>
    estimatedMs(framed(week, shape, scenes, { n: 1, of: 2 }, new Set()))
  const sections: Array<Array<BodyScene>> = []
  for (const scene of body) {
    const last = sections.at(-1)
    if (last?.[0]?.section === scene.section) last.push(scene)
    else sections.push([scene])
  }
  const parts: Array<ReadonlyArray<BodyScene>> = []
  let part: Array<BodyScene> = []
  const close = (): void => {
    if (part.length > 0) parts.push(part)
    part = []
  }
  const byItem = (section: ReadonlyArray<BodyScene>): void => {
    for (const unit of unitsOf(section)) {
      if (part.length > 0 && ms([...part, ...unit]) > aimMs) close()
      part.push(...unit)
    }
  }
  for (const section of sections) {
    if (part.length > 0) {
      const joined = ms([...part, ...section])
      if (joined <= aimMs || (joined <= mostMs && ms(part) < aimMs / 2)) {
        part.push(...section)
        continue
      }
      close()
    }
    if (ms(section) <= mostMs) part.push(...section)
    else byItem(section)
  }
  close()
  return parts
}

/**
 * The week's call as videos (#2918): one, or, where the week's shape names
 * `parts` and its body runs past a part's aim, a series, each part opening
 * on the locked intro, which says which part it is, and the brand.
 */
export function callParts(week: CallWeek): ReadonlyArray<CallPart> {
  const body = bodyOf(week)
  const shape = callFormat(week.template.version).shape
  if (shape === undefined) return [{ n: 1, of: 1, scenes: body }]
  const runs =
    shape.parts === undefined
      ? [body]
      : brokenIntoParts(week, shape, body, shape.parts)
  const begun = new Set<Section>()
  return runs.map((run, i) => {
    const part = { n: i + 1, of: runs.length }
    const scenes = framed(week, shape, run, part, begun)
    for (const scene of run) begun.add(scene.section)
    return { ...part, scenes }
  })
}

/**
 * The scenes of part `part` of the week's call (`callParts`), the first by
 * default: a week that is one video has only it.
 */
export function callScenes(
  week: CallWeek,
  part: number = 1
): ReadonlyArray<CallScene> {
  const parts = callParts(week)
  const at = Math.min(Math.max(1, Math.trunc(part)), parts.length)
  return parts[at - 1]?.scenes ?? []
}

/**
 * `scenes` with each that the captioned frame pages (CF1, `./call-fit`) in
 * its pages: the first keeps its id and its words, and each after it,
 * `<id>-<n>`, is said over by nothing and holds for its own words' reading
 * time. Nothing any page leaves out: every entry is on one of them.
 */
function pagedScenes(
  week: CallWeek,
  scenes: ReadonlyArray<BodyScene>
): ReadonlyArray<BodyScene> {
  const { pages } = fitOf(week)
  return scenes.flatMap((scene) => {
    const its = pages[scene.id]
    if (its === undefined) return [scene]
    return its.map((page, i) => ({
      ...scene,
      ...(i === 0
        ? {}
        : {
            id: `${scene.id}-${i + 1}`,
            said: "",
            holdMs: readingMs(page.words),
          }),
      page: { n: i + 1, of: its.length, shows: page.shows, h: page.h },
    }))
  })
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
export const estimatedCallMs = (week: CallWeek, part: number = 1): number =>
  estimatedMs(callScenes(week, part))

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
  {
    bed = false,
    part = 1,
  }: { readonly bed?: boolean; readonly part?: number } = {}
): CutList {
  const format = callFormat(week.template.version)
  const of = callParts(week).length
  const n = Math.min(Math.max(1, Math.trunc(part)), of)
  return stillsCutList(
    {
      title: `The weekly call, ${week.week.from} to ${week.week.to}${of > 1 ? `, part ${n} of ${of}` : ""}`,
      series: format.series,
      look: "calm",
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    callScenes(week, n).map((scene, i) => ({
      id: scene.id,
      file: stillFile(i, scene.id),
      said: scene.said,
      ...("holdMs" in scene && scene.holdMs !== undefined
        ? { holdMs: scene.holdMs }
        : {}),
    })),
    takes
  )
}

/**
 * The call's storyboard (SFEED3): every frame of the template's sample week,
 * as `callScenes` lays it out, with the fill's words left for the fill.
 */
export function callStoryboard(): Storyboard {
  const week = sampleCallWeek()
  if (!week.ok) throw new Error(week.problems.join("; "))
  const { from, to } = week.value.week
  return storyboardOf(
    callFormat(week.value.template.version),
    `the sample week, ${sayDay(from)} to ${sayDay(to)}`,
    callScenes(week.value).map(boardSceneOf)
  )
}
