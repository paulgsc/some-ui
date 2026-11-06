/**
 * The rounds wing's phone screens, for `../stays-put-rounds.spec.ts`:
 * LeetType's incident session played from a session file, Rust Rounds, and
 * Game Week, each on fakes the spec moves through `./fit-actions.ts` (a
 * microphone's script, a take kept or not, the phone filling up, the
 * clipboard refusing). What a screen keeps goes to this page's
 * `localStorage`, so the spec refuses a write the way a full phone does, by
 * making `Storage.prototype.setItem` throw.
 */
import type { JSX } from "react"
import { useState } from "react"
import type { GameWeekPorts, OutboxPort } from "@some-ui/game-week"
import { fixtureFeed, GameWeek, storedPrefs } from "@some-ui/game-week"
import type { SpokenTakes, SpokenTakeSnapshot } from "@some-ui/leetype"
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
import { STRESS_FILES } from "@tests/ui-fit/panel-page/incident"

import { PANELS } from "@/lib/playable"

import type { FitActions } from "./fit-actions"
import { useFitActions } from "./fit-actions"

const LEETYPE = PANELS.leetype.Component

/**
 * The record screen's microphone, idle, over a store whose room the spec
 * fills (`fill`), as a take that found the phone full leaves it.
 */
function answerTakes(): { takes: SpokenTakes; actions: FitActions } {
  const { pattern } = simulatedPattern()
  let room: SpokenTakeSnapshot = { takes: [], full: false, notesFull: false }
  const listeners = new Set<() => void>()
  return {
    takes: {
      pattern,
      getSnapshot: () => room,
      subscribe: (listener) => {
        listeners.add(listener)
        return (): void => void listeners.delete(listener)
      },
      note: () => true,
    },
    actions: {
      fill: (): void => {
        room = { ...room, full: true }
        for (const listener of listeners) listener()
      },
    },
  }
}

/** LeetType on the phone holding one session file, its log on this page. */
const Incident = (): JSX.Element => {
  const [{ takes, actions }] = useState(answerTakes)
  useFitActions(actions)
  return (
    <LEETYPE
      surface="rounds"
      sessionFiles={{ store: STRESS_FILES }}
      takes={takes}
    />
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
function rustPorts(refine: boolean): {
  ports: RustRoundsPorts
  actions: FitActions
} {
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
  const ports: RustRoundsPorts = {
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
  return {
    ports,
    actions: {
      script: (script: MicScript): void => mic.script(script),
      keeping: (how: KeepResult["outcome"]): void => keeping(how),
      refuseCopy: (): void => {
        copies = false
      },
    },
  }
}

/** Rust Rounds over its ports, made once for the page's life. */
const RustFixture = ({ refine }: { refine: boolean }): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as the app's is
  const [{ ports, actions }] = useState(() => rustPorts(refine))
  useFitActions(actions)
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
function gameWeekPorts(): { ports: GameWeekPorts; actions: FitActions } {
  const now = (): number => Date.UTC(2026, 10, 1, 21)
  const mic = simulatedMicrophone({
    now: Date.now,
    fallback: { ...SPEAKING, level: 0.4, durationMs: 3_000 },
  })
  let undoes = true
  const ports: GameWeekPorts = {
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
  return {
    ports,
    actions: {
      script: (script: MicScript): void => mic.script(script),
      refuseUndo: (): void => {
        undoes = false
      },
    },
  }
}

const Game = (): JSX.Element => {
  const [{ ports, actions }] = useState(gameWeekPorts)
  useFitActions(actions)
  return <GameWeek ports={ports} outbox={OUTBOX} />
}

export const ROUNDS_FIXTURES = {
  "rounds-incident": Incident,
  "rounds-rust": (): JSX.Element => <RustFixture refine={false} />,
  "rounds-rust-refine": (): JSX.Element => <RustFixture refine />,
  "rounds-game-week": Game,
} satisfies Record<string, () => JSX.Element>
