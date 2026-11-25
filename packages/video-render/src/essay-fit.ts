/**
 * What the Rust Rounds essay's captioned frame holds (EF1, #2231): the
 * scenes whose words the Monday routine writes (C574), and the question
 * scene, which shows the week's ticket as written, laid out as the
 * stage lays them out (`apps/www`'s `web-surface/call/essay-stage.tsx`), measured in CSS
 * px at the 1920×1080 frame the recorder draws, with an allowance that errs
 * toward too long. The routine's `finish` refuses an essay this says runs
 * past the frame, naming the scene and what to shorten, before it is put
 * rather than an hour into a recording on home.
 *
 * EF1 (promise): an essay `finish` accepts has no question, best, beside or
 * deep dive scene the stage's frame overflows, or cuts off at a code line's
 * end.
 *
 * Family: every text the routine writes on those scenes (best fits, notes,
 * SOLO's why, a dive's title and shows) at any length and wrap, with code
 * spans, including a span touching the punctuation after it; two or three
 * speak-to points, at any length, each judged from the ticket's take or
 * from its own (RR24, cited on its beside row); a dive's code at any number
 * of lines and columns, tabs included; a question scene's title, spec,
 * figures and points at any length and count, and its program at any number
 * of lines and columns, `QUESTION_PROGRAM_LINES` and the week's 40 columns
 * held whatever the rest; and the host that records it, whose sans face the
 * frame draws in (`./frame-text`'s `SANS`): a cloud session's Inter, and
 * home's render image's WenQuanYi Zen Hei.
 *
 * Proof: `apps/www/tests/ui-fit/essay-fit.spec.ts` draws the sample, an
 * essay with points answered by takes of their own (`by-points`), and
 * essays with each of those texts, and the code by lines, columns and tabs,
 * and a ticket's question with a program of the most lines at its widest,
 * grown to the most this accepts, on the real stage, and fails where this
 * says a scene is shorter than drawn or an accepted scene overflows or clips
 * its code. CI runs it in the Playwright image home's render image is built
 * from (`pr.yml`), as CF1's; a session's Inter was checked by hand,
 * 2026-11-18.
 *
 * Tolerance: CF1's. The other scenes are outside the Family: the answer
 * scene shows the owner's transcript, which no length bounds and the routine
 * can't shorten (#3187), and the open, weeks and next scenes restate what
 * earlier files hold. The fork scene (RR29) is outside it too
 * until a model of it lands: `essay-fit.spec.ts` draws one fork and holds
 * that it fits. So is a ticket of 1, or 4 to 6, points (version 4), which
 * the spec doesn't draw yet. The recorder's `data-overflow` refusal
 * stays the guard there, so no video is cut off.
 *
 * `pointsFit` holds the part of the best and beside scenes the essay can't
 * shorten, the points themselves, and `questionFit` the question scene,
 * when the routine writes the week.
 */

import type { Essay, EssayTicket } from "./essay"
import {
  citeOf,
  essayScenes,
  markOf,
  pointAnsweredBy,
  SOLO_LEVELS,
} from "./essay"
import { lineOf, linesOf, px, stack, widthOf } from "./frame-text"
import type { Part, Run } from "./frame-text"

/**
 * The card a scene's content is drawn in, inside the frame's captioned body
 * (`CALL_BODY`, 1825 × 573): beside the bubbles' 16% column and its gap,
 * within the card's border and padding.
 */
const CARD = { width: 1416, height: 514 } as const

/** The words the stage sets beside the essay's own that this model measures. */
export const ESSAY_STAGE_WORDS = {
  into: "Into",
  /** A take that was sent and couldn't be made out (HEARD2): the longest a beside row's mark reads. */
  unheard: "Said, but it couldn't be made out",
  /** Beside a point's mark (RR24, `citeOf`): which take it was judged from. */
  ownTake: "Its own take",
  wholeTake: "One take for the whole ticket",
  /** A SOLO level as the stage writes it: "3. Multistructural". */
  level: (n: number, name: string): string => `${n}. ${name}`,
} as const

