/**
 * What the weekly call's captioned frame holds (CF1, #2918): each scene's
 * picture, laid out as the stage lays it out (`apps/www`'s
 * `web-surface/call/stage.tsx`), measured in CSS px at the 1920×1080 frame
 * the recorder draws, with an allowance that errs toward too long.
 *
 * From version 2 the frame keeps its foot for the captions (SFEED2), so a
 * scene's picture has the body above it: `CALL_BODY`. A scene too long for
 * it is paged: its title on every page, its lists and parts carried on in
 * order (`callFit`'s `pages`), so nothing is cut. `callScenes` makes each
 * page a scene, and `call-check` refuses only a single part taller than a
 * whole frame (`problems`), before the week is published rather than an
 * hour into a recording.
 *
 * CF1 (promise): a week a captioned template draws that `parseCallWeek`
 * accepts has no scene the stage's frame overflows, and shows every entry
 * of every list on exactly one page; one it refuses names each scene and
 * what to shorten.
 *
 * Family: every list's length (board rows, which pick the board's columns,
 * pulls per batch, later asks, options, refs, next steps); every text's
 * length and how it wraps, in the routine's prose, including a part split
 * from the rest by a page break; and the host that
 * records it, whose sans face the frame draws in (`./frame-text`'s `SANS`): a cloud
 * session's Inter, and home's render image's WenQuanYi Zen Hei.
 *
 * Proof: `apps/www/tests/ui-fit/call-fit.spec.ts` draws the sample, the week
 * of 2026-11-06 (which overflowed, #2918), every list at its longest, and
 * every free text grown to the most this accepts, on the real stage, and
 * fails where this says a scene is shorter than drawn or an accepted scene
 * overflows. CI runs it in the Playwright image home's render image is
 * built from (`pr.yml`); a session's Inter was checked by hand, 2026-11-14.
 * `__tests__/call-fit.test.ts` holds what is counted and what refused.
 *
 * Tolerance: a host whose sans face is wider than `SANS` (DejaVu Sans is
 * about 15% wider) and text far wider than prose (whole sentences in
 * capitals) can still overflow; the recorder's `data-overflow` refusal stays
 * the guard there, so no video is cut off. A version 1 week has no caption
 * band and is drawn as it always was.
 */

import type { CallWeek } from "./call"
import { lineOf, linesOf, px, stack, widthOf } from "./frame-text"
import type { Face, Part } from "./frame-text"
import { refKey } from "./refs"

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

const text = (
  words: string,
  face: Face,
  em: number,
  width: number = CALL_BODY.width
): number => linesOf([{ text: words, face, em }], width) * lineOf(em)

/** A run of refs, as the stage's `Refs` sets them. */
const refs = (
  list: ReadonlyArray<{ readonly repo: string; readonly number: number }>,
  em: number,
  width: number = CALL_BODY.width
): number =>
  linesOf(
    list.map((r, i) => ({
      text: refKey(r),
      face: "mono" as const,
      em,
      ...(i > 0 ? { before: px(em) } : {}),
    })),
    width
  ) * lineOf(em)

const title = (words: string): Part => ({
  h: text(words, "bold", 1.6),
  em: 1.6,
})

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

/**
 * A run of a scene's picture the stage draws in one box, which a page may
 * carry part of: a list's entries, an option list, a labelled field.
 * `units` are what a page break may fall between; each holds `count` of the
 * group's entries (a board's grid row holds a row of cards).
 */
type Group = {
  readonly key: CallGroup
  /** What the box adds above its units: a field's label. */
  readonly head: number
  /** Its font size, for the margin below it. */
  readonly em: number
  /** The gap between two of its units. */
  readonly within: number
  readonly units: ReadonlyArray<{
    readonly h: number
    readonly count: number
    /** What it shows, read for how long a silent page holds. */
    readonly words: string
  }>
  /**
   * A paragraph's words, where the group is one: its entries are the words,
   * and a page break may fall between any two of them.
   */
  readonly paragraph?: ReadonlyArray<string>
}

/** The boxes a scene's picture is drawn in, below its title. */
export type CallGroup =
  | "rows"
  | "pulls"
  | "later"
  | "landed"
  | "next"
  | "promise"
  | "options"
  | "why"
  | "undo"
  | "refs"

