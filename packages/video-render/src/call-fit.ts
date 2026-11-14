/**
 * What the weekly call's captioned frame holds (CF1, #2918): each scene's
 * picture, laid out as the stage lays it out (`apps/www`'s
 * `web-surface/call/stage.tsx`), measured in CSS px at the 1920×1080 frame
 * the recorder draws, with an allowance that errs toward too long.
 *
 * From version 2 the frame keeps its foot for the captions (SFEED2), so a
 * scene's picture has the body above it: `CALL_BODY`. The stage shows only
 * as many of a list as this says fit (`shown`), and counts the rest; words
 * that can't be shortened by counting (an ask's question, its options) are
 * refused (`problems`), so `call-check` refuses the week before it is
 * published, rather than the recorder after an hour of drawing.
 *
 * CF1 (promise): a week a captioned template draws that `parseCallWeek`
 * accepts has no scene the stage's frame overflows, and one it refuses names
 * each scene and what to shorten.
 *
 * Family: every list's length (board rows, which pick the board's columns,
 * pulls per batch, later asks, options, refs, next steps); every text's
 * length and how it wraps, in the routine's prose; and the host that
 * records it, whose sans face the frame draws in (`SANS`): a cloud
 * session's Inter, and home's render image's WenQuanYi Zen Hei.
 *
 * Proof: `apps/www/tests/ui-fit/call-fit.spec.ts` draws the sample, the week
 * of 2026-11-06 (which overflowed, #2918), every list at its longest, and
 * every free text grown to the most this accepts, on the real stage, and
 * fails where this says a scene is shorter than drawn or an accepted scene
 * overflows; run in a session and in home's render image on 2026-11-14.
 * `__tests__/call-fit.test.ts` holds what is counted and what refused.
 *
 * Tolerance: a host whose sans face is wider than `SANS` (DejaVu Sans is
 * about 15% wider) and text far wider than prose (whole sentences in
 * capitals) can still overflow; the recorder's `data-overflow` refusal stays
 * the guard there, so no video is cut off. A version 1 week has no caption
 * band and is drawn as it always was.
 */

import type { CallWeek } from "./call"

/** The frame's font size: the stage's `1.5cqw`, at 1920 px wide. */
const BASE = 28.8

/**
 * A line's height per em: the stage's 1.5, with room for a line that mixes
 * in the monospace face, whose line box is a little taller (measured 1.53).
 */
const LINE = 1.56

/**
 * Each printable ASCII glyph's advance, from the space (32) to the tilde
 * (126), in thousandths of an em: the widest of the stage's sans face on
 * each host that records it, regular (`SANS`) and semibold or bold
 * (`SANS_BOLD`). The frame names no face of its own (`ui-sans-serif,
 * system-ui, sans-serif`), so each host draws its own: Inter in a cloud
 * session, and WenQuanYi Zen Hei in home's render image (the Playwright
 * 1.62.1 noble image `infra/render/Dockerfile` pins), measured 2026-11-14.
 */
// prettier-ignore
const SANS = [
  300, 300, 466, 634, 642, 982, 680, 300, 365, 365, 600, 662, 300, 460, 300,
  520, 631, 600, 610, 618, 646, 608, 621, 600, 619, 621, 300, 302, 662, 662,
  662, 540, 966, 704, 655, 731, 722, 602, 591, 747, 744, 269, 571, 672, 566,
  904, 754, 765, 639, 765, 644, 642, 646, 745, 704, 1008, 683, 679, 629, 365,
  520, 365, 600, 500, 380, 562, 613, 572, 613, 584, 335, 614, 592, 243, 243,
  549, 243, 876, 591, 600, 613, 613, 391, 528, 320, 592, 563, 819, 546, 563,
  553, 427, 333, 427, 662,
] as const

// prettier-ignore
const SANS_BOLD = [
  300, 338, 552, 649, 655, 1016, 680, 339, 377, 377, 600, 679, 334, 468, 334,
  520, 675, 600, 630, 646, 677, 640, 650, 600, 651, 650, 334, 343, 679, 679,
  679, 560, 1017, 760, 662, 740, 723, 608, 588, 751, 748, 281, 585, 720, 566,
  932, 763, 771, 648, 777, 657, 655, 668, 736, 760, 1058, 739, 731, 665, 377,
  520, 377, 600, 500, 380, 581, 631, 589, 631, 596, 361, 632, 623, 271, 271,
  581, 271, 913, 623, 614, 631, 631, 414, 561, 335, 623, 600, 851, 581, 603,
  573, 469, 372, 469, 679,
] as const

/** Any other glyph's advance, in em: the widest measured (an em dash, an arrow). */
const OTHER = 1.02

