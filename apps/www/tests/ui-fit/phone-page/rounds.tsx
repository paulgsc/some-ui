/**
 * The rounds wing's phone screens, for `../stays-put-rounds.spec.ts`:
 * LeetType's incident session played from a session file, Rust Rounds, and
 * Game Week, each on fakes the spec moves through `window.__rounds` (a
 * microphone's script, a take kept or not, the phone filling up, the
 * clipboard refusing). What a screen keeps goes to this page's
 * `localStorage`, so the spec refuses a write the way a full phone does, by
 * making `Storage.prototype.setItem` throw.
 */
import type { JSX } from "react"
import { useState } from "react"
import type { GameWeekPorts, OutboxPort } from "@some-ui/game-week"
import { fixtureFeed, GameWeek, storedPrefs } from "@some-ui/game-week"
import type {
  SessionFileStore,
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@some-ui/leetype"
import type { RefineCard, RustRoundsPorts } from "@some-ui/rust-rounds"
import { INDEXING_01, keptRounds, RustRounds } from "@some-ui/rust-rounds"
import type { KeepResult } from "@some-ui/voice-capture"
import { microphoneOwner } from "@some-ui/voice-capture"
import type { MicScript } from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  simulatedPattern,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { STRESS_SESSION } from "@tests/ui-fit/panel-page/incident-session"

import { PANELS } from "@/lib/playable"

/** What the spec moves from outside, once a fixture has mounted. */
export type RoundsLevers = {
  /** The next openings of the microphone answer as these say. */
  readonly script: (...scripts: ReadonlyArray<MicScript>) => void
  /** How the next take is kept (Rust Rounds' notes). */
  readonly keeping: (how: KeepResult["outcome"]) => void
  /** The phone has no room for another take (LeetType's answers). */
  readonly fill: () => void
  /** The clipboard refuses from here on (Rust Rounds' tutor page). */
  readonly refuseCopy: () => void
  /** The bite store refuses an Undo from here on (Game Week). */
  readonly refuseUndo: () => void
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    /** Set once a rounds fixture mounts, for the spec to move. */
    __rounds?: RoundsLevers
  }
}

/** Sets the levers this fixture answers; the rest do nothing. */
function levers(these: Partial<RoundsLevers>): void {
  const none = (): void => undefined
  const all: RoundsLevers = {
    script: none,
    keeping: none,
    fill: none,
    refuseCopy: none,
    refuseUndo: none,
    ...these,
  }
  window.__rounds = all
}

const LEETYPE = PANELS.leetype.Component

const FILE = "t1-99-fit-stress"

const files: SessionFileStore = {
  list: () =>
    Promise.resolve([
      {
        name: FILE,
        title: STRESS_SESSION.title,
        oneLine: STRESS_SESSION.oneLine,
        pickedAt: "2026-10-19T00:00:00.000Z",
      },
    ]),
  keep: () => Promise.resolve("already-held"),
  read: () => Promise.resolve(JSON.stringify(STRESS_SESSION)),
}

/**
 * The record screen's microphone, idle, over a store whose room the spec
 * fills (`fill`), as a take that found the phone full leaves it.
 */
function answerTakes(): SpokenTakes {
  const { pattern } = simulatedPattern()
  let room: SpokenTakeSnapshot = { takes: [], full: false, notesFull: false }
  const listeners = new Set<() => void>()
  levers({
    fill: () => {
      room = { ...room, full: true }
      for (const listener of listeners) listener()
    },
  })
  return {
    pattern,
    getSnapshot: () => room,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => void listeners.delete(listener)
    },
    note: () => true,
  }
}

/** LeetType on the phone holding one session file, its log on this page. */
const Incident = (): JSX.Element => {
  const [takes] = useState(answerTakes)
  return (
    <LEETYPE surface="rounds" sessionFiles={{ store: files }} takes={takes} />
  )
}

/** A refine card on an earlier note neither this phone nor home has. */
const REFINE: RefineCard = {
  kind: "refine",
  id: "say-again",
  note: "earlier-1",
  nudge: "rustc names a trait here, and the note did not.",
  aim: "understand",
  say: "Say which trait is missing, and why rustc asks for it.",
}

/**
 * Rust Rounds on this page's `localStorage`, so a reload is the app opened
 * again; the microphone is the simulated one, its keeping and script moved
 * by the spec, and the clipboard takes the copy until `refuseCopy`.
 */
function rustPorts(refine: boolean): RustRoundsPorts {
  const store = keptRounds(localStorage)
  if (refine) {
    store.hold({
      rounds: [
        {
          ...INDEXING_01,
          id: "borrowing-01",
          concept: "borrowing",
          cards: [REFINE],
        },
      ],
      runs: {},
      notes: [],
      notesMissing: false,
      home: { sent: [], fetched: [], refused: [], unread: [], ended: [] },
    })
  }
  const { pattern, store: takes, mic, keeping } = simulatedPattern()
  let copies = true
  levers({
    script: mic.script,
    keeping,
    refuseCopy: () => {
      copies = false
    },
  })
  return {
    store,
    notes: {
      pattern,
      takes: { getSnapshot: takes.getSnapshot, subscribe: takes.subscribe },
      keptOn: () => null,
    },
    copy: () =>
      copies ? Promise.resolve() : Promise.reject(new Error("refused")),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: () => () => undefined,
    home: true,
  }
}

/** Rust Rounds over its ports, made once for the page's life. */
const RustFixture = ({ refine }: { refine: boolean }): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as the app's is
  const [ports] = useState(() => rustPorts(refine))
  return <RustRounds ports={ports} />
}

const WAITING = {
  notKept: 0,
  waiting: 2,
  refused: 0,
  sending: true,
  onHome: null,
}

const OUTBOX: OutboxPort = {
  getSnapshot: () => WAITING,
  subscribe: () => () => undefined,
}

/** Game Week over the fixture feed, a store that keeps, and the simulated microphone. */
function gameWeekPorts(): GameWeekPorts {
  const now = (): number => Date.UTC(2026, 10, 1, 21)
  const mic = simulatedMicrophone({
    now: Date.now,
    fallback: { ...SPEAKING, level: 0.4, durationMs: 3_000 },
  })
  let undoes = true
  levers({
    script: mic.script,
    refuseUndo: () => {
      undoes = false
    },
  })
  return {
    startRecording: mic.startRecording,
    owner: microphoneOwner(),
    player: simulatedPlayer(),
    store: {
      audio: () => Promise.resolve(new Blob(["said"])),
      keep: () => Promise.resolve(),
      amend: () => Promise.resolve("noted"),
      release: () => Promise.resolve(),
      undo: () =>
        undoes ? Promise.resolve() : Promise.reject(new Error("on its way")),
      isKept: () => true,
      homeSince: () => null,
      subscribe: () => () => undefined,
    },
    feed: fixtureFeed(now),
    prefs: storedPrefs(null),
    now,
    newId: () => crypto.randomUUID(),
    onVisibility: () => () => undefined,
  }
}

const Game = (): JSX.Element => {
  const [ports] = useState(gameWeekPorts)
  return <GameWeek ports={ports} outbox={OUTBOX} />
}

export const ROUNDS_FIXTURES = {
  "rounds-incident": Incident,
  "rounds-rust": (): JSX.Element => <RustFixture refine={false} />,
  "rounds-rust-refine": (): JSX.Element => <RustFixture refine />,
  "rounds-game-week": Game,
} satisfies Record<string, () => JSX.Element>
