/**
 * What Rust Rounds keeps on this phone that goes home to be kept there for
 * good (RR14, paulgsc/some-ui#2689; paulgsc/server#763), each item with
 * where it goes and the body it goes as. Pure over what is kept; apps/www's
 * Rust Rounds lane (`lib/home-link/rust-kept.ts`) sends them, and the phone
 * lets go of none of them.
 *
 * - **The latest send of each week** (`lib/week-play/store`'s
 *   `weeksSent`), as it is kept, to `PUT /rust-weeks/:id/sent`, known by
 *   its `at` (`weekSendKey`). A week is open until its deadline and can be
 *   sent again (RR22, #2832): home keeps the latest in place of the one
 *   before, and what it holds at the deadline counts, for good (the
 *   owner's call, C56). Earlier sends stay on this phone and go nowhere.
 *   Nothing goes once the week's deadline has passed on this phone's clock,
 *   since home refuses it then; the week's screen says it didn't count.
 *   Home records a week that closed unsent itself: nothing goes for
 *   silence. A take said but not sent by the deadline stays in the week's
 *   draft.
 * - **Each error pasted and kept** (`pasteStores`), to
 *   `PUT /rust-weeks/:id/pastes/:at`.
 * - **Each sitting of the card-era log** (`some-ui.rust-round-log/1`), to
 *   `PUT /rust-round-log/sessions/:id`, again whenever the cards add to it.
 */
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { keptLog } from "@rust-rounds/lib/play/store"
import {
  isClosed,
  latestSend,
  weekSendKey,
} from "@rust-rounds/lib/week-play/spec"
import { pasteStores, weeksSent } from "@rust-rounds/lib/week-play/store"
import { heldWeek, keptWeeks } from "@rust-rounds/lib/weeks"
import type { KeyedStorage } from "@some-ui/core-utils"

/** One thing that goes home, by kind. */
export type KeptItem = {
  readonly kind: "rustWeeks" | "rustPastes" | "roundLog"
  /**
   * Its id among its kind: the week and when it was sent
   * (`weekSendKey`), when the paste was begun, the sitting.
   */
  readonly id: string
  readonly path: string
  readonly wire: unknown
}

const week = (id: string): string => `/rust-weeks/${encodeURIComponent(id)}`

/**
 * Everything Rust Rounds keeps that goes home at `at` (milliseconds since
 * the epoch), in the order it goes.
 */
export function keptGoing(
  storage: KeyedStorage | null,
  at: number
): Array<KeptItem> {
  const sends = weeksSent(storage).list() ?? []
  const held = keptWeeks(storage).held()
  const now = new Date(at).toISOString()
  const weeks = [...new Set(sends.map(({ week: id }) => id))]
    .flatMap((id) => {
      const sent = latestSend(sends.filter(({ week: of }) => of === id))
      return sent === null ? [] : [sent]
    })
    .filter((sent) => {
      const of = heldWeek(held, sent.week)
      return of === null || !isClosed(of.week, now)
    })
    .map(
      (sent): KeptItem => ({
        kind: "rustWeeks",
        id: weekSendKey(sent),
        path: `${week(sent.week)}/sent`,
        wire: sent,
      })
    )
  const pastes = pasteStores(storage)
    .pastes.list()
    .map(
      ({ week: of, at, text, note }): KeptItem => ({
        kind: "rustPastes",
        id: at,
        path: `${week(of)}/pastes/${encodeURIComponent(at)}`,
        wire: { at, text, note },
      })
    )
  const sittings = keptLog(storage).sessions.map(
    (session): KeptItem => ({
      kind: "roundLog",
      id: session.id,
      path: `/rust-round-log/sessions/${encodeURIComponent(session.id)}`,
      wire: { schema: LOG_SCHEMA, ...session },
    })
  )
  return [...weeks, ...pastes, ...sittings]
}
