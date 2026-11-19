/**
 * What the Rust Rounds essay's captioned frame holds (EF1, #2231): the
 * scenes whose words the Monday routine writes (C574), laid out as the
 * stage lays them out (`apps/www`'s `web-surface/call/essay-stage.tsx`), measured in CSS
 * px at the 1920×1080 frame the recorder draws, with an allowance that errs
 * toward too long. The routine's `finish` refuses an essay this says runs
 * past the frame, naming the scene and what to shorten, before it is put
 * rather than an hour into a recording on home.
 *
 * EF1 (promise): an essay `finish` accepts has no best, beside or deep dive
 * scene the stage's frame overflows, or cuts off at a code line's end.
 *
 * Family: every text the routine writes on those scenes (best fits, notes,
 * SOLO's why, a dive's title and shows) at any length and wrap, with code
 * spans, including a span touching the punctuation after it; two or three
 * speak-to points, at any length, each judged from the ticket's take or
 * from its own (RR24, cited on its beside row); a dive's code at any number
 * of lines and columns, tabs included; and the host that records it, whose sans face the
 * frame draws in (`./frame-text`'s `SANS`): a cloud session's Inter, and
 * home's render image's WenQuanYi Zen Hei.
 *
 * Proof: `apps/www/tests/ui-fit/essay-fit.spec.ts` draws the sample, an
 * essay with points answered by takes of their own (`by-points`), and
 * essays with each of those texts, and the code by lines, columns and tabs,
 * grown to the most this accepts, on the real stage, and fails where this
 * says a scene is shorter than drawn or an accepted scene overflows or clips
 * its code. CI runs it in the Playwright image home's render image is built
 * from (`pr.yml`), as CF1's; a session's Inter was checked by hand,
 * 2026-11-18.
 *
 * Tolerance: CF1's. The other scenes are outside the Family: the answer
 * scene shows the owner's transcript, which no length bounds and the routine
 * can't shorten (#3187), and the open, question, weeks and next scenes
 * restate what earlier files hold. The fork scene (RR29) is outside it too
 * until a model of it lands: `essay-fit.spec.ts` draws one fork and holds
 * that it fits. So is a ticket of 1, or 4 to 6, points (version 4), which
 * the spec doesn't draw yet. The recorder's `data-overflow` refusal
 * stays the guard there, so no video is cut off.
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

/** The scene's tag: one line of capitals. */
const TAG: Part = { h: lineOf(0.7), em: 0.7 }

/**
 * A list as the stage draws its items: `em`, indented `pl-[1.2em]`, with
 * `space-y-[<gap>em]` between them.
 */
function list(
  items: ReadonlyArray<ReadonlyArray<Run>>,
  em: number,
  gap: number
): Part {
  const width = CARD.width - px(1.2 * em)
  const h = items.reduce(
    (sum, runs, i) => sum + lines(runs, width, em) + (i > 0 ? px(gap * em) : 0),
    0
  )
  return { h, em }
}

const CODE_EM = 0.62

/** The widest code line the card shows whole, in columns of the mono face. */
const CODE_COLUMNS = Math.floor(
  (CARD.width - 2 * px(0.8 * CODE_EM) - 2) / widthOf("m", "mono", CODE_EM)
)

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

function code(text: string): Part {
  const n = text.trimEnd().split("\n").length
  return {
    h: n * px(CODE_EM) * SNUG + 2 * px(0.5 * CODE_EM) + 2,
    em: CODE_EM,
  }
}

function best(ticket: EssayTicket): number {
  return stack([
    TAG,
    list(
      ticket.points.map((point) => [
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
  const em = 0.8
  const pointWidth = CARD.width * ESSAY_POINT_COLUMN - px(em)
  const yoursWidth = CARD.width * (1 - ESSAY_POINT_COLUMN)
  const rows = ticket.points.reduce(
    (sum, point, i) => {
      const mark = markOf(ticket, i)
      // The mark line with its cite (RR24), measured at its longest mark.
      const cite = pointCite(ticket, i)
      const line =
        cite === null
          ? ESSAY_STAGE_WORDS.unheard
          : `${ESSAY_STAGE_WORDS.unheard} · ${cite}`
      const yours =
        lines(inline(line, em), yoursWidth, em) +
        (mark?.note === undefined
          ? 0
          : lines(inline(mark.note, em * 0.9), yoursWidth, em * 0.9))
      const to = lines(inline(point.to, em), pointWidth, em)
      return sum + 1 + 2 * px(0.3 * em) + Math.max(to, yours)
    },
    lineOf(0.85 * em)
  )
  const why =
    answer.kind === "take"
      ? lines(inline(answer.solo.why, em), CARD.width, em)
      : lineOf(em)
  return stack([TAG, { h: rows, em }, SOLO, { h: why, em }])
}

function dive(ticket: EssayTicket, k: number): number {
  const d = ticket.dives[k]
  if (d === undefined) return 0
  const point = ticket.points.at(d.point)
  return stack([
    TAG,
    {
      h: linesOf(inline(d.title, 1.4, "bold"), CARD.width) * px(1.4) * TIGHT,
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

/** A scene this models: its id, and its content's height in px. */
export type EssayFitScene = { readonly id: string; readonly h: number }

/**
 * The height of each best, beside and deep dive scene of `essay`, and what
 * runs past the frame: each such scene, how far, and what to shorten.
 */
export function essayFit(essay: Essay): {
  readonly scenes: ReadonlyArray<EssayFitScene>
  readonly problems: ReadonlyArray<string>
} {
  const scenes: Array<EssayFitScene> = []
  const problems: Array<string> = []
  for (const scene of essayScenes(essay)) {
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
    const wide = (ticket.dives[k]?.code ?? "")
      .split("\n")
      .filter((line) => codeColumns(line) > CODE_COLUMNS)
    if (scene.section === "dive" && wide.length > 0)
      problems.push(
        `${ticket.id} ${name} (${scene.id}): ${wide.length} code lines are wider than the frame's ${CODE_COLUMNS} columns`
      )
  }
  return { scenes, problems }
}