/** The monospace face's advance, in em: 0.602 in a session, 0.5 at home. */
const MONO = 0.61

/** Kerning and rounding: what a run's summed advances are padded by. */
const SLACK = 1

/** The capitals' tracking, `tracking-wide`, in em per glyph. */
const TRACKING = 0.025

/**
 * How a run is set: the sans face regular, semibold or bold, its capitals
 * (taken at bold), or the monospace face.
 */
type Face = "prose" | "bold" | "caps" | "mono"

/** One glyph's advance in `face`, in em. */
function advance(glyph: string, face: Face): number {
  if (face === "mono") return MONO
  const code = glyph.codePointAt(0) ?? 0
  const table = face === "prose" ? SANS : SANS_BOLD
  const sans = code >= 32 && code <= 126 ? table[code - 32] : undefined
  const em = sans === undefined ? OTHER : sans / 1000
  return face === "caps" ? em + TRACKING : em
}

/** A word's width in `face` at `em`, in px. */
function widthOf(word: string, face: Face, em: number): number {
  const set = face === "caps" ? word.toUpperCase() : word
  let sum = 0
  for (const glyph of set) sum += advance(glyph, face)
  return sum * SLACK * em * BASE
}

/** The body of the captioned frame a scene's picture is drawn in, in px. */
export const CALL_BODY = { width: 1825, height: 573 } as const

/**
 * The words the stage adds that the model sets in their place: the widest
 * mark beside an option or a pull ("Recommended", in capitals), the label
 * before what an option unblocks. The stage's words are held to them (`apps/www`'s `call/view.test.ts`).
 */
export const CALL_STAGE_WORDS = {
  mark: "Recommended",
  unblocks: "Unblocks:",
} as const

/** Whether the stage's `word`, in `face`, is no wider than the model's `allowed`. */
export const fitsAllowance = (
  word: string,
  allowed: string,
  face: Face
): boolean => widthOf(word, face, 1) <= widthOf(allowed, face, 1)

const px = (em: number): number => em * BASE

const lineOf = (em: number): number => px(em) * LINE

type Run = {
  readonly text: string
  readonly face: Face
  /** Its font size, in em of the frame's. */
  readonly em: number
  /** Space before it, in px, on the same line: a margin or a gap. */
  readonly before?: number
}

/**
 * How many lines `runs` wrap to in `width` px, greedily by word, a word
 * wider than a line broken across lines as `overflow-wrap: anywhere` does.
 */
export function linesOf(runs: ReadonlyArray<Run>, width: number): number {
  let lines = 1
  let x = 0
  for (const run of runs) {
    const space = widthOf(" ", run.face, run.em)
    const words = run.text.split(/\s+/).filter((w) => w.length > 0)
    for (const [i, word] of words.entries()) {
      const gap = i === 0 ? (run.before ?? space) : space
      const w = widthOf(word, run.face, run.em)
      if (x > 0 && x + gap + w > width) {
        lines += 1
        x = 0
      }
      x += x > 0 ? gap + w : w
      while (x > width) {
        lines += 1
        x -= width
      }
    }
  }
  return lines
}

const text = (
  words: string,
  face: Face,
  em: number,
  width: number = CALL_BODY.width
): number => linesOf([{ text: words, face, em }], width) * lineOf(em)

/** A run of refs, as the stage's `Refs` sets them: mono, 1em apart. */
const refs = (
  list: ReadonlyArray<{ readonly repo: string; readonly number: number }>,
  em: number,
  width: number = CALL_BODY.width
): number =>
  linesOf(
    list.map((r, i) => ({
      text: `${r.repo}#${r.number}`,
      face: "mono" as const,
      em,
      ...(i > 0 ? { before: px(em) } : {}),
    })),
    width
  ) * lineOf(em)

/** A labelled field: its label, 0.2em of the label's size, then what it holds. */
const field = (holds: number): Part => ({
  h: lineOf(0.7) + 0.2 * px(0.7) + holds,
  em: 1,
})

/** A scene's title: 1.6em, bold. */
const title = (words: string): Part => ({
  h: text(words, "bold", 1.6),
  em: 1.6,
})

/** A run of refs as a part of the scene, 0.8em. */
const refsPart = (
  list: ReadonlyArray<{ readonly repo: string; readonly number: number }>
): Part => ({ h: refs(list, 0.8), em: 0.8 })

/** A line that counts what isn't shown: "and 3 more", 0.85em. */
const more: Part = { h: lineOf(0.85), em: 0.85 }

