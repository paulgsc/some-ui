/**
 * Runs the read-aloud set machine in the browser (adaptive-learning canon
 * Def. 4.8, Cor. 4.6, Rem. 4.10).
 *
 * The machine is pure; this is what carries out its effects. A `wait`
 * becomes one timer, replacing any other; a `speak` goes to the speech
 * adapter, and the time from the audio starting to its end is reported back
 * as what the learner heard, which sets the echo. Counts and pace go to the
 * host's callbacks, dated by the learner's local day, and a hidden page
 * pauses the rep so it starts over when the page is shown (Prop. 6.4 (i)).
 *
 * Nothing starts until `begin`: a phone plays no audio before the learner's
 * first tap, and a drill that talks before being asked is its own way to lose
 * a learner. Where nothing here can speak the exercise is not offered
 * at all (Cor. 4.6), which is the host's to render from `audio`.
 */

import type { RefObject } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Speaker } from "@some-ui/speech"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
} from "@topik/lib/topik/read-aloud/content"
import type { PaceBook, PaceEntry } from "@topik/lib/topik/read-aloud/records"
import { dayKey } from "@topik/lib/topik/read-aloud/records"
import { buildSet } from "@topik/lib/topik/read-aloud/set-builder"
import type {
  QueueEntry,
  SetEffect,
  SetEvent,
  SetMachineState,
  SetProgress,
} from "@topik/lib/topik/read-aloud/set-machine"
import {
  createSetMachine,
  currentEntry,
  freshSet,
  progressOf,
  setMachineReducer,
} from "@topik/lib/topik/read-aloud/set-machine"
import { assertNever } from "some-ui-utils"

export type ReadAloudRecordEvent =
  | { type: "rep"; creditMs: number }
  | { type: "set" }

export type UseReadAloudOptions = {
  deck: ReadAloudDeck
  level: ReadAloudLevel
  speech: Speaker | null
  /** The stored pace book; the drill keeps its own copy once it starts. */
  paces?: PaceBook
  /** A set left unfinished in an earlier sitting, resumed at its next rep. */
  resume?: SetProgress | null
  /** A counted rep or a finished set, and the local day it belongs to. */
  onRecord?: (event: ReadAloudRecordEvent, day: string) => void
  onPace?: (wordId: string, pace: PaceEntry) => void
  /** What is left of the set after every change, for resuming it later. */
  onProgress?: (progress: SetProgress | null) => void
  /** Test seams: the clock, and the key each new set is drawn with. */
  now?: () => number
  seedKey?: () => string
}

/** The running wait: how long the current step lasts. */
type ReadAloudStep = { seq: number; ms: number } | null

export type ReadAloudVM = {
  state: SetMachineState
  /** False until `begin`; the host shows its start screen until then. */
  started: boolean
  /** Whether speech is supported here; without it the drill is not offered. */
  audio: boolean
  entry: QueueEntry | undefined
  step: ReadAloudStep
  /**
   * The step whose audio is audible now: set when playback starts, which a
   * server voice may reach well after the step does, so the glyphs can
   * follow the sound rather than the request for it.
   */
  playing: number | null
  /** No set can be drawn: the deck has nothing at or below this level. */
  empty: boolean
  begin: () => void
  stuck: () => void
  skip: () => void
  pause: () => void
  resume: () => void
  nextSet: () => void
  startSitting: () => void
}

type Snapshot = {
  state: SetMachineState
  step: ReadAloudStep
  playing: number | null
  empty: boolean
}

type Runner = {
  dispatch: (event: SetEvent) => void
  begin: () => void
  /** The page was hidden: the rep pauses, and starts over when shown. */
  hide: () => void
  show: () => void
  /** Unmounting: pause the rep, then stop every timer and utterance. */
  dispose: () => void
  now: () => number
}