/** A scene's layout: a title every page repeats, and its groups in order. */
type Layout = {
  readonly title: Part | null
  /** The words its title shows. */
  readonly titled: string
  readonly groups: ReadonlyArray<Group>
}

/** One unit in a group of its own. */
const one = (
  key: CallGroup,
  h: number,
  words: string,
  { head = 0, em = 1 }: { readonly head?: number; readonly em?: number } = {}
): Group => ({ key, head, em, within: 0, units: [{ h, count: 1, words }] })

const FIELD_HEAD = lineOf(0.7) + 0.2 * px(0.7)

/** A paragraph's words, as the model and the stage both break it. */
export const paragraphWords = (said: string): ReadonlyArray<string> =>
  said.split(/\s+/).filter((word) => word.length > 0)

/** A paragraph's height, 1em prose across the body. */
const paragraphH = (words: ReadonlyArray<string>): number =>
  text(words.join(" "), "prose", 1)

/**
 * A labelled paragraph (why, why it's yours, how to undo it): its entries
 * its words, so a paragraph too long for one page carries on onto the next.
 */
function paragraph(key: CallGroup, said: string): Group {
  const words = paragraphWords(said)
  return {
    key,
    head: FIELD_HEAD,
    em: 1,
    within: 0,
    units: [{ h: paragraphH(words), count: words.length, words: said }],
    paragraph: words,
  }
}

const refWords = (
  list: ReadonlyArray<{ readonly repo: string; readonly number: number }>
): string => list.map(refKey).join(" ")

/** An option list, as the stage's `Options` draws it. */
const options = (
  list: ReadonlyArray<{ readonly says: string; readonly unblocks?: string }>,
  marked: number | undefined
): Group => ({
  key: "options",
  head: 0,
  em: 1,
  within: px(0.4),
  units: list.map((o, i) => ({
    h: option(o, i === marked),
    count: 1,
    words: `${o.says} ${o.unblocks ?? ""}`,
  })),
})

/** The board's look, chosen by how many rows it has. */
export const boardLook = (
  rows: number
): { readonly columns: number; readonly em: number; readonly gap: number } =>
  rows > 24
    ? { columns: 4, em: 0.55, gap: 0.3 }
    : { columns: 3, em: 0.7, gap: 0.4 }

function boardLayout(week: CallWeek): Layout {
  const rows = week.board.rows
  const look = boardLook(rows.length)
  const gap = px(look.gap * look.em)
  const card =
    (CALL_BODY.width - gap * (look.columns - 1)) / look.columns -
    2 * px(0.6 * look.em) -
    2
  const units = []
  for (let i = 0; i < rows.length; i += look.columns) {
    const line = rows.slice(i, i + look.columns)
    units.push({
      h: Math.max(
        ...line.map(
          (row) =>
            text(row.title, "bold", look.em, card) +
            lineOf(0.85 * look.em) +
            2 * px(0.4 * look.em) +
            2
        )
      ),
      count: line.length,
      words: line.map((row) => row.title).join(" "),
    })
  }
  return {
    title: null,
    titled: "",
    groups: [{ key: "rows", head: 0, em: look.em, within: gap, units }],
  }
}

