/**
 * The interview essay (IW6, #2937), the Rust Rounds essay's sibling
 * (`essay.ts`): after an interview week's deadline, a video on how the owner
 * communicated, published to be rewatched. It restates the invented company
 * and role, each question with its guidelines, and each card's script, so a
 * rewatch needs nothing remembered.
 *
 * Its data (`InterviewEssaySchema`, `some-ui.interview-essay/1`) is its DNA
 * with the template: every word said and everything shown come from it. It
 * reuses the Rust essay's scene grammar, in the same order every time
 * (`interviewEssayFormat`); a question's scenes, and a read's, repeat as a
 * group, one group per question or read, in the week's order:
 *
 * 0. `opening`, when the owner read the week's opening card (IW10, #3177):
 *    their own take, played whole, first after the brand. Left unread, the
 *    essay opens as it always has.
 * 1. `open`: the invented company and role.
 * 2. For each question:
 *    - `question`: the question, and what a good answer covers;
 *    - `answer`: the owner's take, played whole and captioned; for a
 *      question left unanswered, the silence and the guess at why; for a
 *      take home couldn't make out, a silence that says so (`./verdict`);
 *    - `faults`, for a take: its faults said plainly, the measured ones
 *      (IW3, counted by code from the words home heard) apart from the
 *      judged ones (the model's, against the guidelines);
 *    - `model`: a model answer that meets the guidelines, never called
 *      "correct", never naming a real employer;
 *    - `beside`: the model answer beside the owner's, each guideline
 *      covered, partly or missing.
 * 3. For each teleprompter read (#2937, 2026-11-13):
 *    - `card`: where the read is given, and its script;
 *    - `reading`: the take, played whole; or the silence;
 *    - `heard`, for a take: its measured faults, and a plain sentence on
 *      what to change.
 * 4. `weeks`: the faults over the weeks, answers' and reads', as counted.
 * 5. `next`: next week.
 *
 * No score and no grade (owner, 2026-11-13): nothing in the data adds the
 * faults up, and the chart shows each as it was counted.
 *
 * The look is the Rust essay's, template A: the tutor and the owner, the one
 * speaking lit, in the call's series.
 */

import { z } from "zod"

import { CALL_ID, CALL_STAGE_WIDTH, day, nightInMotion, sayDay } from "./call"
import type { LockedIntro } from "./call"
import type { ChapterMark } from "./chapters"
import { chapterSlides } from "./chapters"
import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import type { Speaker, Voicing } from "./essay"
import {
  chartWeeksProblems,
  ESSAY_CHAPTERS,
  lanedVoicesRow,
  lanedVoicesSaid,
  MARKS,
  nextWeekProblems,
  weekId,
} from "./essay"
import { FORMAT_SCHEMA, repeatedId, versionRefusal, words } from "./format"
import type { Format, Shape } from "./format"
import { hasCaptions, stillFile, stillsCutList } from "./stills"
import type { StillTake } from "./stills"
import { takeFilesOf } from "./take-files"
import type { TakeFiles } from "./take-files"
import sample from "./templates/interview-essay/sample-essay.json"
import {
  isSilenceShape,
  isUnheard,
  SILENCE_FIELDS,
  SILENCE_SHAPE,
  silenceSaid,
} from "./verdict"
import type { Silence } from "./verdict"

export const INTERVIEW_ESSAY_SCHEMA = "some-ui.interview-essay/1"

export const INTERVIEW_ESSAY_ID = "interview-essay"

/** The newest version `interviewEssayFormat` gives, pinned as `v<n>.json` under `templates/`. */
export const INTERVIEW_ESSAY_VERSION = 4

/**
 * The first version whose bubbles draw the cast (PDA6, #2883; C822), as the
 * Rust essay's version 6.
 */
export const INTERVIEW_ESSAY_CAST_VERSION = 3

/**
 * The first version whose voices move on at each chapter (#3321, C840), as
 * the Rust essay's version 7: what every interview essay is written at (C841).
 */
export const INTERVIEW_ESSAY_VOICES_VERSION = 4

/** The first version with the owner's own opening (IW10): an essay before it holds none. */
const OPENING_SINCE = 2

/** The most questions and cards a week has (`some-ui.interview-week/1` and `/2`). */
const QUESTIONS_MOST = 6
const READS_MOST = 4

