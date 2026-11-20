/**
 * Runs Studio's Spoken on the phone (W5): the spoken cards this phone
 * keeps (`./store`), the takes of their parts, the band a part is read
 * through, and each take played and heard. The screens read its
 * snapshots and call its intents; it owns every wait (R1).
 *
 * - **A take is the Takes desk's.** A part's take is recorded on the desk
 *   of Studio's takes with no scene (`lib/library-takes`), under the part's
 *   line (`lineOf`), so it goes home as any Studio take does, named by that
 *   line (C807). Each take the desk lists is added to its part as it is
 *   seen (SCR1), so a take that later leaves the phone, once home holds it,
 *   stays the part's.
 * - **The band moves on the recorder's own level** (`heardOf`), as the
 *   interview week's does, at the pace kept for every band on this phone.
 * - **A take plays from this phone, or else from home**, one at a time.
 *   Home's words for a take are asked once a page.
 */
import type { Prompter } from "@some-ui/shared"
import {
  heardOf,
  NO_PROMPTER,
  paceOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "@some-ui/shared"
import type {
  HeardAnswer,
  Playback,
  Player,
  TakePattern,
} from "@some-ui/voice-capture"

import type { PaceStore } from "@/lib/interview-week/store"

import type { PastedCard, SpokenCard } from "./model"
import {
  cardId,
  flip,
  keptCard,
  lineOf,
  phrasesOf,
  use,
  withSeen,
} from "./model"
import type { SpokenStore } from "./store"

type Readable<T> = {
  readonly getSnapshot: () => T
  readonly subscribe: (listener: () => void) => () => void
}

/** A store of one value, told to its listeners when it changes. */
function cell<T>(first: T): Readable<T> & { set: (next: T) => void } {
  let value = first
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    set(next): void {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** A take's place in what plays: asked for, playing, or one that couldn't. */
export type Playing =
  | { readonly kind: "quiet" }
  | { readonly kind: "asking"; readonly id: string }
  | { readonly kind: "playing"; readonly id: string }
  | { readonly kind: "missed"; readonly id: string }

/** What home heard in each take asked about, by id. */
export type Heard = Readonly<Partial<Record<string, HeardAnswer>>>

export type SpokenPorts = {
  readonly store: SpokenStore
  readonly pace: PaceStore
  /** The Takes desk's takes on this phone, each with its line. */
  readonly takes: Readable<
    ReadonlyArray<{ readonly id: string; readonly line: string }>
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
  readonly scripts: Readable<ReadonlyArray<SpokenCard>>
  /** Keeps `pasted` as a new script; its id, or null when this phone couldn't. */
  readonly keep: (pasted: PastedCard) => string | null
  readonly flip: (id: string, n: number) => void
  readonly use: (id: string, n: number, take: string) => void
  /** The pattern each part's takes are recorded on. */
  readonly pattern: TakePattern
  readonly prompter: Readable<Prompter>
  readonly pace: Readable<number>
  readonly setPace: (to: "slower" | "faster") => void
  readonly pause: () => void
  readonly playing: Readable<Playing>
  /** Plays take `id`, or stops it while it plays. */
  readonly play: (id: string) => void
  readonly heard: Readable<Heard>
  /** Asks home what it heard in each of `ids` it hasn't said yet. */
  readonly askHeard: (ids: ReadonlyArray<string>) => void
  /** A page is showing. Returns its leaving. */
  readonly attach: () => () => void
}

export function createSpokenRuntime(ports: SpokenPorts): SpokenRuntime {
  const scripts = cell<ReadonlyArray<SpokenCard>>(ports.store.read())
  const write = (next: ReadonlyArray<SpokenCard>): boolean => {
    if (next === scripts.getSnapshot()) return true
    if (!ports.store.write(next)) return false
    scripts.set(next)
    return true
  }
  const change = (
    id: string,
    step: (script: SpokenCard) => SpokenCard
  ): void => {
    const now = scripts.getSnapshot()
    const next = now.map((script) => (script.id === id ? step(script) : script))
    if (next.some((script, at) => script !== now[at])) write(next)
  }

  /** Adds each take the desk lists to its part (SCR1). */
  const see = (): void => {
    const takes = ports.takes.getSnapshot()
    const now = scripts.getSnapshot()
    const next = now.map((script) => withSeen(script, takes))
    if (next.some((script, at) => script !== now[at])) write(next)
  }

  const prompter = cell<Prompter>(NO_PROMPTER)
  const pace = cell(paceOf(ports.pace.read()))
  /** Each read part's words, counted once per script list. */
  let totals = new Map<string, number>()
  let totalsOf: ReadonlyArray<SpokenCard> | null = null
  const totalsNow = (): ReadonlyMap<string, number> => {
    const now = scripts.getSnapshot()
    if (totalsOf !== now) {
      totalsOf = now
      totals = new Map(
        now.flatMap((script) =>
          script.parts.flatMap((part, n) =>
            part.kind === "read"
              ? [[lineOf(script.id, n), totalOf(phrasesOf(part.text))] as const]
              : []
          )
        )
      )
    }
    return totals
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

  const audioOf = async (id: string): Promise<Blob | null> =>
    // Ignored: audio this phone can't read back is asked of home instead.
    (await ports.audioHere(id).catch(() => null)) ??
    (await ports.audioFromHome(id))

  const playing = cell<Playing>({ kind: "quiet" })
  let playback: Playback | null = null
  let asked = 0
  const stopPlaying = (): void => {
    asked += 1
    playback?.stop()
    playback = null
    playing.set({ kind: "quiet" })
  }
  const play = (id: string): void => {
    const now = playing.getSnapshot()
    const same = now.kind !== "quiet" && now.id === id
    stopPlaying()
    if (same && now.kind !== "missed") return
    const mine = asked
    playing.set({ kind: "asking", id })
    void audioOf(id).then((audio) => {
      // A later tap, or the page going, overtook this one.
      if (mine !== asked) return
      if (audio === null) {
        playing.set({ kind: "missed", id })
        return
      }
      const started = ports.player.play(audio)
      playback = started
      playing.set({ kind: "playing", id })
      void started.ended.then(() => {
        if (playback !== started) return
        playback = null
        playing.set({ kind: "quiet" })
      })
    })
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
    scripts,
    keep(pasted): string | null {
      const at = ports.now()
      const id = cardId(at, ports.random)
      const kept = keptCard(pasted, id, new Date(at).toISOString())
      return write([kept, ...scripts.getSnapshot()]) ? id : null
    },
    flip: (id, n) => change(id, (script) => flip(script, n)),
    use: (id, n, take) => change(id, (script) => use(script, n, take)),
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
    playing,
    play,
    heard,
    askHeard,
    attach(): () => void {
      see()
      const stopSeeing = ports.takes.subscribe(see)
      const stopListening = ports.pattern.subscribe(listen)
      return (): void => {
        stopListening()
        stopSeeing()
        stopPlaying()
        prompter.set(stepPrompter(prompter.getSnapshot(), { type: "ended" }))
      }
    },
  }
}
