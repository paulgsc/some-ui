/**
 * Runs Takes on home (`./model`) against home, through the port the build
 * hands in (www's `lib/take-library`), and the phone's player. It owns the
 * playback under way and turns each effect into a call and each answer into
 * an event; which answer still counts is `stepLibrary`'s, by the read's and
 * the play's numbers. Once the screen is left, no answer reaches it.
 *
 * With the phone's own takes (`LibraryPhone`, www's `lib/library-takes`),
 * it tells the machine when one reaches home and when the phone records or
 * plays one, stops the phone's playback when one from home starts, and
 * leaves the phone's take pattern when the screen goes, so a take under way
 * is kept.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player, TakePattern } from "@some-ui/voice-capture"
import type { Refresh } from "@soundbites/lib/refresh"
import { checkAgainOf } from "@soundbites/lib/refresh"

import type { TakeAbout } from "./compartments"
import type { TakeNames, TakeOf } from "./kinds"
import type {
  LibraryEffect,
  LibraryEvent,
  LibraryIntent,
  LibraryPhoneSnapshot,
  LibraryRead,
  LibraryState,
  LibraryTake,
} from "./model"
import { INITIAL_LIBRARY, reachedHome, stepLibrary } from "./model"
import { LIBRARY_WORDS } from "./words"

/** Home, as Takes on home reads it. Every call resolves. */
export type TakesHome = {
  /**
   * The newest takes when `q` is null, else those whose words hold every
   * word of `q`. `wanted` says whether the answer is still wanted: once it
   * says no, a link busy with another run is not asked again.
   */
  readonly takes: (
    q: string | null,
    wanted: () => boolean,
    /** The take to read on from (TAKES20); null or absent, the first page. */
    after?: string | null
  ) => Promise<LibraryRead>
  /** Take `id`'s audio from home; null when home can't give it back now. */
  readonly audio: (id: string) => Promise<Blob | null>
}

/**
 * The phone's takes with no scene (ST32), as the build hands them in: the
 * take pattern they are recorded on, what each answers, and the takes.
 */
export type LibraryPhone = {
  readonly pattern: TakePattern
  /** What every take here answers, for the pattern's `tap`. */
  readonly line: string
  /** The same object while nothing changed. */
  readonly getSnapshot: () => LibraryPhoneSnapshot
  readonly subscribe: (listener: () => void) => () => void
}

/**
 * One of the phone's takes of any kind (TAKES20): what home is told of it
 * and its audio, for those home doesn't list yet. Studio's takes with no
 * scene come through `LibraryPhone` instead, where they are recorded.
 */
export type PhoneTake = {
  readonly id: string
  readonly of: TakeOf
  readonly ref: string
  readonly fields?: Readonly<Record<string, string>> | undefined
  /** When it was recorded, ISO 8601. */
  readonly recordedAt: string
  /**
   * Home holds it, though its list doesn't show it (a home before TAKES20
   * lists Studio's alone): it plays from home.
   */
  readonly home?: boolean | undefined
  readonly audio: () => Promise<Blob | null>
}

/** The phone's takes of every kind, as the build reads them. */
export type LibraryOnPhone = {
  readonly subscribe: (listener: () => void) => () => void
  /** The same array while nothing changed. */
  readonly getSnapshot: () => ReadonlyArray<PhoneTake>
}

export type LibraryPorts = {
  readonly home: TakesHome
  readonly player: Player
  /** Absent in a build that records none here. */
  readonly phone?: LibraryPhone | undefined
  /** The phone's moves along the conveyor (CONVEYOR1); absent, none. */
  readonly stations?: LibraryStations | undefined
  /** What each take was said for, as the phone knows it (TAKES2); absent, its ref says. */
  readonly about?: LibraryAbout | undefined
  /** The phone's takes of every kind (TAKES20); absent, none but `phone`'s. */
  readonly onPhone?: LibraryOnPhone | undefined
  /** What the build can name that a ref only points at (TAKES20); absent, none. */
  readonly names?: TakeNames | undefined
  /** The shell's refresh port: a pull reads the takes again (HERD2); absent, none. */
  readonly refresh?: Refresh | undefined
}

/**
 * What the build knows each take was said for (TAKES2, #3068), from the
 * stores the phone keeps (a note on an episode names its spoken take; a
 * video names its scenes), said again on each change it tells of.
 */
