/**
 * Runs Studio's Spoken on the phone (W5): the spoken cards this phone keeps
 * (`./store`), the takes of their parts, the band a part is read through,
 * and each take played and heard. The screens read its snapshots and call
 * its intents; it owns every wait (R1).
 *
 * - **A part's takes are the Takes desk's,** under the part's line
 *   (`./model`). Each take the desk lists is added to its part as it is
 *   seen, so a take that later leaves the phone stays the part's (SCR1).
 * - **The band moves on the recorder's own level** (`heardOf`), at the pace
 *   kept for every band on this phone.
 * - **A take plays from this phone, or else from home**, one at a time, on
 *   the shared play steps (`@some-ui/voice-capture`'s `played`). Home's words
 *   for a take are asked once a page.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Prompter } from "@some-ui/shared"
import {
  heardOf,
  NO_PROMPTER,
  paceOf,
  phrasesOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "@some-ui/shared"
import type {
  HeardAnswer,
  Playback,
  Player,
  PlaySlice,
  PlayStep,
  TakePattern,
} from "@some-ui/voice-capture"
import {
  audioRead,
  played,
  playEnded,
  QUIET_PLAY,
  stopped,
} from "@some-ui/voice-capture"

import type { Readable } from "@/lib/cell"
import { cell } from "@/lib/cell"
import type { PaceStore } from "@/lib/interview-week/store"

import type { PastedCard, SpokenCard } from "./model"
import { cardId, flip, keptCard, lineOf, use, withSeen } from "./model"
import type { SpokenStore } from "./store"

/** What home heard in each take asked about, by id. */
export type Heard = Readonly<Partial<Record<string, HeardAnswer>>>

export type SpokenPorts = {
  readonly store: SpokenStore
  readonly pace: PaceStore
  /** The Takes desk's takes on this phone, each with the line it answers. */
  readonly takes: Readable<
    ReadonlyArray<{ readonly id: string; readonly answers: string }>
  >
  readonly pattern: TakePattern
  /** A take's audio while this phone holds it. */
  readonly audioHere: (id: string) => Promise<Blob | null>
  /** A take's audio from home; null when home can't give it now. */
  readonly audioFromHome: (id: string) => Promise<Blob | null>
  readonly heard: (id: string) => Promise<HeardAnswer>
  readonly player: Player
  readonly now: () => number
  readonly random: () => number
}

export type SpokenRuntime = {
  readonly cards: Readable<ReadonlyArray<SpokenCard>>
  /** Keeps `pasted` as a new card; its id, or null when this phone couldn't. */
  readonly keep: (pasted: PastedCard) => string | null
  readonly flip: (id: string, n: number) => void
  readonly use: (id: string, n: number, take: string) => void
  /** The pattern each part's takes are recorded on. */
  readonly pattern: TakePattern
  readonly prompter: Readable<Prompter>
  readonly pace: Readable<number>
  readonly setPace: (to: "slower" | "faster") => void
  readonly pause: () => void
  readonly play: Readable<PlaySlice>
  /** Plays take `id`, or stops it while it plays. */
  readonly toggle: (id: string) => void
  readonly heard: Readable<Heard>
  /** Asks home what it heard in each of `ids` it hasn't said yet. */
  readonly askHeard: (ids: ReadonlyArray<string>) => void
  /** A page is showing. Returns its leaving. */
  readonly attach: () => () => void
}

