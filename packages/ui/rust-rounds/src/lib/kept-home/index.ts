/**
 * What Rust Rounds keeps on this phone that goes home to be kept there for
 * good (RR14, paulgsc/some-ui#2689; paulgsc/server#763), each item with
 * where it goes and the body it goes as. Pure over what is kept; apps/www's
 * Rust Rounds lane (`lib/home-link/rust-kept.ts`) sends them, and the phone
 * lets go of none of them.
 *
 * - **Each week sent** (`lib/week-play/store`'s `weeksSent`), as it is kept,
 *   to `PUT /rust-weeks/:id/sent`. Home makes the week's record from it and
 *   records a week that closed unsent itself: nothing goes for silence. A
 *   take said but not sent by the deadline stays in the week's draft.
 * - **Each error pasted and kept** (`pasteStores`), to
 *   `PUT /rust-weeks/:id/pastes/:at`.
 * - **Each sitting of the card-era log** (`some-ui.rust-round-log/1`), to
 *   `PUT /rust-round-log/sessions/:id`, again whenever the cards add to it.
 */
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { keptLog } from "@rust-rounds/lib/play/store"
import { pasteStores, weeksSent } from "@rust-rounds/lib/week-play/store"
import type { KeyedStorage } from "@some-ui/core-utils"

/** One thing that goes home, by kind. */
export type KeptItem = {
  readonly kind: "rustWeeks" | "rustPastes" | "roundLog"
  /** Its id among its kind: the week, when the paste was begun, the sitting. */
  readonly id: string
  readonly path: string
  readonly wire: unknown
}

const week = (id: string): string => `/rust-weeks/${encodeURIComponent(id)}`

/** Everything Rust Rounds keeps that goes home, in the order it goes. */
export function keptGoing(storage: KeyedStorage | null): Array<KeptItem> {
  const weeks = (weeksSent(storage).list() ?? []).map(
    (sent): KeptItem => ({
      kind: "rustWeeks",
      id: sent.week,
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
