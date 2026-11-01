import type { JSX } from "react"
import type { SessionFileStore, SpokenTakes } from "@some-ui/leetype"
import { microphoneOwner, takePattern } from "@some-ui/voice-capture"
import {
  memoryTakes,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"

import { PANELS } from "@/lib/playable"

import { STRESS_SESSION } from "./incident-session"

const Leetype = PANELS.leetype.Component

const NAME = "t1-99-fit-stress"

const files: SessionFileStore = {
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

const ROOM = { takes: [], full: false, notesFull: false }

/**
 * A microphone that is there and idle, so the record screen shows its
 * button: the take pattern over the simulated microphone, nothing kept.
 */
const store = memoryTakes({ now: Date.now })
const takes: SpokenTakes = {
  pattern: takePattern(
    {
      startRecording: simulatedMicrophone({ now: Date.now }).startRecording,
      now: Date.now,
      owner: microphoneOwner(),
      player: simulatedPlayer(),
      ...store.ports,
    },
    {
      takes: { per: "one" },
      limits: { minMs: 1_000, maxMs: 60_000 },
      redo: "supersede",
      letGo: "set-aside",
      play: "each",
    }
  ),
  getSnapshot: () => ROOM,
  subscribe: () => (): void => undefined,
  note: (): boolean => true,
}

/**
 * LeetType on the phone holding one session file, through the card and its
 * Play button; `../incident-fit.spec.ts` plays it. `surface` is forced so the
 * card shows at every size the sweep takes: on the phone held sideways (780
 * wide, past the 768 breakpoint) a real phone opens the typing surface
 * instead. The session screens are true to it, since LeetType keeps a session
 * open through the turn.
 */
export const IncidentFixture = (): JSX.Element => (
  <Leetype surface="rounds" sessionFiles={{ store: files }} takes={takes} />
)