/** The most faults one take lists, so its scene fits the frame. */
export const INTERVIEW_FAULTS_MOST = 8

/** The most weeks, and rows, the faults chart shows. */
const INTERVIEW_WEEKS_MOST = 12
const INTERVIEW_ROWS_MOST = 8

type Section =
  | "opening"
  | "open"
  | "question"
  | "answer"
  | "faults"
  | "model"
  | "beside"
  | "card"
  | "reading"
  | "heard"
  | "weeks"
  | "next"

type Repeated = Exclude<Section, "opening" | "open" | "weeks" | "next">

type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

const MOST: Readonly<Record<Repeated, number>> = {
  question: QUESTIONS_MOST,
  answer: QUESTIONS_MOST,
  faults: QUESTIONS_MOST,
  model: QUESTIONS_MOST,
  beside: QUESTIONS_MOST,
  card: READS_MOST,
  reading: READS_MOST,
  heard: READS_MOST,
}

const isRepeated = (section: Section): section is Repeated => section in MOST

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
    from: `the interview essay's ${id} view`,
    cssWidth: CALL_STAGE_WIDTH,
  },
  holdMs,
  ...(isRepeated(id) ? { repeat: { max: MOST[id] } } : {}),
})

/** Mochi Night with the moving brand, as the Rust essay; a chapter slide opens each question, each read and the close. */
const SHAPE: Shape = nightInMotion({
  brand: { intro: true, outro: true },
  chapters: ["question", "card", "weeks"],
  subtitles: "word",
})

/** Why `version` of the interview essay's template can't be drawn here, or null (VS1). */
export const interviewEssayVersionRefusal = (version: number): string | null =>
  versionRefusal(
    "the interview essay's template",
    INTERVIEW_ESSAY_VERSION,
    version
  )

/** The interview essay's format at `version`; throws for one this build doesn't know. */
export function interviewEssayFormat(
  version: number = INTERVIEW_ESSAY_VERSION
): Format {
  const refused = interviewEssayVersionRefusal(version)
  if (refused !== null) throw new Error(refused)
  return {
    schema: FORMAT_SCHEMA,
    id: INTERVIEW_ESSAY_ID,
    version,
    title: "The interview essay",
    series: { id: CALL_ID, version: 2 },
    look: "calm",
    scenes: [
      ...(version >= OPENING_SINCE
        ? [
            scene(
              "opening",
              "Your opening",
              "The essay's opening, in your own voice; left out when it went unread",
              40_000
            ),
          ]
        : []),
      scene("open", "The week", "The invented company and role", 30_000),
      scene(
        "question",
        "The question",
        "What was asked, and what a good answer covers",
        30_000
      ),
      scene(
        "answer",
        "Your answer",
        "Your take, played whole; or the silence, and a guess at why",
        120_000
      ),
      scene(
        "faults",
        "Its faults",
        "What was counted in the take, and what was judged against the guidelines",
        50_000
      ),
      scene(
        "model",
        "A model answer",
        "An answer that meets the guidelines, made apart from yours",
        90_000
      ),
      scene(
        "beside",
        "The model beside yours",
        "Each guideline covered, partly or missing",
        40_000
      ),
      scene(
        "card",
        "The read",
        "Where the read is given, and its script",
        30_000
      ),
      scene(
        "reading",
        "Your read",
        "Your read, played whole; or the silence",
        120_000
      ),
      scene(
        "heard",
        "How it read",
        "What was counted in the read, and what to change",
        40_000
      ),
      scene(
        "weeks",
        "Over the weeks",
        "Each fault as counted, week by week; no score",
        40_000
      ),
      scene("next", "Next week", "What next week comes back to", 20_000),
    ],
    shape:
      version >= INTERVIEW_ESSAY_VOICES_VERSION
        ? { ...SHAPE, cast: "cast-v1", voices: "lanes-v1" }
        : version >= INTERVIEW_ESSAY_CAST_VERSION
          ? { ...SHAPE, cast: "cast-v1" }
          : SHAPE,
  }
}

/** A question's or card's id, as `some-ui.interview-week/1` and `/2` write it. */
const slug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "an id is a kebab slug, like a-time-you")

const said = z.strictObject({ said: words })

