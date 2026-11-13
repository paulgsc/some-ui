/**
 * The game day's live feed (GWB4, #2078): the recorder's `FeedPort`, over
 * the live socket to the paired home (`./live-socket`). This is the runtime:
 * it owns the socket, the timers and the pairing read, numbers each event
 * with the opening it was made under, and runs what `./live-machine`'s pure
 * `step` decides; `./live-model` holds the arithmetic.
 *
 * LA21 (docs/learner-data-authority.md): open only while Game day watches it,
 * in front and paired; this runtime opens, sends and arms timers only as
 * `step`'s effects say.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { assertNever, openRecord, writeRecord } from "@some-ui/core-utils"
import type {
  Feed,
  FeedChoice,
  FeedPort,
  Game,
  HomeMessage,
} from "@some-ui/game-week"
import { onPageVisibility } from "@some-ui/voice-capture"

import { browserLocalStorage } from "@/lib/tenant/storage"

import { homeLink, pairingOf } from "./index"
import type { LiveEffect, LiveEvent, LiveTimer } from "./live-machine"
import { feedOf, initialLive, step } from "./live-machine"
import { parseWeek } from "./live-model"
import { livePairing } from "./live-pairing"
import type { LiveSocket, LiveSocketEvents } from "./live-socket"
import { openLiveSocket } from "./live-socket"
import { awayHeld } from "./model"

export { OPEN_MS, PING_MS, QUIET_MS } from "./live-machine"

const WEEK_KEY = "some-ui:game-week.week"
const WEEK_QUARANTINE = "some-ui:game-week.week.unreadable."

/** The messages, as the recorder reads and writes them (`@some-ui/game-week`). */
export type LiveWire = {
  read: (text: string) => HomeMessage
  hello: (
    choice: FeedChoice,
    lastSeq: number | null,
    utcOffsetMinutes: number
  ) => string
  ping: (phoneAt: number) => string
}

export type LivePorts = {
  wire: LiveWire
  /** The paired home's API base and token, or null when unpaired. */
  pairing: () => Promise<{ base: string; token: string } | null>
  /** Calls `listener` when the pairing, or the hold away from home, may have changed. */
  onLink: (listener: () => void) => () => void
  /** Whether the home link holds the phone away from home now (AW1). */
  held: () => boolean
  /** Tells the home link home answered the socket (AW1). */
  reached: () => void
  /** The id of the pairing this phone holds now, or null. */
  pairingId: () => string | null
  open: (url: string, token: string, on: LiveSocketEvents) => LiveSocket
  /** Milliseconds since the epoch. */
  now: () => number
  /** Minutes east of UTC, where the phone is now. */
  utcOffsetMinutes: () => number
  after: (ms: number, run: () => void) => () => void
  /** Calls `listener` at once with whether the page is hidden, then on each change. */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Where the week's games are kept between visits; null keeps them for the page. */
  storage: KeyedStorage | null
}

export function liveFeed(ports: LivePorts): FeedPort {
  const listeners = new Set<(feed: Feed) => void>()
  let state = initialLive(readWeek(ports.storage))
  let socket: LiveSocket | null = null
  const timers = new Map<LiveTimer, () => void>()
  let unwatchPage: (() => void) | null = null
  let unwatchLink: (() => void) | null = null

  function dispatch(event: LiveEvent): void {
    const before = feedOf(state)
    const next = step(state, event)
    state = next.state
    for (const effect of next.effects) run(effect)
    const after = feedOf(state)
    if (
      before.games !== after.games ||
      before.offer !== after.offer ||
      before.link !== after.link ||
      before.offsetMs !== after.offsetMs
    ) {
      for (const listener of listeners) listener(after)
    }
  }

  function run(effect: LiveEffect): void {
    switch (effect.kind) {
      case "read-pairing": {
        const { at } = effect
        dispatch({ kind: "pairing-read", at, pairingId: ports.pairingId() })
        void ports.pairing().then(
          (pairing) => dispatch({ kind: "paired", at, pairing }),
          () => dispatch({ kind: "pairing-failed", at })
        )
        return
      }
      case "open": {
        const { at } = effect
        try {
          socket = ports.open(effect.url, effect.token, {
            opened: () => dispatch({ kind: "opened", at }),
            message: (text) =>
              dispatch({
                kind: "heard",
                at,
                message: ports.wire.read(text),
                now: ports.now(),
              }),
            closed: (code) => dispatch({ kind: "closed", at, code }),
          })
        } catch {
          dispatch({ kind: "open-refused", at })
        }
        return
      }
      case "close": {
        socket?.close()
        socket = null
        return
      }
      case "hello": {
        socket?.send(
          ports.wire.hello(
            effect.choice,
            effect.lastSeq,
            ports.utcOffsetMinutes()
          )
        )
        return
      }
      case "ping": {
        socket?.send(ports.wire.ping(ports.now()))
        return
      }
      case "arm": {
        const { timer, at } = effect
        timers.get(timer)?.()
        timers.set(
          timer,
          ports.after(effect.ms, () => {
            timers.delete(timer)
            dispatch({ kind: "due", at, timer })
          })
        )
        return
      }
      case "disarm": {
        for (const cancel of timers.values()) cancel()
        timers.clear()
        return
      }
      case "keep-week": {
        keepWeek(ports.storage, effect.games)
        return
      }
      case "reached": {
        ports.reached()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  function start(): void {
    // Visibility first, so a page opened in the background opens nothing.
    unwatchLink = ports.onLink(() => {
      dispatch({ kind: "relinked", pairingId: ports.pairingId() })
      dispatch({ kind: "home", held: ports.held() })
    })
    dispatch({ kind: "home", held: ports.held() })
    unwatchPage = ports.onVisibility((hidden) =>
      dispatch({ kind: "visibility", hidden })
    )
    dispatch({ kind: "watch" })
  }

  function stop(): void {
    unwatchPage?.()
    unwatchLink?.()
    unwatchPage = unwatchLink = null
    dispatch({ kind: "unwatch" })
  }

  return {
    watch(listener): () => void {
      listeners.add(listener)
      if (listeners.size === 1) start()
      listener(feedOf(state))
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    choose(choice): void {
      dispatch({ kind: "choose", choice })
    },
  }
}

function readWeek(storage: KeyedStorage | null): ReadonlyArray<Game> {
  if (storage === null) return []
  const opened = openRecord(storage, WEEK_KEY, parseWeek, WEEK_QUARANTINE)
  return opened.kind === "kept" ? opened.value : []
}

function keepWeek(
  storage: KeyedStorage | null,
  games: ReadonlyArray<Game>
): void {
  if (storage !== null)
    writeRecord(storage, WEEK_KEY, JSON.stringify(games), parseWeek)
}

/**
 * The recorder's feed on this phone: the paired home's live socket, reading
 * and writing the messages with `wire` (the recorder's own, which the Game
 * day route hands in: `@some-ui/game-week` is the phone's alone).
 */
export function gameDayFeed(wire: LiveWire): FeedPort {
  const link = homeLink()
  return liveFeed({
    wire,
    pairing: livePairing,
    onLink: link.subscribe,
    held: () => awayHeld(link.getSnapshot(), Date.now()),
    reached: () => link.answered(),
    pairingId: () => pairingOf(),
    open: openLiveSocket,
    now: () => Date.now(),
    utcOffsetMinutes: () => -new Date().getTimezoneOffset(),
    after: (ms, run): (() => void) => {
      const timer = setTimeout(run, ms)
      return () => clearTimeout(timer)
    },
    onVisibility: onPageVisibility,
    storage: browserLocalStorage,
  })
}