/**
 * Which take point `point` (from 0) of `ticket` was judged from (RR24,
 * `citeOf`), as the stage sets it after the beside row's mark on its line:
 * an own take's with its SOLO level. Null for a row with no cite.
 */
export function pointCite(ticket: EssayTicket, point: number): string | null {
  const cite = citeOf(ticket, point)
  if (cite === null) return null
  const own = pointAnsweredBy(ticket, point)
  const level =
    own.by === "own" && own.answer.kind === "take"
      ? own.answer.solo.level
      : undefined
  if (cite === "whole") return ESSAY_STAGE_WORDS.wholeTake
  return level === undefined
    ? ESSAY_STAGE_WORDS.ownTake
    : `${ESSAY_STAGE_WORDS.ownTake} · ${ESSAY_STAGE_WORDS.level(level, SOLO_LEVELS[level - 1] ?? "")}`
}

/** The point column's share of the beside table (`table-fixed`, C575). */
export const ESSAY_POINT_COLUMN = 0.3

/** `leading-tight` and `leading-snug`, each with room as `LINE` has. */
const TIGHT = 1.3
const SNUG = 1.42

/**
 * `text` split into its plain runs and its `code` spans, as the stage's
 * `Inline` draws them and this model measures them.
 */
export function codeSpans(
  text: string
): ReadonlyArray<{ readonly text: string; readonly code: boolean }> {
  return text
    .split(/(`[^`]+`)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? { text: part.slice(1, -1), code: true }
        : { text: part, code: false }
    )
}

/**
 * Text with `code` spans, set as the stage's `Inline` sets it, at `em`: a
 * span with no whitespace between it and the one before continues its word.
 */
const inline = (
  text: string,
  em: number,
  face: "prose" | "bold" = "prose"
): ReadonlyArray<Run> =>
  codeSpans(text).map((span, i, spans) => ({
    text: span.text,
    face: span.code ? ("mono" as const) : face,
    em: span.code ? em * 0.9 : em,
    touches:
      i > 0 && !/\s$/.test(spans[i - 1]?.text ?? "") && !/^\s/.test(span.text),
  }))

const lines = (runs: ReadonlyArray<Run>, width: number, em: number): number =>
  linesOf(runs, width) * lineOf(em)

/** `lines` set `leading-tight`, as a title is. */
const tight = (runs: ReadonlyArray<Run>, width: number, em: number): number =>
  linesOf(runs, width) * px(em) * TIGHT

/** The scene's tag: one line of capitals. */
const TAG: Part = { h: lineOf(0.7), em: 0.7 }

/**
 * A list as the stage draws its items: `em`, indented `pl-[1.2em]`, with
 * `space-y-[<gap>em]` between them.
 */
function list(
  items: ReadonlyArray<ReadonlyArray<Run>>,
  em: number,
  gap: number,
  within: number = CARD.width
): Part {
  const width = within - px(1.2 * em)
  const h = items.reduce(
    (sum, runs, i) => sum + lines(runs, width, em) + (i > 0 ? px(gap * em) : 0),
    0
  )
  return { h, em }
}

const CODE_EM = 0.62

/** The widest code line the card shows whole, in columns of the mono face. */
const CODE_COLUMNS = columnsIn(CARD.width, CODE_EM)

/**
 * How many columns `line` takes in the stage's `whitespace-pre` code block:
 * a tab runs to the next stop of 8 (CSS's `tab-size`), and a glyph from the
 * East Asian wide ranges or past them takes two.
 */
function codeColumns(line: string): number {
  let columns = 0
  for (const glyph of line) {
    if (glyph === "\t") columns += 8 - (columns % 8)
    else columns += (glyph.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1
  }
  return columns
}

const codeLines = (text: string): ReadonlyArray<string> =>
  text.trimEnd().split("\n")

/** How many of `text`'s lines are wider than `columns`. */
const wideLines = (text: string, columns: number): number =>
  codeLines(text).filter((line) => codeColumns(line) > columns).length

/** The stage's `Code` block of `text` at `em`: its lines, its padding and border. */
function code(text: string, em = CODE_EM): Part {
  return {
    h: codeLines(text).length * px(em) * SNUG + 2 * px(0.5 * em) + 2,
    em,
  }
}

/** The widest code line a box `width` px wide shows whole at `em`, in columns. */
function columnsIn(width: number, em: number): number {
  return Math.floor((width - 2 * px(0.8 * em) - 2) / widthOf("m", "mono", em))
}

function best(ticket: EssayTicket): number {
  return bestOf(ticket.points)
}

function bestOf(
  points: ReadonlyArray<{ readonly to: string; readonly best: string }>
): number {
  return stack([
    TAG,
    list(
      points.map((point) => [
        ...inline(`${point.to}.`, 0.85, "bold"),
        ...inline(point.best, 0.85),
      ]),
      0.85,
      0.5
    ),
  ])
}

/** The SOLO scale as `Solo` draws it: a label, the five levels, the source. */
const SOLO: Part = {
  h:
    lineOf(0.7) +
    px(0.2 * 0.7) +
    lineOf(0.7) +
    2 * px(0.3 * 0.7) +
    2 +
    px(0.3 * 0.6) +
    lineOf(0.6),
  em: 1,
}

function beside(ticket: EssayTicket): number {
  const answer = ticket.answer
  return besideOf(
    ticket.points.map((point, i) => ({
      to: point.to,
      cite: pointCite(ticket, i),
      note: markOf(ticket, i)?.note,
    })),
    answer.kind === "take" ? answer.solo.why : null
  )
}

/** The beside scene of `rows`, under SOLO's `why` (null for a silence's one line). */
function besideOf(
  rows: ReadonlyArray<{
    readonly to: string
    readonly cite: string | null
    readonly note: string | undefined
  }>,
  soloWhy: string | null
): number {
  const em = 0.8
  const pointWidth = CARD.width * ESSAY_POINT_COLUMN - px(em)
  const yoursWidth = CARD.width * (1 - ESSAY_POINT_COLUMN)
  const h = rows.reduce(
    (sum, { to, cite, note }) => {
      // The mark line with its cite (RR24), measured at its longest mark.
      const line =
        cite === null
          ? ESSAY_STAGE_WORDS.unheard
          : `${ESSAY_STAGE_WORDS.unheard} · ${cite}`
      const yours =
        lines(inline(line, em), yoursWidth, em) +
        (note === undefined
          ? 0
          : lines(inline(note, em * 0.9), yoursWidth, em * 0.9))
      const point = lines(inline(to, em), pointWidth, em)
      return sum + 1 + 2 * px(0.3 * em) + Math.max(point, yours)
    },
    lineOf(0.85 * em)
  )
  const why =
    soloWhy === null ? lineOf(em) : lines(inline(soloWhy, em), CARD.width, em)
  return stack([TAG, { h, em }, SOLO, { h: why, em }])
}

function dive(ticket: EssayTicket, k: number): number {
  const d = ticket.dives[k]
  if (d === undefined) return 0
  const point = ticket.points.at(d.point)
  return stack([
    TAG,
    {
      h: tight(inline(d.title, 1.4, "bold"), CARD.width, 1.4),
      em: 1.4,
    },
    ...(point === undefined
      ? []
      : [
          {
            h: lines(
              inline(`${ESSAY_STAGE_WORDS.into}: ${point.to}`, 0.75),
              CARD.width,
              0.75
            ),
            em: 0.75,
          },
        ]),
    list(
      d.shows.map((line) => inline(line, 0.85)),
      0.85,
      0.3
    ),
    ...(d.code === undefined ? [] : [code(d.code)]),
  ])
}

/**
 * The most lines a ticket's program holds (`@some-ui/rust-rounds`'s
 * `PROGRAM_LINE_CAP`, which its tests hold to this): the question scene
 * sets its code small enough for this many and no smaller.
 */
export const QUESTION_PROGRAM_LINES = 25

/**
 * The question scene's columns (`grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`, a gap of 1em): the
 * ticket's words, then its program.
 */
const QUESTION_WORDS_WIDTH = (CARD.width - px(1)) * 0.6
const QUESTION_CODE_WIDTH = (CARD.width - px(1)) * 0.4

/** What the question scene's columns have under its tag. */
const QUESTION_HEIGHT = CARD.height - TAG.h - 0.6 * px(TAG.em)

/**
 * The size the question scene sets a program of `program`'s lines at, in
 * em of the frame's: the dives' size while it fits, smaller for a longer
 * program, down to the size that fits `QUESTION_PROGRAM_LINES`, in steps of
 * a hundredth.
 */
export function questionCodeEm(program: string): number {
  const n = Math.min(codeLines(program).length, QUESTION_PROGRAM_LINES)
  const fits = (QUESTION_HEIGHT - 2) / (px(1) * (SNUG * n + 1))
  return Math.min(CODE_EM, Math.floor(fits * 100) / 100)
}

/** A ticket as its question scene draws it: the week's words, as written. */
export type QuestionTicket = {
  readonly id: string
  readonly title: string
  readonly spec: string
  readonly figures: ReadonlyArray<string>
  /** Its speak-to points (a `/2` week's fork questions). */
  readonly points: ReadonlyArray<string>
  readonly program: string
}

/**
 * The question scene of `ticket`: its height, and each thing of it that
 * runs past the frame, as a clause after the scene's name, `words` saying
 * what to do with words that run past it.
 */
function question(
  ticket: QuestionTicket,
  words: string
): {
  readonly h: number
  readonly problems: ReadonlyArray<string>
} {
  const width = QUESTION_WORDS_WIDTH
  const field = (body: Part): Part => ({
    h: TAG.h + px(0.2 * TAG.em) + body.h,
    em: 1,
  })
  const column = stack(
    [
      {
        h: tight([{ text: ticket.title, face: "bold", em: 1.15 }], width, 1.15),
        em: 1.15,
      },
      { h: lines(inline(ticket.spec, 0.8), width, 0.8), em: 0.8 },
      ...(ticket.figures.length === 0
        ? []
        : [
            field({
              h: ticket.figures.reduce(
                (sum, figure) =>
                  sum +
                  lines(
                    [{ text: figure, face: "prose", em: 0.75 }],
                    width,
                    0.75
                  ),
                0
              ),
              em: 0.75,
            }),
          ]),
      field(
        list(
          ticket.points.map((to) => inline(to, 0.8)),
          0.8,
          0.2,
          width
        )
      ),
    ],
    0.5
  )
  const em = questionCodeEm(ticket.program)
  const program = codeLines(ticket.program)
  const columns = columnsIn(QUESTION_CODE_WIDTH, em)
  const wide = wideLines(ticket.program, columns)
  const problems = [
    ...(column > QUESTION_HEIGHT
      ? [
          `runs about ${Math.ceil(column - QUESTION_HEIGHT)} px past the frame: ${words}`,
        ]
      : []),
    ...(program.length > QUESTION_PROGRAM_LINES
      ? [
          `holds a program of ${program.length} lines, more than the frame's ${QUESTION_PROGRAM_LINES}`,
        ]
      : []),
    ...(wide > 0
      ? [
          `has ${wide} program ${wide === 1 ? "line" : "lines"} wider than the frame's ${columns} columns`,
        ]
      : []),
  ]
  return {
    h: stack([TAG, { h: Math.max(column, code(ticket.program, em).h), em: 1 }]),
    problems,
  }
}