/**
 * One fault of a take, said plainly. `measured` is counted by code from the
 * words home heard (IW3's measures: fillers, pauses, mumbling, pace, length;
 * a read's misreads, pauses mid-phrase, pace variation, lead-in), with the
 * count in `shows`; `judged` is the model's, against the guidelines (STAR,
 * hedges, a decision's parts), with a short quote of the take where there is
 * one to quote.
 */
const FaultSchema = z.discriminatedUnion("by", [
  z.strictObject({ by: z.literal("measured"), what: words, shows: words }),
  z.strictObject({
    by: z.literal("judged"),
    what: words,
    shows: words,
    /** A few words of the take that show it; none for a part it left out. */
    quote: words.optional(),
  }),
])

/** Home records no openings of a week's question or card, so a silence counts none. */
const SilenceSchema = z
  .strictObject(SILENCE_FIELDS)
  .refine(isSilenceShape, SILENCE_SHAPE)

const QuestionSchema = z.strictObject({
  id: slug,
  /** The question as the interviewer asked it. */
  prompt: words,
  /** What a good answer covers, as the week said. */
  guidelines: z.array(words).min(2).max(5),
  question: said,
  answer: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("take"),
      /** What the owner said, as home heard it: the answer scene's caption. */
      transcript: words,
      faults: z.array(FaultSchema).max(INTERVIEW_FAULTS_MOST),
      /** The faults scene's words. */
      said: words,
      /** Each guideline, in order, as the answer stands beside the model's. */
      marks: z.array(
        z.strictObject({ mark: z.enum(MARKS), note: words.optional() })
      ),
    }),
    SilenceSchema,
  ]),
  /** A model answer that meets the guidelines: shown and said. */
  model: said,
  beside: said,
})

const ReadSchema = z.strictObject({
  /** The card's id. */
  id: slug,
  /** Where a read like this is given. */
  situation: words,
  /** The script, as the card showed it. */
  script: words,
  card: said,
  answer: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("take"),
      transcript: words,
      faults: z.array(FaultSchema).max(INTERVIEW_FAULTS_MOST),
      /** One plain sentence on what to change. */
      change: words,
      /** The heard scene's words. */
      said: words,
    }),
    SilenceSchema,
  ]),
})

export const InterviewEssaySchema = z.strictObject({
  schema: z.literal(INTERVIEW_ESSAY_SCHEMA),
  template: z.strictObject({
    id: z.literal(INTERVIEW_ESSAY_ID),
    version: z
      .number()
      .int()
      .min(1)
      .max(INTERVIEW_ESSAY_VERSION, {
        message: `newer than this build knows: it draws up to version ${INTERVIEW_ESSAY_VERSION}, so publish a newer stage first`,
      }),
  }),
  week: z.strictObject({ id: weekId, from: day, to: day }),
  /** Invented: never a real employer. */
  company: z.strictObject({ name: words, about: words }),
  role: z.strictObject({ title: words, about: words }),
  /** What home heard of the week's opening card (IW10); absent when there is none to play. */
  opening: z.strictObject({ transcript: words }).optional(),
  open: said,
  questions: z.array(QuestionSchema).min(1).max(QUESTIONS_MOST),
  reads: z.array(ReadSchema).max(READS_MOST),
  weeks: z.strictObject({
    said: words,
    /** The weeks the chart shows, oldest first, this essay's last. */
    weeks: z.array(weekId).min(1).max(INTERVIEW_WEEKS_MOST),
    rows: z
      .array(
        z.strictObject({
          /** What is counted, with its unit: "Fillers a minute". */
          name: words,
          of: z.enum(["answers", "reads"]),
          /** One per week of `weeks`: the count, or null with no take that week. */
          cells: z.array(z.number().nonnegative().nullable()),
        })
      )
      .min(1)
      .max(INTERVIEW_ROWS_MOST),
  }),
  next: z.strictObject({ said: words, week: weekId, topics: z.array(words) }),
})

export type InterviewEssay = z.infer<typeof InterviewEssaySchema>
export type InterviewQuestion = InterviewEssay["questions"][number]
export type InterviewRead = InterviewEssay["reads"][number]
export type InterviewFault = z.infer<typeof FaultSchema>