export function createSpokenRuntime(ports: SpokenPorts): SpokenRuntime {
  const cards = cell<ReadonlyArray<SpokenCard>>(ports.store.read())
  const write = (next: ReadonlyArray<SpokenCard>): boolean => {
    if (!ports.store.write(next)) return false
    cards.set(next)
    return true
  }
  /** `step` over every card; kept only when one changed. */
  const change = (step: (card: SpokenCard) => SpokenCard): void => {
    const now = cards.getSnapshot()
    const next = now.map(step)
    if (next.some((card, at) => card !== now[at])) write(next)
  }
  const changeOne = (
    id: string,
    step: (card: SpokenCard) => SpokenCard
  ): void => change((card) => (card.id === id ? step(card) : card))

  /** Adds each take the desk lists to its part (SCR1). */
  const see = (): void => {
    const takes = ports.takes
      .getSnapshot()
      .map((take) => ({ id: take.id, line: take.answers }))
    change((card) => withSeen(card, takes))
  }

  const prompter = cell<Prompter>(NO_PROMPTER)
  const pace = cell(paceOf(ports.pace.read()))
  /** Each read part's words, counted once per list of cards. */
  let totals: { of: ReadonlyArray<SpokenCard>; by: Map<string, number> } = {
    of: [],
    by: new Map(),
  }
  const totalsNow = (): ReadonlyMap<string, number> => {
    const now = cards.getSnapshot()
    if (totals.of !== now) {
      const by = new Map<string, number>()
      for (const card of now) {
        for (const [n, part] of card.parts.entries()) {
          if (part.kind === "read") {
            by.set(lineOf(card.id, n), totalOf(phrasesOf(part.text)))
          }
        }
      }
      totals = { of: now, by }
    }
    return totals.by
  }
  const listen = (): void => {
    prompter.set(
      stepPrompter(
        prompter.getSnapshot(),
        heardOf(
          ports.pattern.getSnapshot(),
          totalsNow(),
          ports.now(),
          pace.getSnapshot()
        )
      )
    )
  }

  const play = cell<PlaySlice>(QUIET_PLAY)
  let playback: Playback | null = null
  const run = (step: PlayStep<PlaySlice>): void => {
    play.set(step.state)
    for (const effect of step.effects) {
      switch (effect.type) {
        case "stopPlayback": {
          playback?.stop()
          playback = null
          break
        }
        case "readAudio": {
          void ports
            .audioHere(effect.id)
            // Ignored: audio this phone can't read back is asked of home instead.
            .catch(() => null)
            .then((here) => here ?? ports.audioFromHome(effect.id))
            .then((audio) =>
              run(audioRead(play.getSnapshot(), effect.play, audio))
            )
          break
        }
        case "startPlayback": {
          const started = ports.player.play(effect.audio)
          playback = started
          void started.ended.then(() =>
            run(playEnded(play.getSnapshot(), effect.play))
          )
          break
        }
        default: {
          assertNever(effect)
        }
      }
    }
  }

  const heard = cell<Heard>({})
  const askHeard = (ids: ReadonlyArray<string>): void => {
    for (const id of ids) {
      if (heard.getSnapshot()[id]?.kind === "heard") continue
      void ports.heard(id).then((answer) => {
        heard.set({ ...heard.getSnapshot(), [id]: answer })
      })
    }
  }

  return {
    cards,
    keep(pasted): string | null {
      const at = ports.now()
      const id = cardId(at, ports.random)
      const kept = keptCard(pasted, id, new Date(at).toISOString())
      return write([kept, ...cards.getSnapshot()]) ? id : null
    },
    flip: (id, n) => changeOne(id, (card) => flip(card, n)),
    use: (id, n, take) => changeOne(id, (card) => use(card, n, take)),
    pattern: ports.pattern,
    prompter,
    pace,
    setPace(to): void {
      const next = stepPace(pace.getSnapshot(), to)
      pace.set(next)
      ports.pace.write(next)
    },
    pause: () =>
      prompter.set(stepPrompter(prompter.getSnapshot(), { type: "pause" })),
    play,
    toggle: (id) => run(played(play.getSnapshot(), id)),
    heard,
    askHeard,
    attach(): () => void {
      see()
      const stopSeeing = ports.takes.subscribe(see)
      const stopListening = ports.pattern.subscribe(listen)
      return (): void => {
        stopListening()
        stopSeeing()
        run(stopped(play.getSnapshot()))
        prompter.set(stepPrompter(prompter.getSnapshot(), { type: "ended" }))
      }
    },
  }
}