/** What runs past the frame in the question scene of `ticket`, when the routine writes the week. */
export function questionFit(ticket: QuestionTicket): ReadonlyArray<string> {
  return question(
    ticket,
    "shorten its title, spec, figures or speak-to points"
  ).problems.map((problem) => `${ticket.id}: its question scene ${problem}`)
}

const questionOf = (ticket: EssayTicket): QuestionTicket => ({
  ...ticket,
  points: ticket.points.map((point) => point.to),
})

/** A scene this models: its id, and its content's height in px. */
export type EssayFitScene = { readonly id: string; readonly h: number }

/**
 * The height of each question, best, beside and deep dive scene of `essay`, and what
 * runs past the frame: each such scene, how far, and what to shorten.
 */
export function essayFit(essay: Essay): {
  readonly scenes: ReadonlyArray<EssayFitScene>
  readonly problems: ReadonlyArray<string>
} {
  const scenes: Array<EssayFitScene> = []
  const problems: Array<string> = []
  for (const scene of essayScenes(essay)) {
    if (scene.section === "question") {
      const ticket = essay.tickets.find((t) => t.id === scene.ticket)
      if (ticket === undefined) continue
      const fit = question(
        questionOf(ticket),
        "the week's title, spec, figures and points are more than it holds, and only a new week can shorten them"
      )
      scenes.push({ id: scene.id, h: fit.h })
      for (const problem of fit.problems)
        problems.push(`${ticket.id} question (${scene.id}) ${problem}`)
      continue
    }
    if (
      scene.section !== "best" &&
      scene.section !== "beside" &&
      scene.section !== "dive"
    )
      continue
    const ticket = essay.tickets.find((t) => t.id === scene.ticket)
    if (ticket === undefined) continue
    const k = scene.section === "dive" ? (scene.dive ?? 0) : 0
    const h =
      scene.section === "best"
        ? best(ticket)
        : scene.section === "beside"
          ? beside(ticket)
          : dive(ticket, k)
    scenes.push({ id: scene.id, h })
    const name = scene.section === "dive" ? `deep dive ${k + 1}` : scene.section
    if (h > CARD.height) {
      const shorten =
        scene.section === "best"
          ? "its best fits"
          : scene.section === "beside"
            ? "its notes or SOLO's why"
            : "its title, shows or code"
      problems.push(
        `${ticket.id} ${name} (${scene.id}) runs about ${Math.ceil(h - CARD.height)} px past the frame: shorten ${shorten}`
      )
    }
    const wide = wideLines(ticket.dives[k]?.code ?? "", CODE_COLUMNS)
    if (scene.section === "dive" && wide > 0)
      problems.push(
        `${ticket.id} ${name} (${scene.id}): ${wide} code lines are wider than the frame's ${CODE_COLUMNS} columns`
      )
  }
  return { scenes, problems }
}

/**
 * What a ticket's speak-to points leave of its best and beside scenes
 * before the routine writes a word of the essay: each point (a `/2` week's
 * fork question) is restated in both as the week wrote it, and nothing
 * after the deadline can shorten it. Measured with every other text at its
 * least: no best fit, no note, a one-line SOLO why and no cite (RR24's
 * cite is set only when a point was answered on its own, which isn't known
 * yet). So whatever it refuses, `essayFit` refuses for any essay of those
 * points. Each scene that runs past the frame even so is a problem naming
 * the ticket.
 */
export function pointsFit(
  ticket: string,
  points: ReadonlyArray<string>
): ReadonlyArray<string> {
  const scenes = [
    ["best", bestOf(points.map((to) => ({ to, best: "" })))],
    [
      "beside",
      besideOf(
        points.map((to) => ({ to, cite: null, note: undefined })),
        null
      ),
    ],
  ] as const
  return scenes.flatMap(([name, h]) =>
    h > CARD.height
      ? [
          `${ticket}: its ${points.length} speak-to points alone run about ${Math.ceil(h - CARD.height)} px past the essay's ${name} scene: shorten them, or ask fewer`,
        ]
      : []
  )
}