export type LibraryAbout = {
  readonly subscribe: (listener: () => void) => () => void
  /** Changes whenever what `about` says may have. */
  readonly getSnapshot: () => unknown
  /**
   * What take `id` was said for; null when the phone knows nothing more
   * than its `ref` says (`aboutOfRef`). A take home doesn't have yet has
   * no ref.
   */
  readonly about: (id: string, ref: string | null) => TakeAbout | null
}

/**
 * Where each take stands on Studio's conveyor (CONVEYOR1): the build's own
 * words for it, from home's word and the phone's moves, said again on each
 * change it tells of.
 */
export type LibraryStations = {
  readonly subscribe: (listener: () => void) => () => void
  /** Changes whenever what `standing` says may have. */
  readonly getSnapshot: () => unknown
  /** What a take's row says of where it stands; null when it's on none. */
  readonly standing: (take: LibraryTake) => string | null
  /** Every station's name, in the order a take moves along them (TAKES3). */
  readonly names: ReadonlyArray<string>
  /**
   * The name of the station a take is at, and whether it is the shelf
   * (Canned); null when it's on none.
   */
  readonly station: (
    take: LibraryTake
  ) => { readonly name: string; readonly canned: boolean } | null
}

export type LibraryRuntime = {
  readonly getSnapshot: () => LibraryState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: LibraryIntent) => void
  /** The screen is showing: reads. Returns the detach, which stops playing. */
  readonly attach: () => () => void
}

export function createTakeLibrary(ports: LibraryPorts): LibraryRuntime {
  let state = INITIAL_LIBRARY
  let attached = false
  let playback: Playback | null = null
  const listeners = new Set<() => void>()

  const send = (event: LibraryEvent): void => {
    const next = stepLibrary(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  /** An answer, once it lands, while the screen still shows. */
  const later = <T>(
    answer: Promise<T>,
    event: (value: T) => LibraryEvent
  ): void => {
    void answer.then((value) => {
      if (attached) send(event(value))
    })
  }

  /** Tells the machine what the phone's own takes do, while attached. */
  function watchPhone(): ReadonlyArray<() => void> {
    const { phone } = ports
    if (phone === undefined) return []
    let held = reachedHome(new Set(), phone.getSnapshot().takes).held
    const busy = (): void => {
      const { take, playback } = phone.pattern.getSnapshot()
      send({
        type: "phone",
        sound:
          take.kind !== "idle"
            ? "recording"
            : playback.kind === "quiet"
              ? "quiet"
              : "playing",
      })
    }
    busy()
    return [
      phone.subscribe(() => {
        const reached = reachedHome(held, phone.getSnapshot().takes)
        held = reached.held
        if (reached.arrived) send({ type: "arrived" })
      }),
      phone.pattern.subscribe(busy),
    ]
  }

  function run(effect: LibraryEffect): void {
    switch (effect.type) {
      case "readTakes": {
        const { seq } = effect
        const wanted = (): boolean => attached && state.seq === seq
        later(ports.home.takes(effect.q, wanted, effect.after), (read) => ({
          type: "takesRead",
          seq,
          read,
        }))
        return
      }
      case "readAudio": {
        const { play } = effect
        // One sound at a time: the phone's own take stops for home's.
        ports.phone?.pattern.stopPlaying()
        // A take only on this phone plays from the phone (TAKES20).
        const own = ports.onPhone
          ?.getSnapshot()
          .find((take) => take.id === effect.id)
        const audio =
          own === undefined
            ? ports.home.audio(effect.id)
            : own.audio().catch(() => {
                // Ignored: audio the phone can't read back plays as none, which its row says (`unplayable`).
                return null
              })
        later(audio, (audio) => ({
          type: "audioRead",
          play,
          audio,
        }))
        return
      }
      case "startPlayback": {
        const { play } = effect
        const started = ports.player.play(effect.audio)
        playback = started
        later(started.ended, () => {
          if (playback === started) playback = null
          return { type: "playEnded", play }
        })
        return
      }
      case "stopPlayback": {
        playback?.stop()
        playback = null
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  }

  return {
    getSnapshot: () => state,
    subscribe,
    dispatch: (intent) => send(intent),
    attach(): () => void {
      attached = true
      const stops = [
        ...watchPhone(),
        ports.refresh?.({
          what: LIBRARY_WORDS.pullWhat,
          checkAgain: checkAgainOf({
            getSnapshot: () => state,
            subscribe,
            readAgain: () => send({ type: "readAgain" }),
          }),
        }) ?? ((): void => undefined),
      ]
      send({ type: "entered" })
      return (): void => {
        for (const stop of stops) stop()
        ports.phone?.pattern.leave()
        send({ type: "left" })
        attached = false
      }
    },
  }
}
