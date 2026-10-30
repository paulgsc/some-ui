/**
 * Where a playlist's autoplay goes from the video playing, row by row
 * (`docs/absent-plated-heard.md` §9).
 *
 * A plate hides the thumbnail YouTube marks the playing row on, and a held
 * row is not drawn at all, so on a Mix the owner could no longer see which
 * row is playing, nor where autoplay will stop instead of going on. This
 * module reads that off what Core has already decided: each row's view,
 * the mode's autoplay rule from a whole video and the owner's autoplay
 * choice. It decides nothing new. Pure: a function of its input.
 *
 * The forecast follows the Sensor and Core as they act today:
 *
 *   - Autoplay goes to the next row when Core admits it from the row
 *     playing ({@link goesOn}): plated or whole, or only whole from a whole
 *     video when the mode keeps autoplay in the lane (#1966).
 *   - Otherwise, under Skip, to the first later row Core admits that is not
 *     the row's own video and has not played in this tab (`skipTo`); under
 *     Stop, nowhere. Where it goes nowhere in this list, the row is a stop.
 *   - After a stop the owner starts the next shown row by hand, and the
 *     forecast goes on from there, so every stop ahead is marked.
 *
 * Not foreseen: a row admitted by its card whose own page turns out held
 * (SK1), and the last row loaded, after which a Mix may load more.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import { admitted } from "@censor/lib/content/fsm"
import type { VideoId } from "@censor/types/ids"

/** Where a row stands against the row playing. */
type RowPlace =
  /** Before the row playing. */
  | "played"
  /** The page's own video. */
  | "now"
  /** Where autoplay goes from the row playing. */
  | "next"
  /** Autoplay, or the owner's start after a stop, reaches it later. */
  | "ahead"
  /** Shown, and autoplay goes past it (Skip). A click still plays it. */
  | "passed"

export type RowMark = {
  readonly place: RowPlace
  /** Autoplay goes on to no later row of this list from here. */
  readonly stop: boolean
}

export type CourseInput = {
  /** The playlist's rows, in page order. */
  readonly rows: ReadonlyArray<VideoId>
  /** The page's own video, or null when none plays on this page. */
  readonly own: VideoId | null
  /** The page's own video is whole in the lane (QD15). */
  readonly ownWhole: boolean
  /** Each row's view, or null when Core holds no card for it. */
  readonly view: (videoId: VideoId) => ViewState["kind"] | null
  /** From a whole video, autoplay goes to anything admitted, or to music. */
  readonly fromMusic: "admitted" | "music"
  readonly autoplay: "stop" | "skip"
  /** The videos this tab has played: Skip never goes back to one (R10). */
  readonly played: ReadonlyArray<VideoId>
}

/**
 * Whether autoplay goes on into a video whose view is `view`: admitted,
 * and whole when it goes from a whole video under a mode that keeps
 * autoplay in the lane (#1966). Core's `admits` asks this too.
 */
export function goesOn(lane: boolean, view: ViewState["kind"] | null): boolean {
  return lane ? view === "whole" : view !== null && admitted(view)
}

/**
 * One mark per row, in the rows' order: null for a row with no card or
 * one that is absent, which is not drawn, and every row's null when the
 * page's own video is not in the list. A Mix can repeat a video; the row
 * playing is its last, as Skip reads it.
 */
export function courseOf(input: CourseInput): ReadonlyArray<RowMark | null> {
  const { rows, view } = input
  const marks: Array<RowMark | null> = rows.map(() => null)
  const now = input.own === null ? -1 : rows.lastIndexOf(input.own)
  if (now === -1) return marks

  const shown = (i: number): boolean => {
    const id = rows[i]
    return id !== undefined && view(id) !== null && view(id) !== "absent"
  }
  const place = (i: number, p: RowPlace): void => {
    if (shown(i)) marks[i] = { place: p, stop: false }
  }
  for (let i = 0; i < now; i += 1) place(i, "played")
  marks[now] = { place: "now", stop: false }

  const seen = new Set<VideoId>(input.played)
  let at = now
  let whole = input.ownWhole
  let first = true
  for (;;) {
    const from = rows[at]
    if (from === undefined) break
    seen.add(from)
    const lane = input.fromMusic === "music" && whole
    const enters = (i: number): boolean => {
      const id = rows[i]
      return id !== undefined && goesOn(lane, view(id))
    }
    let to: number | null = null
    if (enters(at + 1)) {
      to = at + 1
    } else if (input.autoplay === "skip") {
      for (let i = at + 2; i < rows.length; i += 1) {
        const id = rows[i]
        if (id !== undefined && id !== from && !seen.has(id) && enters(i)) {
          to = i
          break
        }
      }
    }
    let byHand = false
    if (to === null) {
      if (at + 1 >= rows.length) break
      const mark = marks[at]
      if (mark !== null && mark !== undefined) {
        marks[at] = { ...mark, stop: true }
      }
      let resume = at + 1
      while (resume < rows.length && !shown(resume)) resume += 1
      if (resume >= rows.length) break
      to = resume
      byHand = true
    } else {
      for (let i = at + 1; i < to; i += 1) place(i, "passed")
    }
    place(to, first && !byHand ? "next" : "ahead")
    first = false
    const id = rows[to]
    whole = id !== undefined && view(id) === "whole"
    at = to
  }
  return marks
}