/** Every reason the essay's parsed data contradicts itself. */
function problemsOfEssay(essay: InterviewEssay): Array<string> {
  const problems: Array<string> = []
  if (essay.week.to < essay.week.from)
    problems.push("week: it ends before it starts")
  if (essay.opening !== undefined && essay.template.version < OPENING_SINCE)
    problems.push(
      `opening: the template draws the owner's opening from version ${String(OPENING_SINCE)}`
    )
  for (const [list, ids] of [
    ["questions", essay.questions.map((q) => q.id)],
    ["reads", essay.reads.map((r) => r.id)],
  ] as const)
    if (new Set(ids).size !== ids.length)
      problems.push(`${list}: two share an id`)
  for (const question of essay.questions) {
    const { answer } = question
    if (answer.kind !== "take") continue
    if (answer.marks.length !== question.guidelines.length)
      problems.push(
        `${question.id}: its answer marks ${answer.marks.length} guidelines, and it has ${question.guidelines.length}`
      )
  }
  for (const read of essay.reads)
    if (
      read.answer.kind === "take" &&
      read.answer.faults.some((fault) => fault.by !== "measured")
    )
      problems.push(`${read.id}: a read's faults are measured, never judged`)
  const { weeks, rows } = essay.weeks
  problems.push(...chartWeeksProblems(essay.week.id, weeks))
  for (const row of rows)
    if (row.cells.length !== weeks.length)
      problems.push(
        `${row.name}: it has ${row.cells.length} cells for ${weeks.length} weeks`
      )
  problems.push(...nextWeekProblems(essay.week.id, essay.next.week))
  return once(problems)
}

/** The interview essay's data, or every reason it can't make an essay. */
export function parseInterviewEssay(raw: unknown): Parsed<InterviewEssay> {
  const parsed = InterviewEssaySchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "essay") }
  const problems = problemsOfEssay(parsed.data)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** The template's sample essay: an invented week, an answer and a read left silent. */
export const sampleInterviewEssay = (): Parsed<InterviewEssay> =>
  parseInterviewEssay(sample)

/** One scene of an interview essay: its section, its id in the video, who says it and what. */
export type InterviewEssayScene =
  | {
      readonly section: Exclude<Section | Framing, "chapter">
      /** Its section's id, or `<section>-<n>` for a repeated one's nth. */
      readonly id: string
      /** The question it belongs to, by its id. */
      readonly question?: string
      /** The read it belongs to, by its card's id. */
      readonly read?: string
      readonly speaker: Speaker
      /** What is said over it; empty for a brand slide. */
      readonly said: string
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The scene the chapter slide opens. */
      readonly of: Section
      readonly question?: string
      readonly read?: string
      readonly title: string
      readonly speaker: Speaker
      readonly said: string
    }

/** A question's chapter title, and a read's. */
const questionTitle = (n: number, of: number): string =>
  `Question ${n} of ${of}`
const readTitle = (n: number, of: number): string => `Read ${n} of ${of}`

/** How many questions, and reads, the owner answered. */
const interviewAnsweredOf = (
  essay: InterviewEssay
): { readonly questions: number; readonly reads: number } => ({
  questions: essay.questions.filter((q) => q.answer.kind === "take").length,
  reads: essay.reads.filter((r) => r.answer.kind === "take").length,
})

/**
 * The locked intro (SFEED2): who wrote it, what drew it, whose voices are in
 * it and what judged it, filled by code from the essay alone.
 */