function createRunner(
  options: () => UseReadAloudOptions,
  render: (snapshot: Snapshot) => void
): Runner {
  let state = createSetMachine(options().level)
  let step: ReadAloudStep = null
  /** When the current step's first wait runs out; a renewal never passes it. */
  let deadline: { seq: number; at: number } | null = null
  let playing: number | null = null
  let empty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let utterance: AbortController | null = null
  const queue: Array<SetEvent> = []
  let dispatching = false

  const now = (): number => options().now?.() ?? Date.now()

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const stopSpeech = (): void => {
    utterance?.abort()
    utterance = null
    options().speech?.stop()
  }

  const drawSet = (): void => {
    const { deck, level, seedKey } = options()
    const items = buildSet(deck, {
      level,
      seedKey: seedKey?.() ?? `${now()}`,
    })
    if (items.length === 0) {
      // Nothing at or below this level: say so rather than wait for a set
      // that cannot come.
      empty = true
      render({ state, step, playing, empty })
      return
    }
    dispatch({
      type: "begin-set",
      at: now(),
      level,
      progress: freshSet(items),
      paces: state.paces,
    })
  }

  const speak = (seq: number, text: string, playingMs: number): void => {
    const { speech } = options()
    if (!speech?.available) return
    utterance?.abort()
    const controller = new AbortController()
    utterance = controller
    const asked = now()
    let started: number | null = null
    void speech
      .say(text, {
        language: SPOKEN_LANGUAGE,
        signal: controller.signal,
        onStart: () => {
          started = now()
          if (utterance !== controller) return
          playing = seq
          // The first wait allowed for synthesis; from here the fallback
          // runs from the sound itself, so a slow voice is not cut off. It
          // never runs past the first wait's deadline, so the step stays
          // within the bound the machine declared (Rem. 4.10).
          if (state.seq === seq && deadline?.seq === seq) {
            const ms = Math.min(playingMs, deadline.at - now())
            if (ms > 0) {
              clearTimer()
              timer = setTimeout(() => {
                timer = null
                dispatch({ type: "elapsed", at: now(), seq })
              }, ms)
              step = { seq, ms }
            }
          }
          render({ state, step, playing, empty })
        },
      })
      .then((outcome) => {
        if (utterance !== controller) return
        utterance = null
        // Anything but a heard line leaves the step to its fallback wait,
        // so the rep still ends (Rem. 4.10).
        if (outcome.kind !== "heard") return
        const end = now()
        dispatch({
          type: "spoken",
          at: end,
          seq,
          heardMs: end - (started ?? asked),
        })
      })
  }

  const run = (effect: SetEffect): void => {
    const { onRecord, onPace } = options()
    switch (effect.type) {
      case "wait": {
        clearTimer()
        const { seq, ms } = effect
        timer = setTimeout(() => {
          timer = null
          dispatch({ type: "elapsed", at: now(), seq })
        }, ms)
        step = { seq, ms }
        deadline = { seq, at: now() + ms }
        return
      }
      case "speak": {
        speak(effect.seq, effect.text, effect.playingMs)
        return
      }
      case "stop-speech": {
        stopSpeech()
        return
      }
      case "count-rep": {
        onRecord?.(
          { type: "rep", creditMs: effect.creditMs },
          dayKey(new Date(now()))
        )
        return
      }
      case "count-set": {
        onRecord?.({ type: "set" }, dayKey(new Date(now())))
        return
      }
      case "save-pace": {
        onPace?.(effect.wordId, effect.pace)
        return
      }
      case "request-set": {
        drawSet()
        return
      }
      default: {
        return assertNever(effect)
      }
    }
  }

  function dispatch(event: SetEvent): void {
    // Effects may dispatch (a set is drawn, then begun); those events wait
    // for the current one's effects to finish, so none acts on a stale step.
    queue.push(event)
    if (dispatching) return
    dispatching = true
    try {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) break
        const transition = setMachineReducer(state, next)
        if (transition.state === state) continue
        // A new step has no clock, and no audio, until its own effects start them.
        if (transition.state.seq !== state.seq) {
          step = null
          playing = null
        }
        state = transition.state
        for (const effect of transition.effects) run(effect)
        options().onProgress?.(progressOf(state))
      }
    } finally {
      dispatching = false
    }
    render({ state, step, playing, empty })
  }

  return {
    dispatch,
    now,
    begin: (): void => {
      const { resume, level } = options()
      if (resume && resume.queue.length > 0) {
        dispatch({
          type: "begin-set",
          at: now(),
          level,
          progress: resume,
          paces: options().paces ?? {},
        })
        return
      }
      state = { ...state, paces: options().paces ?? {} }
      drawSet()
    },
    hide: (): void => dispatch({ type: "hidden", at: now() }),
    show: (): void => dispatch({ type: "shown", at: now() }),
    dispose: (): void => {
      dispatch({ type: "hidden", at: now() })
      clearTimer()
      stopSpeech()
    },
  }
}

/** A learner's action, sent from an event handler, never during render. */
function send(
  runnerRef: RefObject<Runner | null>,
  type: "stuck" | "skip" | "pause" | "resume" | "next-set" | "start-sitting"
): void {
  const runner = runnerRef.current
  runner?.dispatch({ type, at: runner.now() })
}

export function useReadAloud(options: UseReadAloudOptions): ReadAloudVM {
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    playing: null,
    empty: false,
    state: createSetMachine(options.level),
    step: null,
  }))
  // Made on mount, never during render: it reads the latest options, and it
  // outlives React's development double mount.
  const runnerRef = useRef<Runner | null>(null)
  const [started, setStarted] = useState(false)

  // A hidden page interrupts the rep; shown again, it starts over. The same
  // pair covers an unmount: whatever was running stops, and the set's
  // progress, current rep included, is what the host last received.
  useEffect(() => {
    const runner = (runnerRef.current ??= createRunner(
      () => latest.current,
      setSnapshot
    ))
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") runner.hide()
      else runner.show()
    }
    document.addEventListener("visibilitychange", onVisibility)
    // A remount (React's development double mount) picks the rep up again.
    runner.show()
    return (): void => {
      document.removeEventListener("visibilitychange", onVisibility)
      runner.dispose()
    }
  }, [])

  return {
    state: snapshot.state,
    started,
    audio: options.speech?.available === true,
    entry: currentEntry(snapshot.state),
    step: snapshot.step,
    playing: snapshot.playing,
    empty: snapshot.empty,
    begin: (): void => {
      const runner = runnerRef.current
      if (started || !runner) return
      setStarted(true)
      runner.begin()
    },
    stuck: (): void => send(runnerRef, "stuck"),
    skip: (): void => send(runnerRef, "skip"),
    pause: (): void => send(runnerRef, "pause"),
    resume: (): void => send(runnerRef, "resume"),
    nextSet: (): void => send(runnerRef, "next-set"),
    startSitting: (): void => send(runnerRef, "start-sitting"),
  }
}
