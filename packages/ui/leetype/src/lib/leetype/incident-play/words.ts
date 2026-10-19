import type {
  SessionLedger,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import { ledgerOf } from "@leetype/lib/leetype/session-log/model"
import type {
  ChoiceScreen,
  SessionFile,
  SessionScreen,
} from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"

import { returnScreenOf } from "./model"

/**
 * What the session shell says, in words and never counts, each line
 * computed from the session log (canon v1.2, Prop. 9.6, Prop. 10.2): where
 * the learner is in a file before it starts, which parked rounds can come
 * back, and the end screen's ledger.
 */

/** The file in view; entries from another file are named by that file. */
type Here = { readonly fileName: string; readonly file: SessionFile }

function screenName(file: SessionFile, id: string): string {
  const screen = file.screens[id]
  if (!screen) return id
  switch (screen.type) {
    case "reading": {
      return screen.title ?? screen.source.title
    }
    case "record": {
      return screen.title ?? screen.prompt
    }
    case "choice":
    case "info":
    case "end": {
      return screen.title ?? screen.pinned ?? id
    }
    default: {
      return assertNever(screen)
    }
  }
}

function nameIn(here: Here, file: string, id: string): string {
  return file === here.fileName
    ? screenName(here.file, id)
    : `a screen of the session ${file}`
}

type Line = { readonly key: string; readonly text: string }

export type EndLines = {
  readonly walked: ReadonlyArray<Line>
  readonly parked: ReadonlyArray<Line>
  readonly saved: ReadonlyArray<Line>
  readonly spoken: ReadonlyArray<Line>
}

const line = (file: string, id: string, text: string): Line => ({
  key: JSON.stringify([file, id]),
  text,
})

/** The end screen: one line per ledger entry, nothing else. */
export function endLines(ledger: SessionLedger, here: Here): EndLines {
  return {
    walked: ledger.walked.map(({ file, screen }) =>
      line(file, screen, nameIn(here, file, screen))
    ),
    parked: ledger.parked.map(({ file, screen, reading }) =>
      line(
        file,
        screen,
        reading === null
          ? `${nameIn(here, file, screen)} waits, with no reading placed.`
          : `${nameIn(here, file, screen)} waits on ${nameIn(here, file, reading)}.`
      )
    ),
    saved: ledger.saved.map(({ file, reading }) =>
      line(file, reading, nameIn(here, file, reading))
    ),
    spoken: ledger.spoken.map(({ file, screen, as }) => {
      const prompt = nameIn(here, file, screen)
      const said =
        as === "recorded"
          ? `You answered aloud: ${prompt}`
          : as === "typed"
            ? `You typed an answer: ${prompt}`
            : `You passed: ${prompt}`
      return line(file, screen, said)
    }),
  }
}

function lastSession(log: SessionLog, fileName?: string): string | null {
  let found: string | null = null
  for (const event of log) {
    if (
      event.type === "started" &&
      (fileName === undefined || event.file === fileName)
    ) {
      found = event.session
    }
  }
  return found
}

/** Where the learner is in the file, said before it starts. */
export function placeOf(log: SessionLog, here: Here): string {
  const session = lastSession(log, here.fileName)
  if (session === null) return "You haven't played this session yet."
  const events = log.filter((event) => event.session === session)
  const ended = events.find((event) => event.type === "ended")
  if (ended?.type === "ended") {
    return ended.how === "declared"
      ? "Last time you played it to the end."
      : `Last time you ended at ${nameIn(here, ended.file, ended.screen)}.`
  }
  const last = [...events].reverse().find((event) => "screen" in event)
  return last !== undefined && "screen" in last
    ? `Last time it stopped at ${nameIn(here, last.file, last.screen)}.`
    : "Last time it stopped before the first round."
}

/** A round or a take of this file parked and not since solved, and what it waits on. */
export type ParkedRound = {
  readonly round: string
  readonly screen: ChoiceScreen | Extract<SessionScreen, { type: "record" }>
  readonly name: string
  readonly reading: string | null
  /** Its reading was read since it was last placed, returned or said. */
  readonly read: boolean
  /** The return the file authors for it (`returnScreenOf`), if any. */
  readonly returnScreen: string | null
}

/**
 * The file's rounds and takes still parked, across every session
 * (`ledgerOf`), each reachable from the first screen and at every round
 * boundary (Prop. 9.4 (d)).
 */
export function parkedRounds(
  log: SessionLog,
  here: Here
): ReadonlyArray<ParkedRound> {
  const session = lastSession(log)
  if (session === null) return []
  // The store lays the log out session by session: time orders sessions,
  // and a stable sort keeps a session's own order where times tie.
  const byTime = [...log].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return ledgerOf(log, session).parked.flatMap(({ file, screen, reading }) => {
    const round = here.file.screens[screen]
    if (file !== here.fileName) return []
    if (round?.type !== "choice" && round?.type !== "record") return []
    // Read after it was last placed, returned or said: an answer given
    // since waits on its reading again.
    let since = -1
    let readAt = -1
    for (const [index, event] of byTime.entries()) {
      if (event.file !== file) continue
      if (
        // A pointer after a correct replay is no new placement.
        ((event.type === "placed" && event.as === "placement") ||
          event.type === "returned" ||
          event.type === "spoken") &&
        event.screen === screen
      ) {
        since = index
      } else if (
        event.type === "reading" &&
        event.reading === reading &&
        event.action === "read"
      ) {
        readAt = index
      }
    }
    return [
      {
        round: screen,
        screen: round,
        name: screenName(here.file, screen),
        reading,
        read: reading !== null && readAt > since,
        returnScreen:
          reading === null ? null : returnScreenOf(here.file, screen, reading),
      },
    ]
  })
}
