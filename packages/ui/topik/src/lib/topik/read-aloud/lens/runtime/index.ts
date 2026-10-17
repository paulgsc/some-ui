/**
 * Runs the grammar-lens machine (`lens/machine`) over its ports: one timer,
 * the speech adapter, and the host's exit (adaptive-learning canon
 * Cor. 4.8, Rem. 4.10). React reads its snapshot and sends it the
 * learner's taps (`useLensSession`); everything with a lifetime is here.
 *
 * Speech is asked only for an item's cue and for its line as authored, so a
 * misform is never voiced (Cor. 4.8 (ii)). A line that ends, fails or is cut
 * off clears what is playing and nothing else: no screen waits on speech. A
 * cue drawn to be heard that cannot be, muted or failed, is shown instead.
 */

import { assertNever } from "@some-ui/core-utils"
import type { Speaker } from "@some-ui/speech"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
} from "@topik/lib/topik/read-aloud/content"
import type { LensItem } from "@topik/lib/topik/read-aloud/lens/items"
import { buildLensSet } from "@topik/lib/topik/read-aloud/lens/items"
import type {
  LensEffect,
  LensEvent,
  LensState,
} from "@topik/lib/topik/read-aloud/lens/machine"
import {
  createLensMachine,
  currentItem,
  lensReducer,
} from "@topik/lib/topik/read-aloud/lens/machine"
import { serialDispatch } from "@topik/lib/topik/read-aloud/serial-dispatch"

export type LensRuntimeOptions = {
  deck: ReadAloudDeck
  level: ReadAloudLevel
  speech: Speaker | null
  /** The summary's two minutes ran out, or there was no set to draw. */
  onExit: () => void
  /** Test seams: the clock, and the key each new set is drawn with. */
  now?: () => number
  seedKey?: () => string
}

/** Which of an item's two speakable lines is audible now. */
export type LensPlaying = "cue" | "line" | null

export type LensSnapshot = {
  state: LensState
  playing: LensPlaying
  /** The current item's cue could not be heard, so it is shown. */
  cueRead: boolean
}

export type LensRuntime = {
  dispatch: (event: LensEvent) => void
  begin: () => void
  hearCue: () => void
  hearLine: () => void
  hide: () => void
  hold: () => void
  show: () => void
  dispose: () => void
  now: () => number
}

/**
 * `source` holds the options as they stand (a React ref, from
 * `useLensSession`): each is read when it is needed, never kept.
 */
export function createLensRuntime(
  source: { readonly current: LensRuntimeOptions },
  render: (snapshot: LensSnapshot) => void
): LensRuntime {
  const options = (): LensRuntimeOptions => source.current
  let state = createLensMachine()
  let playing: LensPlaying = null
  /** The item whose cue could not be heard. */
  let unheard: LensItem | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let utterance: AbortController | null = null

  const now = (): number => options().now?.() ?? Date.now()
  const publish = (): void => {
    const cueRead = unheard !== null && unheard === currentItem(state)
    render({ state, playing, cueRead })
  }

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const stopSpeech = (): void => {
    utterance?.abort()
    utterance = null
    options().speech?.stop()
    playing = null
  }

  const say = (text: string, which: Exclude<LensPlaying, null>): void => {
    const { speech } = options()
    if (!speech?.available) return
    const item = currentItem(state) ?? null
    if (which === "cue" && speech.muted) {
      unheard = item
      return
    }
    stopSpeech()
    const controller = new AbortController()
    utterance = controller
    void speech
      .say(text, {
        language: SPOKEN_LANGUAGE,
        urgency: "now",
        signal: controller.signal,
        onStart: () => {
          if (utterance !== controller) return
          playing = which
          publish()
        },
      })
      .then((outcome) => {
        if (utterance !== controller) return
        utterance = null
        playing = null
        const lost =
          outcome.kind === "muted" ||
          outcome.kind === "failed" ||
          outcome.kind === "ended"
        if (which === "cue" && lost) unheard = item
        publish()
      })
  }

  const drawSet = (): void => {
    const { deck, level, seedKey } = options()
    const items = buildLensSet(deck, {
      level,
      seedKey: seedKey?.() ?? `${now()}`,
    })
    // Offered only where a set can be drawn; were none, back to the start.
    if (items.length === 0) {
      options().onExit()
      return
    }
    dispatch({ type: "begin", at: now(), items })
  }

  function run(effect: LensEffect): void {
    switch (effect.type) {
      case "wait": {
        clearTimer()
        const { seq, ms } = effect
        timer = setTimeout(() => {
          timer = null
          dispatch({ type: "elapsed", at: now(), seq })
        }, ms)
        return
      }
      case "speak-cue": {
        say(effect.text, "cue")
        return
      }
      case "stop-speech": {
        stopSpeech()
        return
      }
      case "request-set": {
        drawSet()
        return
      }
      case "exit": {
        options().onExit()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  const dispatch = serialDispatch((event: LensEvent) => {
    const transition = lensReducer(state, event)
    if (transition.state === state) return
    state = transition.state
    for (const effect of transition.effects) run(effect)
  }, publish)

  return {
    dispatch,
    now,
    begin: (): void => {
      if (state.phase.name === "idle" && state.items.length === 0) drawSet()
    },
    hearCue: (): void => {
      const cue = currentItem(state)?.cue
      if (cue) say(cue.korean, "cue")
    },
    hearLine: (): void => {
      const item = currentItem(state)
      // The line as authored, and only once its reveal shows it so.
      if (item && state.phase.name === "reveal") say(item.korean, "line")
    },
    hide: (): void => {
      clearTimer()
      dispatch({ type: "hidden", at: now() })
    },
    hold: (): void => dispatch({ type: "held", at: now() }),
    show: (): void => dispatch({ type: "shown", at: now() }),
    dispose: (): void => {
      // A remount (React's development double mount) shows it again.
      dispatch({ type: "hidden", at: now() })
      clearTimer()
      stopSpeech()
    },
  }
}