/** An option, as the stage's `Options` draws it, marked or not. */
function option(
  o: { readonly says: string; readonly unblocks?: string },
  marked: boolean
): number {
  const border = marked ? 4 : 2
  const inner = CALL_BODY.width - 2 * px(0.6) - border
  const says =
    linesOf(
      [
        { text: o.says, face: "prose", em: 1 },
        ...(marked
          ? [
              {
                text: CALL_STAGE_WORDS.mark,
                face: "caps" as const,
                em: 0.7,
                before: px(0.6 * 0.7),
              },
            ]
          : []),
      ],
      inner
    ) * lineOf(1)
  const unblocks =
    o.unblocks === undefined
      ? 0
      : text(`${CALL_STAGE_WORDS.unblocks} ${o.unblocks}`, "prose", 0.75, inner)
  return border + 2 * px(0.3) + says + unblocks
}

const options = (
  list: ReadonlyArray<{ readonly says: string; readonly unblocks?: string }>,
  marked: number | undefined
): Part => ({
  h:
    list.reduce((sum, o, i) => sum + option(o, i === marked), 0) +
    px(0.4) * Math.max(0, list.length - 1),
  em: 1,
})

/** A part of a scene: its height, and its font size, in em of the frame's. */
type Part = { readonly h: number; readonly em: number }

/**
 * Parts stacked as `space-y-[0.6em]` stacks them: each but the last with a
 * margin below of 0.6em of its own font size.
 */
const stack = (parts: ReadonlyArray<Part>): number =>
  parts.reduce(
    (sum, part, i) =>
      sum + part.h + (i < parts.length - 1 ? 0.6 * px(part.em) : 0),
    0
  )

/** The most of `n` whose height, `of(k)`, fits the body; 0 when none does. */
function most(n: number, of: (k: number) => number): number {
  let k = n
  while (k > 0 && of(k) > CALL_BODY.height) k -= 1
  return k
}

/** How many of a week's lists the stage shows: the rest it counts. */
export type CallShown = {
  readonly board: number
  readonly later: number
  /** Pulls shown per batch, by the batch's id. */
  readonly pulls: Readonly<Record<string, number>>
}

/** The board's look, chosen by how many rows it has. */
export const boardLook = (
  rows: number
): { readonly columns: number; readonly em: number; readonly gap: number } =>
  rows > 24
    ? { columns: 4, em: 0.55, gap: 0.3 }
    : { columns: 3, em: 0.7, gap: 0.4 }

function boardHeight(week: CallWeek, k: number): number {
  const total = week.board.rows.length
  const look = boardLook(total)
  const gap = px(look.gap * look.em)
  const card =
    (CALL_BODY.width - gap * (look.columns - 1)) / look.columns -
    2 * px(0.6 * look.em) -
    2
  const heights = week.board.rows
    .slice(0, k)
    .map(
      (row) =>
        text(row.title, "bold", look.em, card) +
        lineOf(0.85 * look.em) +
        2 * px(0.4 * look.em) +
        2
    )
  let grid = 0
  for (let i = 0; i < heights.length; i += look.columns)
    grid += Math.max(...heights.slice(i, i + look.columns))
  grid += gap * Math.max(0, Math.ceil(k / look.columns) - 1)
  const part = { h: grid, em: look.em }
  return stack(k < total ? [part, more] : [part])
}

/** The most pulls a batch lists, frame or no frame (`PULLS_SHOWN`). */
export const CALL_PULLS_MOST = 10

/** The most later asks the close lists, frame or no frame. */
export const CALL_LATER_SHOWN_MOST = 6

function batchHeight(batch: CallWeek["done"][number], k: number): number {
  const pulls = batch.pulls.slice(0, k).map(
    (pull) =>
      linesOf(
        [
          { text: `${pull.repo}#${pull.number}`, face: "mono", em: 0.85 },
          { text: pull.title, face: "prose", em: 0.85 },
          ...(pull.change === undefined
            ? []
            : [
                {
                  text: CALL_STAGE_WORDS.mark,
                  face: "caps" as const,
                  em: 0.68,
                  before: px(0.5 * 0.68),
                },
              ]),
        ],
        CALL_BODY.width
      ) * lineOf(0.85)
  )
  const list =
    pulls.reduce((a, b) => a + b, 0) + px(0.3 * 0.85) * Math.max(0, k - 1)
  return stack([
    title(batch.title),
    { h: list, em: 0.85 },
    ...(k < batch.pulls.length ? [more] : []),
  ])
}

function closeHeight(week: CallWeek, k: number): number {
  if (week.later.length === 0) return title("x").h
  const asks = week.later
    .slice(0, k)
    .map((ask) => text(ask.question, "prose", 0.85) + refs(ask.refs, 0.68))
  const list =
    asks.reduce((a, b) => a + b, 0) + px(0.3 * 0.85) * Math.max(0, k - 1)
  return stack([
    title("The weekly call"),
    field(list + (k < week.later.length ? more.h : 0)),
  ])
}

