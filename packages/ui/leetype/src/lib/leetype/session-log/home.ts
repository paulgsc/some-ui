/**
 * The session log as it goes home (paulgsc/server `leetype_log_repo`,
 * docs/identity.md invariant 18): which sessions are ready to go, and each
 * event in its home form. Pure.
 */
import { assertNever } from "@some-ui/core-utils"

import type { SessionEvent, SessionLog } from "./model"

type Spoken = Extract<SessionEvent, { type: "spoken" }>
type HomeAnswer =
  | { readonly as: "passed" }
  | {
      readonly as: "recorded"
      readonly seconds: number
      readonly strong: boolean
    }
  | { readonly as: "typed"; readonly strong: boolean }

/** An event as home keeps it: a spoken answer comes without its `ticks`. */
export type HomeEvent =
  | Exclude<SessionEvent, Spoken>
  | (Omit<Spoken, "answer"> & { readonly answer: HomeAnswer })

/**
 * `event` in its home form. The ticks are what the learner marked their
 * answer against the rubric with, part of the soundbite, which never goes
 * home: they stay in this log, and reach the owner's Drive in the take note.
 */
export function homeFormOf(event: SessionEvent): HomeEvent {
  if (event.type !== "spoken") return event
  const { answer } = event
  switch (answer.as) {
    case "passed": {
      return event
    }
    case "recorded": {
      const { seconds, strong } = answer
      return { ...event, answer: { as: "recorded", seconds, strong } }
    }
    case "typed": {
      return { ...event, answer: { as: "typed", strong: answer.strong } }
    }
    default: {
      return assertNever(answer)
    }
  }
}

/** One session's events, in the order they happened. */
export type LoggedSession = {
  readonly session: string
  readonly events: SessionLog
}

/**
 * The sessions in `log` that are done with, in the order they started: one
 * that ended, or one another session started after its last event. The
 * session still being played, or one the app closed mid-round with nothing
 * started since, is left out until either happens.
 */
export function finishedSessions(log: SessionLog): Array<LoggedSession> {
  // By time, not position: the store lays the log out session by session.
  const ordered = [...log].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const sessions = new Map<string, Array<SessionEvent>>()
  for (const event of ordered) {
    const events = sessions.get(event.session)
    if (events === undefined) sessions.set(event.session, [event])
    else events.push(event)
  }
  const starts = ordered.filter((event) => event.type === "started")
  return [...sessions]
    .filter(([session, events]) => {
      if (events.some((event) => event.type === "ended")) return true
      const last = Date.parse(events[events.length - 1]?.at ?? "")
      return starts.some(
        (start) => start.session !== session && Date.parse(start.at) > last
      )
    })
    .map(([session, events]) => ({ session, events }))
}
