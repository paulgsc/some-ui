/**
 * Runs the grammar-lens machine (`lens/machine`) over its ports: one timer,
 * the speech adapter, the record, and the host's exit (adaptive-learning
 * canon Cor. 4.8, Rem. 4.10, Rem. 4.18). React reads its snapshot and sends it the
 * learner's taps (`useLensSession`); everything with a lifetime is here.
 *
 * Speech is asked only for an item's cue and for its line as authored, so a
 * misform is never voiced (Cor. 4.8 (ii)). A line that ends, fails or is cut
 * off clears what is playing and nothing else: no screen waits on speech. A
 * cue drawn to be heard that cannot be, muted or failed, is shown instead.
 */

import { assertNever } from "@some-ui/core-utils"
import type { Speaker } from "@some-ui/speech"
import type { LensTakes } from "@topik/lib/topik/adapter/lens-takes"
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
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import { recordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import { serialDispatch } from "@topik/lib/topik/read-aloud/serial-dispatch"

export type LensRuntimeOptions = {
  deck: ReadAloudDeck
  level: ReadAloudLevel
  speech: Speaker | null
  /** The summary's two minutes ran out, or there was no set to draw. */
  onExit: () => void
  /**
   * Keep an answered item's entry (Rem. 4.18): when it closes, and before,
   * when the page is hidden or the session left, since the app may not come
   * back. A later entry for the same item replaces it. Absent where the host
   * has no export to carry the record, and then nothing is kept.
   */
  record?: (entry: LensRecordEntry) => void
  /** The learner's takes (Rem. 4.16); absent, none is offered. */
  takes?: LensTakes
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
  /** Follows the takes while mounted; returns the detach. */
  attach: () => () => void
  /** Starts a take of the current item's line, during its reveal. */
  startTake: () => void
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
  /**
   * Items whose cue speech began saying before the answer, and did not then
   * lose (muted, failed, cut off by the speaker): the record's heard cues.
   */
  const heard = new WeakSet<LensItem>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let utterance: AbortController | null = null
  /** When the session began, which names it in the record. */
  let session = ""
  /** The session's entries so far, by set and index: what `racing` reads. */
  const kept = new Map<string, LensRecordEntry>()
  let set = 0
  /** Per item of the set: the takes kept, and whether its line was heard. */
  let takes = new Map<
    number,
    { count: number; lastMs: number; heardFirst: boolean }
  >()
  /** Items whose line was heard. */
  let lineHeard = new Set<number>()
  /** Whether the line had been heard when each item's first take began. */
  let heardAtFirst = new Map<number, boolean>()
  let lastTake: string | null = null

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
          // Heard before the answer: a cue replayed after it gave nothing.
          if (which === "cue" && item && state.phase.name === "item") {
            heard.add(item)
          }
          playing = which
          if (which === "line") lineHeard.add(state.cursor)
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
        if (which === "cue" && lost) {
          unheard = item
          if (item) heard.delete(item)
        }
        publish()
      })
  }

  /** A take is opening, recording or being kept. */
  const taking = (): boolean =>
    (options().takes?.getSnapshot().take.kind ?? "idle") !== "idle"

  /**
   * The item's takes for the record, a take still under way among them: one
   * cut off by leaving or hiding is kept after this entry is written, and
   * would land on no item.
   */
  const takenAt = (
    index: number
  ): { count: number; lastMs: number; heardFirst: boolean } | null => {
    const made = takes.get(index) ?? null
    const take = options().takes?.getSnapshot().take
    const under = take?.kind === "recording" || take?.kind === "keeping"
    if (!take || !under || index !== state.cursor) return made
    return {
      count: (made?.count ?? 0) + 1,
      lastMs: take.kind === "recording" ? take.elapsedMs : (made?.lastMs ?? 0),
      heardFirst:
        made?.heardFirst ?? heardAtFirst.get(index) ?? lineHeard.has(index),
    }
  }

  const keep = (index: number, at: number): void => {
    const item = state.items[index]
    const outcome = state.outcomes[index]
    const { record } = options()
    if (!record || !item || outcome?.answeredAt == null) return
    const key = `${set}:${index}`
    const earlier = [...kept].flatMap(([other, entry]) =>
      other === key ? [] : [entry]
    )
    const entry = recordEntry(item, outcome, {
      session,
      closedAt: at,
      audio: heard.has(item),
      earlier,
      take: takenAt(index),
    })
    kept.set(key, entry)
    try {
      record(entry)
    } catch {
      // The record is the export's, and losing an entry costs nothing more
      // (Thm. 7.2): the session goes on.
    }
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
    set += 1
    takes = new Map()
    lineHeard = new Set()
    heardAtFirst = new Map()
    session ||= new Date(now()).toISOString()
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
      case "closed": {
        keep(effect.index, effect.at)
        options().takes?.reset()
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
      if (cue && !taking()) say(cue.korean, "cue")
    },
    hearLine: (): void => {
      const item = currentItem(state)
      // The line as authored, and only once its reveal shows it so; never
      // into a take under way.
      if (!item || state.phase.name !== "reveal" || taking()) return
      say(item.korean, "line")
    },
    attach: (): (() => void) => {
      const port = options().takes
      if (!port) return () => undefined
      return port.subscribe(() => {
        const kept = port.getSnapshot().last
        if (!kept || kept.id === lastTake) return
        lastTake = kept.id
        const index = state.cursor
        const before = takes.get(index)
        takes.set(index, {
          count: (before?.count ?? 0) + 1,
          lastMs: kept.durationMs,
          heardFirst:
            before?.heardFirst ??
            heardAtFirst.get(index) ??
            lineHeard.has(index),
        })
      })
    },
    startTake: (): void => {
      const item = currentItem(state)
      if (item && state.phase.name === "reveal") {
        stopSpeech()
        publish()
        if (!heardAtFirst.has(state.cursor)) {
          heardAtFirst.set(state.cursor, lineHeard.has(state.cursor))
        }
        options().takes?.start(item.lineId)
      }
    },
    hide: (): void => {
      clearTimer()
      // The app may be closed while hidden: keep what was answered, a take
      // under way counted while its length is known.
      keep(state.cursor, now())
      // No microphone or playback in the background; a take is kept.
      options().takes?.stop()
      dispatch({ type: "hidden", at: now() })
    },
    hold: (): void => {
      options().takes?.stop()
      dispatch({ type: "held", at: now() })
    },
    show: (): void => dispatch({ type: "shown", at: now() }),
    dispose: (): void => {
      // Left with an item answered: it closes here. A remount (React's
      // development double mount) shows it again.
      keep(state.cursor, now())
      options().takes?.reset()
      dispatch({ type: "hidden", at: now() })
      clearTimer()
      stopSpeech()
    },
  }
}