/** Each item scene's height, by its id in the week, for the words refused. */
function itemHeights(week: CallWeek): ReadonlyArray<{
  readonly id: string
  readonly scene: string
  readonly fix: string
  readonly h: number
}> {
  return [
    ...week.moved.map((m, i) => ({
      id: m.id,
      scene: `moved-${i + 1}`,
      fix: "its next steps",
      h: stack([
        {
          h:
            linesOf(
              [
                { text: m.tag, face: "bold", em: 1.6 },
                {
                  text: `${m.epic.repo}#${m.epic.number}`,
                  face: "mono",
                  em: 1.6,
                },
              ],
              CALL_BODY.width
            ) * lineOf(1.6),
          em: 1.6,
        },
        ...(m.landed.length > 0 ? [field(refs(m.landed, 0.8))] : []),
        ...(m.next.length > 0
          ? [
              field(
                m.next.reduce(
                  (sum, step) =>
                    sum + text(step, "prose", 1, CALL_BODY.width - px(1.2)),
                  0
                )
              ),
            ]
          : []),
      ]),
    })),
    ...week.gray.map((g, i) => ({
      id: g.id,
      scene: `gray-${i + 1}`,
      fix: "its title or refs",
      h: stack([
        title(g.title),
        ...(g.promise === undefined ? [] : [field(lineOf(1))]),
        refsPart(g.refs),
      ]),
    })),
    ...week.mine.map((c, i) => ({
      id: c.id,
      scene: `mine-${i + 1}`,
      fix: "its title, options, why or how to undo it",
      h: stack([
        title(c.title),
        options(
          c.options.map((says) => ({ says })),
          c.chose
        ),
        field(text(c.why, "prose", 1)),
        field(text(c.undo, "prose", 1)),
        refsPart(c.refs),
      ]),
    })),
    ...week.asks.map((a, i) => ({
      id: a.id,
      scene: `asks-${i + 1}`,
      fix: "its question, why it's yours, its options or what they unblock",
      h: stack([
        title(a.question),
        field(text(a.whyYours, "prose", 1)),
        options(a.options, a.recommended),
        refsPart(a.refs),
      ]),
    })),
  ]
}

/** About how many lines of the body's text `over` px is. */
const linesOver = (over: number): number => Math.ceil(over / lineOf(1))

/**
 * What the stage shows of each list in the captioned frame, and every scene
 * whose words can't fit it, said so the routine can shorten them.
 */
export function callFit(week: CallWeek): {
  readonly shown: CallShown
  readonly problems: ReadonlyArray<string>
  /** Each scene's picture's height as estimated, in px, by scene id. */
  readonly heights: Readonly<Record<string, number>>
} {
  const heights: Record<string, number> = {}
  const problems: Array<string> = []
  const tooLong = (scene: string, h: number, fix: string): void => {
    if (h > CALL_BODY.height)
      problems.push(
        `${scene}: its words run past the frame by about ${linesOver(h - CALL_BODY.height)} ${linesOver(h - CALL_BODY.height) === 1 ? "line" : "lines"}; shorten ${fix}`
      )
  }
  const board = most(week.board.rows.length, (k) => boardHeight(week, k))
  heights["board"] = boardHeight(week, Math.max(1, board))
  if (board === 0) tooLong("board", boardHeight(week, 1), "its rows' titles")
  const pulls: Record<string, number> = {}
  for (const [i, batch] of week.done.entries()) {
    const n = Math.min(batch.pulls.length, CALL_PULLS_MOST)
    const k = most(n, (j) => batchHeight(batch, j))
    pulls[batch.id] = k
    heights[`done-${i + 1}`] = batchHeight(batch, Math.max(1, k))
    if (k === 0)
      tooLong(
        `done-${i + 1} (${batch.id})`,
        batchHeight(batch, 1),
        "its title or its first pull request's"
      )
  }
  const laterMost = Math.min(week.later.length, CALL_LATER_SHOWN_MOST)
  const later = most(laterMost, (k) => closeHeight(week, k))
  heights["close"] = closeHeight(week, Math.max(1, later))
  if (later === 0 && week.later.length > 0)
    tooLong("close", closeHeight(week, 1), "the first later ask's question")
  for (const item of itemHeights(week)) {
    heights[item.scene] = item.h
    tooLong(`${item.scene} (${item.id})`, item.h, item.fix)
  }
  return { shown: { board, later, pulls }, problems, heights }
}
