/**
 * Adding to the log (`some-ui.rust-round-log/1`). Only ever adds: a session
 * is opened by its first addition, a card event is appended to it, and
 * nothing already logged is rewritten or dropped (CLAUDE.md, "Never lose the
 * record"). A session has a start and no end: leaving is not finishing.
 */
import type { CardEvent, CardRef, RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"

export const EMPTY_LOG: RoundLog = { schema: LOG_SCHEMA, sessions: [] }

/** One opening of Rust Rounds, as the log names it. */
export type SessionHead = { readonly id: string; readonly startedAt: string }

/** What one addition to the log carries. */
export type LogAdd =
  | {
      readonly kind: "card"
      readonly event: CardEvent
      /** The tutor's `expect` differs from rustc's recorded run. */
      readonly guessedWrong: boolean
    }
  | { readonly kind: "pin"; readonly ref: CardRef }

const sameRef = (a: CardRef, b: CardRef): boolean =>
  a.round === b.round && a.card === b.card

/** `log` with `add` appended to the session `head` names, opened if new. */
export function appendToLog(
  log: RoundLog,
  head: SessionHead,
  add: LogAdd
): RoundLog {
  const found = log.sessions.find((session) => session.id === head.id)
  const session = found ?? {
    id: head.id,
    startedAt: head.startedAt,
    cards: [],
    pinned: [],
    fromMyDesk: [],
    tutorGuessedWrong: [],
  }
  const withRef = (
    refs: ReadonlyArray<CardRef>,
    ref: CardRef
  ): Array<CardRef> =>
    refs.some((each) => sameRef(each, ref)) ? [...refs] : [...refs, ref]
  const next =
    add.kind === "pin"
      ? { ...session, pinned: withRef(session.pinned, add.ref) }
      : {
          ...session,
          cards: [...session.cards, add.event],
          tutorGuessedWrong: add.guessedWrong
            ? withRef(session.tutorGuessedWrong, {
                round: add.event.round,
                card: add.event.card,
              })
            : session.tutorGuessedWrong,
        }
  return {
    ...log,
    sessions:
      found === undefined
        ? [...log.sessions, next]
        : log.sessions.map((each) => (each === found ? next : each)),
  }
}