function batchLayout(batch: CallWeek["done"][number]): Layout {
  return {
    title: title(batch.title),
    titled: batch.title,
    groups: [
      {
        key: "pulls",
        head: 0,
        em: 0.85,
        within: px(0.3 * 0.85),
        units: batch.pulls.map((pull) => ({
          h:
            linesOf(
              [
                { text: refKey(pull), face: "mono", em: 0.85 },
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
            ) * lineOf(0.85),
          count: 1,
          words: pull.title,
        })),
      },
    ],
  }
}

/** The close's title, the stage's own words. */
const CLOSE_TITLE = "The weekly call"

function closeLayout(week: CallWeek): Layout {
  return {
    title: title(CLOSE_TITLE),
    titled: CLOSE_TITLE,
    groups:
      week.later.length === 0
        ? []
        : [
            {
              key: "later",
              head: FIELD_HEAD,
              em: 1,
              within: px(0.3 * 0.85),
              units: week.later.map((ask) => ({
                h: text(ask.question, "prose", 0.85) + refs(ask.refs, 0.68),
                count: 1,
                words: ask.question,
              })),
            },
          ],
  }
}

function movedLayout(m: CallWeek["moved"][number]): Layout {
  const ref = refKey(m.epic)
  return {
    title: {
      h:
        linesOf(
          [
            { text: m.tag, face: "bold", em: 1.6 },
            { text: ref, face: "mono", em: 1.6 },
          ],
          CALL_BODY.width
        ) * lineOf(1.6),
      em: 1.6,
    },
    titled: `${m.tag} ${ref}`,
    groups: [
      ...(m.landed.length > 0
        ? [
            one("landed", refs(m.landed, 0.8), refWords(m.landed), {
              head: FIELD_HEAD,
            }),
          ]
        : []),
      ...(m.next.length > 0
        ? [
            {
              key: "next" as const,
              head: FIELD_HEAD,
              em: 1,
              within: 0,
              units: m.next.map((step) => ({
                h: text(step, "prose", 1, CALL_BODY.width - px(1.2)),
                count: 1,
                words: step,
              })),
            },
          ]
        : []),
    ],
  }
}

function grayLayout(g: CallWeek["gray"][number]): Layout {
  return {
    title: title(g.title),
    titled: g.title,
    groups: [
      ...(g.promise === undefined
        ? []
        : [one("promise", lineOf(1), g.promise, { head: FIELD_HEAD })]),
      one("refs", refs(g.refs, 0.8), refWords(g.refs), { em: 0.8 }),
    ],
  }
}

function mineLayout(c: CallWeek["mine"][number]): Layout {
  return {
    title: title(c.title),
    titled: c.title,
    groups: [
      options(
        c.options.map((says) => ({ says })),
        c.chose
      ),
      paragraph("why", c.why),
      paragraph("undo", c.undo),
      one("refs", refs(c.refs, 0.8), refWords(c.refs), { em: 0.8 }),
    ],
  }
}

function askLayout(a: CallWeek["asks"][number]): Layout {
  return {
    title: title(a.question),
    titled: a.question,
    groups: [
      paragraph("why", a.whyYours),
      options(a.options, a.recommended),
      one("refs", refs(a.refs, 0.8), refWords(a.refs), { em: 0.8 }),
    ],
  }
}

/** Of each group a page carries, the entries it shows: `[from, to)`. */
export type CallPageShows = Readonly<
  Partial<Record<CallGroup, readonly [number, number]>>
>

/** One page of a scene: what it shows, and how tall the model says it is. */
export type CallPage = {
  readonly shows: CallPageShows
  readonly h: number
  /** The words it shows, for how long a page said over by nothing holds. */
  readonly words: string
}

/** A scene's units, in order, each with its group and its entries. */
type Placed = {
  readonly group: Group
  readonly h: number
  readonly from: number
  readonly to: number
  readonly words: string
}

function heightOf(layout: Layout, placed: ReadonlyArray<Placed>): number {
  const parts: Array<Part> = layout.title === null ? [] : [layout.title]
  for (const group of layout.groups) {
    const mine = placed.filter((unit) => unit.group === group)
    if (mine.length === 0) continue
    parts.push({
      h:
        group.head +
        mine.reduce((sum, unit) => sum + unit.h, 0) +
        group.within * (mine.length - 1),
      em: group.em,
    })
  }
  return stack(parts)
}

function pageOf(layout: Layout, placed: ReadonlyArray<Placed>): CallPage {
  const shows: Partial<Record<CallGroup, readonly [number, number]>> = {}
  for (const unit of placed) {
    const was = shows[unit.group.key]
    shows[unit.group.key] = [was?.[0] ?? unit.from, unit.to]
  }
  return {
    shows,
    h: heightOf(layout, placed),
    words: [layout.titled, ...placed.map((unit) => unit.words)].join(" "),
  }
}

/**
 * `layout` paged into the body: as many units on a page as fit, in order,
 * the title on each; a unit too tall for a page of its own is `tooTall`.
 */
function paged(
  layout: Layout,
  words: boolean
): {
  readonly pages: ReadonlyArray<CallPage>
  readonly tooTall: number
} {
  const units: Array<Placed> = []
  for (const group of layout.groups) {
    let from = 0
    for (const unit of group.units) {
      units.push({
        group,
        h: unit.h,
        from,
        to: from + unit.count,
        words: unit.words,
      })
      from += unit.count
    }
  }
  const pages: Array<CallPage> = []
  let tooTall = 0
  let page: Array<Placed> = []
  const fits = (placed: ReadonlyArray<Placed>): boolean =>
    heightOf(layout, placed) <= CALL_BODY.height
  /** Words `[from, to)` of a paragraph unit, as a unit of their own. */
  const piece = (unit: Placed, from: number, to: number): Placed => {
    const words = unit.group.paragraph?.slice(from, to) ?? []
    return { ...unit, h: paragraphH(words), from, to, words: words.join(" ") }
  }
  const queue = [...units]
  for (let unit = queue.shift(); unit !== undefined; unit = queue.shift()) {
    if (fits([...page, unit])) {
      page.push(unit)
      continue
    }
    if (
      words &&
      unit.group.paragraph !== undefined &&
      unit.to - unit.from > 1
    ) {
      // As many of its words as this page holds; the rest on the next.
      let k = 0
      while (
        unit.from + k + 1 < unit.to &&
        fits([...page, piece(unit, unit.from, unit.from + k + 1)])
      )
        k += 1
      if (k > 0) {
        page.push(piece(unit, unit.from, unit.from + k))
        pages.push(pageOf(layout, page))
        page = []
        queue.unshift(piece(unit, unit.from + k, unit.to))
        continue
      }
    }
    if (page.length > 0) {
      pages.push(pageOf(layout, page))
      page = []
      queue.unshift(unit)
      continue
    }
    // Alone on a page and still too tall: a single word, or a part that
    // can't be broken (a title, an option, a pull request).
    tooTall = Math.max(tooTall, heightOf(layout, [unit]) - CALL_BODY.height)
    page.push(unit)
  }
  pages.push(pageOf(layout, page))
  return { pages, tooTall }
}

/** About how many lines of the body's text `over` px is. */
const linesOver = (over: number): number => Math.ceil(over / lineOf(1))

/**
 * Each paged scene of a week in the captioned frame, by its scene's id
 * (`board`, `done-3`, `close`, ...): its pages, every entry of every list
 * on one of them, none left out. And every scene with one part too tall for
 * a page of its own, said so the routine can shorten it.
 */
export function callFit(
  week: CallWeek,
  {
    words = true,
  }: {
    /**
     * Whether a paragraph too long for its page carries on, word by word
     * (from version 5); otherwise it moves to the next page whole, and one
     * taller than a page is refused.
     */
    readonly words?: boolean
  } = {}
): {
  readonly pages: Readonly<Record<string, ReadonlyArray<CallPage>>>
  readonly problems: ReadonlyArray<string>
} {
  const scenes: Array<{
    readonly id: string
    readonly item?: string
    readonly fix: string
    readonly layout: Layout
  }> = [
    { id: "board", fix: "the longest board title", layout: boardLayout(week) },
    ...week.moved.map((m, i) => ({
      id: `moved-${i + 1}`,
      item: m.id,
      fix: "its longest next step",
      layout: movedLayout(m),
    })),
    ...week.done.map((b, i) => ({
      id: `done-${i + 1}`,
      item: b.id,
      fix: "its title or its longest pull request's",
      layout: batchLayout(b),
    })),
    ...week.gray.map((g, i) => ({
      id: `gray-${i + 1}`,
      item: g.id,
      fix: "its title",
      layout: grayLayout(g),
    })),
    ...week.mine.map((c, i) => ({
      id: `mine-${i + 1}`,
      item: c.id,
      fix: words
        ? "its title or its longest option"
        : "its title, why, or how to undo it",
      layout: mineLayout(c),
    })),
    ...week.asks.map((a, i) => ({
      id: `asks-${i + 1}`,
      item: a.id,
      fix: words
        ? "its question or its longest option"
        : "its question or why it's yours",
      layout: askLayout(a),
    })),
    { id: "close", fix: "the longest later ask", layout: closeLayout(week) },
  ]
  const pages: Record<string, ReadonlyArray<CallPage>> = {}
  const problems: Array<string> = []
  for (const scene of scenes) {
    const { pages: each, tooTall } = paged(scene.layout, words)
    pages[scene.id] = each
    if (tooTall > 0) {
      const lines = linesOver(tooTall)
      problems.push(
        `${scene.id}${scene.item === undefined ? "" : ` (${scene.item})`}: one part of it runs past a whole frame by about ${lines} ${lines === 1 ? "line" : "lines"}; shorten ${scene.fix}`
      )
    }
  }
  return { pages, problems }
}