export function interviewEssayIntro(
  essay: InterviewEssay,
  voicing: Voicing = "owner"
): LockedIntro {
  const answered = interviewAnsweredOf(essay)
  const of = `${answered.questions} of ${essay.questions.length} questions, ${answered.reads} of ${essay.reads.length} reads`
  const sample = voicing === "sample"
  const lanes =
    interviewEssayFormat(essay.template.version).shape?.voices !== undefined
  return {
    rows: [
      {
        label: "Written by",
        says: sample
          ? "Claude, as the template's sample: the week and its answers are made up"
          : "Claude, from the week's questions and cards and the owner's takes",
      },
      {
        label: "Drawn by",
        says: `Code: the interview essay's template, version ${essay.template.version}, in paulgsc/some-ui`,
      },
      {
        label: "Voices",
        says: lanes
          ? lanedVoicesRow(sample, false)
          : sample
            ? "Both are Kokoro, a synthetic speaker. In a sample, a second synthetic voice reads the answers"
            : "The tutor is Kokoro, a synthetic speaker. The other voice is the owner's own, from their takes",
      },
      {
        label: "Counted by",
        says: "Code, from the words home heard: fillers, pauses, mumbling, pace, length and misreads",
      },
      {
        label: "Judged by",
        says: "Claude, against each question's guidelines. No score and no grade",
      },
      { label: "The company", says: "Invented, as is the role" },
      { label: "Answered", says: of },
    ],
    said: [
      `This is the interview essay for ${essay.week.id}, ${sayDay(essay.week.from)} to ${sayDay(essay.week.to)}.`,
      "Claude wrote the tutor's words, code counted the faults, and code drew every frame.",
      lanes
        ? lanedVoicesSaid(sample, false)
        : sample
          ? "This is a sample: both voices are synthetic, and the second reads made-up answers."
          : "The tutor's voice is synthetic; the other voice is the owner's own.",
      "The company and the role are invented.",
      sample ? `It covers ${of}.` : `The owner answered ${of}.`,
    ].join(" "),
  }
}

/** Who says an answer's scene and what: the owner's take, or the tutor's guess over a silence. */
const played = (
  answer: { readonly kind: "take"; readonly transcript: string } | Silence
): { readonly speaker: Speaker; readonly said: string } =>
  answer.kind === "take"
    ? { speaker: "you", said: answer.transcript }
    : { speaker: "tutor", said: silenceSaid(answer) }

/**
 * The essay's scenes in the order said: the intro and the brand, the open,
 * each question's group, each read's, then the chart and next week, a
 * chapter slide opening each question, each read and the close.
 */
export function interviewEssayScenes(
  essay: InterviewEssay,
  voicing: Voicing = "owner"
): ReadonlyArray<InterviewEssayScene> {
  const shape = interviewEssayFormat(essay.template.version).shape ?? SHAPE
  const scenes: Array<InterviewEssayScene> = [
    {
      section: "intro",
      id: "intro",
      speaker: "tutor",
      said: interviewEssayIntro(essay, voicing).said,
    },
  ]
  if (shape.brand.intro)
    scenes.push({
      section: "brand-in",
      id: "brand-in",
      speaker: "tutor",
      said: "",
    })
  if (essay.opening !== undefined)
    scenes.push({
      section: "opening",
      id: "opening",
      speaker: "you",
      said: essay.opening.transcript,
    })
  scenes.push({
    section: "open",
    id: "open",
    speaker: "tutor",
    said: essay.open.said,
  })
  let faults = 0
  for (const [i, question] of essay.questions.entries()) {
    const n = i + 1
    const id = (section: Repeated): string => repeatedId(section, n)
    const of = { question: question.id }
    if (shape.chapters.includes("question")) {
      const title = questionTitle(n, essay.questions.length)
      scenes.push({
        section: "chapter",
        id: repeatedId("chapter-question", n),
        of: "question",
        ...of,
        title,
        speaker: "tutor",
        said: `${title}.`,
      })
    }
    const { answer } = question
    scenes.push(
      {
        section: "question",
        id: id("question"),
        ...of,
        speaker: "tutor",
        said: question.question.said,
      },
      { section: "answer", id: id("answer"), ...of, ...played(answer) }
    )
    if (answer.kind === "take") {
      faults += 1
      scenes.push({
        section: "faults",
        id: repeatedId("faults", faults),
        ...of,
        speaker: "tutor",
        said: answer.said,
      })
    }
    scenes.push(
      {
        section: "model",
        id: id("model"),
        ...of,
        speaker: "tutor",
        said: question.model.said,
      },
      {
        section: "beside",
        id: id("beside"),
        ...of,
        speaker: "tutor",
        said: question.beside.said,
      }
    )
  }
  let heard = 0
  for (const [i, read] of essay.reads.entries()) {
    const n = i + 1
    const of = { read: read.id }
    if (shape.chapters.includes("card")) {
      const title = readTitle(n, essay.reads.length)
      scenes.push({
        section: "chapter",
        id: repeatedId("chapter-card", n),
        of: "card",
        ...of,
        title,
        speaker: "tutor",
        said: `${title}.`,
      })
    }
    const { answer } = read
    scenes.push(
      {
        section: "card",
        id: repeatedId("card", n),
        ...of,
        speaker: "tutor",
        said: read.card.said,
      },
      {
        section: "reading",
        id: repeatedId("reading", n),
        ...of,
        ...played(answer),
      }
    )
    if (answer.kind === "take") {
      heard += 1
      scenes.push({
        section: "heard",
        id: repeatedId("heard", heard),
        ...of,
        speaker: "tutor",
        said: answer.said,
      })
    }
  }
  for (const section of ["weeks", "next"] as const) {
    if (shape.chapters.includes(section))
      scenes.push({
        section: "chapter",
        id: `chapter-${section}`,
        of: section,
        title: ESSAY_CHAPTERS[section],
        speaker: "tutor",
        said: `${ESSAY_CHAPTERS[section]}.`,
      })
    scenes.push({
      section,
      id: section,
      speaker: "tutor",
      said: essay[section].said,
    })
  }
  if (shape.brand.outro)
    scenes.push({
      section: "brand-out",
      id: "brand-out",
      speaker: "tutor",
      said: "",
    })
  return scenes
}

