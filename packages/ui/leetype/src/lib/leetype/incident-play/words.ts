import type {
  SessionLedger,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import { ledgerOf } from "@leetype/lib/leetype/session-log/model"
import type { SessionFile } from "@leetype/types/session-file"
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
    : `${id}, in ${file}`
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

export type ReadyReturn = {
  readonly round: string
  readonly reading: string
  readonly name: string
}

/**
 * The file's parked rounds whose reading has been read since it was placed,
 * and whose return the file authors: the returns the shell offers unasked.
 */
export function returnsReady(
  log: SessionLog,
  here: Here
): ReadonlyArray<ReadyReturn> {
  const session = lastSession(log)
  if (session === null) return []
  return ledgerOf(log, session).parked.flatMap(({ file, screen, reading }) => {
    if (file !== here.fileName || reading === null) return []
    let placedAt = -Infinity
    let readAt = -Infinity
    for (const event of log) {
      if (event.file !== file) continue
      const at = Date.parse(event.at)
      if (event.type === "placed" && event.screen === screen) {
        placedAt = Math.max(placedAt, at)
      } else if (
        event.type === "reading" &&
        event.reading === reading &&
        event.action === "read"
      ) {
        readAt = Math.max(readAt, at)
      }
    }
    if (readAt < placedAt) return []
    const target = returnScreenOf(here.file, screen, reading)
    return target === null
      ? []
      : [{ round: screen, reading, name: screenName(here.file, screen) }]
  })
}
