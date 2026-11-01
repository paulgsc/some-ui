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

/** An item's takes as the record counts them (Rem. 4.16). */
type ItemTakes = { count: number; lastMs: number; heardFirst: boolean }

export type LensRuntime = {
  dispatch: (event: LensEvent) => void
  /**
   * The take button's tap, during the reveal: starts a take of the current
   * item's line, the speech stopped first, superseding `supersedes` once
   * kept (a Redo, D2), or stops the take under way (D1).
   */
  tapTake: (supersedes?: string | null) => void
  /** Plays one of the line's takes, or stops it, the speech stopped first. */
  playTake: (id: string) => void
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
  /** Per item of the set: the takes kept. */
  let takes = new Map<number, ItemTakes>()
  /** Items whose line was heard. */
  let lineHeard = new Set<number>()

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

  /**
   * A playback of the learner's take stops before speech starts, and so does
   * one still being read, which `playing` does not show yet.
   */
  const stopPlayback = (): void => {
    options().takes?.pattern.stopPlaying()
  }

  /** A take is opening, recording or being kept. */
  const taking = (): boolean =>
    (options().takes?.pattern.getSnapshot().take.kind ?? "idle") !== "idle"

  /** The screen went, or the item closed: a take under way is kept, nothing plays. */
  const leaveTakes = (): void => {
    options().takes?.pattern.leave()
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
      take: takes.get(index) ?? null,
    })
    kept.set(key, entry)
    write(entry)
  }

  const write = (entry: LensRecordEntry): void => {
    try {
      options().record?.(entry)
    } catch {
      // Ignored: the record is the export's, and losing an entry costs nothing more
      // (Thm. 7.2): the session goes on.
    }
  }

  /**
   * A take of item `index` of set `forSet` was kept: it counts there, and an
   * entry already written for that item (it was left, or hidden, while the
   * take was being kept) is written again with it.
   */
  const landed = (
    forSet: number,
    index: number,
    lastMs: number,
    heardFirst: boolean
  ): void => {
    const key = `${forSet}:${index}`
    const entry = kept.get(key)
    const current = forSet === set
    const before = current ? (takes.get(index) ?? null) : (entry?.take ?? null)
    const after: ItemTakes = {
      count: (before?.count ?? 0) + 1,
      lastMs,
      heardFirst: before?.heardFirst ?? heardFirst,
    }
    if (current) takes.set(index, after)
    if (entry) {
      const again = { ...entry, take: after }
      kept.set(key, again)
      write(again)
    }
  }

  /**
   * Follows one take from its start to its end, outside React, so a take
   * the learner left mid-way still lands on the item it was started on.
   * Whether the line was heard is read when recording begins; the take
   * counts only once kept (not too short, not refused, not failed): its
   * ending names the take, which the port lists by then.
   */
  const follow = (port: LensTakes, index: number): (() => void) => {
    const { pattern } = port
    const forSet = set
    const before = pattern.getSnapshot().ended?.seq ?? 0
    let heardFirst: boolean | null = null
    const unsubscribe = pattern.subscribe(() => {
      const { take, ended } = pattern.getSnapshot()
      if (take.kind === "recording" && heardFirst === null) {
        heardFirst = forSet === set && lineHeard.has(index)
      }
      if (ended === null || ended.seq === before) return
      unsubscribe()
      const kept =
        ended.ending === "kept" && ended.id !== null
          ? port.getSnapshot().takes.find(({ id }) => id === ended.id)
          : undefined
      if (kept && heardFirst !== null) {
        landed(forSet, index, kept.durationMs, heardFirst)
      }
    })
    return unsubscribe
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
        leaveTakes()
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
      if (!cue || taking()) return
      stopPlayback()
      say(cue.korean, "cue")
    },
    hearLine: (): void => {
      const item = currentItem(state)
      // The line as authored, and only once its reveal shows it so; never
      // into a take under way.
      if (!item || state.phase.name !== "reveal" || taking()) return
      stopPlayback()
      say(item.korean, "line")
    },
    tapTake: (supersedes = null): void => {
      const item = currentItem(state)
      const port = options().takes
      if (!item || !port || state.phase.name !== "reveal") return
      const { pattern } = port
      // D1: a tap while a take is under way stops it.
      if (taking()) {
        pattern.tap(item.lineId)
        return
      }
      if (port.getSnapshot().full) return
      stopSpeech()
      publish()
      const unfollow = follow(port, state.cursor)
      pattern.tap(item.lineId, supersedes)
      // Refused at once (another screen holds the microphone): nothing to follow.
      if (!taking()) unfollow()
    },
    playTake: (id): void => {
      if (taking()) return
      stopSpeech()
      publish()
      options().takes?.pattern.play(id)
    },
    hide: (): void => {
      clearTimer()
      // The app may be closed while hidden: keep what was answered. A take
      // under way is written into it again once kept (`follow`).
      keep(state.cursor, now())
      // No microphone or playback in the background; a take is kept.
      leaveTakes()
      dispatch({ type: "hidden", at: now() })
    },
    hold: (): void => {
      leaveTakes()
      dispatch({ type: "held", at: now() })
    },
    show: (): void => dispatch({ type: "shown", at: now() }),
    dispose: (): void => {
      // Left with an item answered: it closes here. A remount (React's
      // development double mount) shows it again.
      keep(state.cursor, now())
      leaveTakes()
      dispatch({ type: "hidden", at: now() })
      clearTimer()
      stopSpeech()
    },
  }
}