/** The essay as a cut list the renderer draws, one still per scene, as the Rust essay's (`essayCutList`). */
export function interviewEssayCutList(
  essay: InterviewEssay,
  takes: ReadonlyArray<StillTake | null>,
  {
    bed = false,
    voicing = "owner",
  }: { readonly bed?: boolean; readonly voicing?: Voicing } = {}
): CutList {
  const format = interviewEssayFormat(essay.template.version)
  return stillsCutList(
    {
      title: `The interview essay, ${essay.week.id}`,
      series: format.series,
      look: "calm",
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    interviewEssayScenes(essay, voicing).map((s, i) => ({
      id: s.id,
      file: stillFile(i, s.id),
      said: s.said,
    })),
    takes
  )
}

/** Where the essay's chapters start (SFEED4): each question, each read and the close. */
export const interviewEssayChapterMarks = (
  essay: InterviewEssay
): Array<ChapterMark> =>
  chapterSlides(
    interviewEssayScenes(essay).filter((s) => s.section === "chapter")
  )

/**
 * The card a week names its essay's opening by (`some-ui.interview-week/2`'s
 * `opening`, IW10): its take is the read of that card.
 */
export const OPENING_TAKE = "opening"

/** The file name a read's take has in the takes folder: `read.<card>`. */
export const readTakeId = (card: string): string => `read.${card}`

/**
 * Which of `names`, the files in the folder home hands the recorder, is each
 * answered question's take, `<question>.<ext>`, and each answered read's,
 * `read.<card>.<ext>`, each with its word times beside it where home kept
 * them (`takeFilesOf`, which says what it refuses). Keyed by those names.
 */
export const interviewEssayTakeFiles = (
  essay: InterviewEssay,
  names: ReadonlyArray<string>
): Parsed<Readonly<Record<string, TakeFiles>>> => {
  // The opening's take plays when the essay holds it; any other of its
  // takes home hands over (unread, or unheard) is set aside.
  const opening = readTakeId(OPENING_TAKE)
  const items = [
    ...essay.questions.map((q) => ({ id: q.id, answer: q.answer })),
    ...essay.reads.map((r) => ({ id: readTakeId(r.id), answer: r.answer })),
  ]
  const plays = essay.opening !== undefined
  return takeFilesOf(
    {
      answered: [
        ...(plays ? [opening] : []),
        ...items.filter((i) => i.answer.kind === "take").map((i) => i.id),
      ],
      silent: items.filter((i) => i.answer.kind === "silence").map((i) => i.id),
      unheard: [
        ...(plays ? [] : [opening]),
        ...items.filter((i) => isUnheard(i.answer)).map((i) => i.id),
      ],
      noun: "question or read",
    },
    names
  )
}

/** The take a scene plays, by its name in the takes folder: an answer's or a read's, the owner's alone. */
export const interviewTakeOf = (scene: InterviewEssayScene): string | null => {
  if (scene.speaker !== "you" || scene.section === "chapter") return null
  if (scene.section === "answer") return scene.question ?? null
  if (scene.section === "opening") return readTakeId(OPENING_TAKE)
  if (scene.section === "reading" && scene.read !== undefined)
    return readTakeId(scene.read)
  return null
}
