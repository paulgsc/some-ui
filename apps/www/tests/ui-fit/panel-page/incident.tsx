import type { JSX } from "react"
import type {
  HomeSessionFiles,
  SessionFileStore,
  SpokenTakes,
} from "@some-ui/leetype"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import { PANELS } from "@/lib/playable"

import { STRESS_SESSION } from "./incident-session"

const Leetype = PANELS.leetype.Component

const NAME = "t1-99-fit-stress"

/** The phone's session files: the stress session alone, already held. */
export const STRESS_FILES: SessionFileStore = {
  list: () =>
    Promise.resolve([
      {
        name: NAME,
        title: STRESS_SESSION.title,
        oneLine: STRESS_SESSION.oneLine,
        pickedAt: "2026-10-19T00:00:00.000Z",
      },
    ]),
  keep: () => Promise.resolve("already-held"),
  read: () => Promise.resolve(JSON.stringify(STRESS_SESSION)),
}

/**
 * What a paired home holds, as full as the list gets: the thread the phone
 * is on with one file still to keep, an older thread, and a file whose name
 * names no thread, each with a long title. A keep answers the stress
 * session, which the store says it already holds.
 */
const HOME: HomeSessionFiles = {
  key: "fit-pairing",
  list: () =>
    Promise.resolve({
      files: {
        files: [
          {
            name: `${NAME}.json`,
            title: STRESS_SESSION.title,
            oneLine: STRESS_SESSION.oneLine,
          },
          {
            name: "t1-100-a-partition-heals-while-the-old-leader-still-believes-it-leads.json",
            title:
              "A partition heals while the old leader still believes it leads the cluster",
            oneLine: "Two leaders, one term apart.",
          },
          {
            name: "t0-01-what-a-majority-buys-you.json",
            title: "What a majority buys you, and what it costs on every write",
            oneLine: "Quorums, from the start.",
          },
          {
            name: "loose-notes-on-clocks.json",
            title:
              "Loose notes on clocks, ordering and the happened-before relation",
            oneLine: "No thread.",
          },
        ],
      },
      ended: null,
    }),
  fetch: () =>
    Promise.resolve({ kind: "file", body: JSON.stringify(STRESS_SESSION) }),
}

const ROOM = { takes: [], full: false, notesFull: false }

/**
 * A microphone that is there and idle, so the record screen shows its
 * button: the take pattern over the simulated microphone, nothing kept.
 */
const takes: SpokenTakes = {
  pattern: simulatedPattern().pattern,
  getSnapshot: () => ROOM,
  subscribe: () => (): void => undefined,
  note: (): boolean => true,
}

/**
 * LeetType on the phone holding one session file, with what a paired home
 * holds listed under it (#1916), through the card and its Play button; `../incident-fit.spec.ts` plays it. `surface` is forced so the
 * card shows at every size the sweep takes: on the phone held sideways (780
 * wide, past the 768 breakpoint) a real phone opens the typing surface
 * instead. The session screens are true to it, since LeetType keeps a session
 * open through the turn.
 */
export const IncidentFixture = (): JSX.Element => (
  <Leetype
    surface="rounds"
    sessionFiles={{ store: STRESS_FILES, home: HOME }}
    takes={takes}
  />
)
