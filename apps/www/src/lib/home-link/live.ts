/**
 * The game day's live feed (GWB4, #2078): the recorder's `FeedPort`, over
 * the live socket to the paired home (`./live-socket`). It owns the socket,
 * the timers and what home last said, and decides which of home's answers
 * is stale; `./live-model` holds the messages and the arithmetic.
 *
 * LA16 (docs/learner-data-authority.md), as this module holds it:
 *
 * - **Open only while the Game day screen watches it, the phone is paired
 *   and the app is in front.** The socket opens when the recorder starts
 *   watching, closes when it stops or the app goes to the background, and
 *   opens again when the app comes back or the pairing changes.
 * - **Push and pull.** On opening, the phone says what it is on (`hello`:
 *   the last offer it saw, the mode, the game, the watching flags) and home
 *   answers with what it has now; a change of choice says it again. Every
 *   15 s a `ping` carries the phone's clock, and home's answer gives the
 *   offset each bite keeps (GW5).
 * - **No stale offer shows as live.** The offer is dropped the moment the
 *   socket closes or goes quiet, and an answer numbered no later than the
 *   last one is ignored.
 * - **Away, it says so and tries again**, waiting 1 s doubling to 30 s; it
 *   stops trying when home says this build cannot read it (`update`) or the
 *   phone is not paired (`unpaired`), until the pairing changes. The week's
 *   games stay (kept on the phone), so a bite can still be said first.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { assertNever, openRecord, writeRecord } from "@some-ui/core-utils"
import type {
  Feed,
  FeedChoice,
  FeedLink,
  FeedPort,
  Game,
  HomeMessage,
} from "@some-ui/game-week"
import { onPageVisibility } from "@some-ui/voice-capture"

import { browserLocalStorage } from "@/lib/tenant/storage"

import { homeLink, pairingOf } from "./index"
import {
  clockSample,
  linkAfterClose,
  liveUrl,
  parseWeek,
  retryDelayMs,
  triesAgain,
} from "./live-model"
import { livePairing } from "./live-pairing"
import type { LiveSocket, LiveSocketEvents } from "./live-socket"
import { openLiveSocket } from "./live-socket"

/** How often the phone checks the clocks, which also keeps the socket warm. */
export const PING_MS = 15_000

/** Nothing from home for this long: the socket is gone, whatever it says. */
export const QUIET_MS = 40_000

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
  /** Calls `listener` when the pairing may have changed. */
  onLink: (listener: () => void) => () => void
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
  let games: ReadonlyArray<Game> = readWeek(ports.storage)
  let offer: Feed["offer"] = null
  let link: FeedLink = "asking"
  let offsetMs: number | null = null
  let bestRoundTrip: number | null = null
  let lastSeq: number | null = null
  let choice: FeedChoice | null = null
  let socket: LiveSocket | null = null
  // Each opening's number: what a late answer from an earlier one is told by.
  let opening = 0
  let attempt = 0
  let hidden = false
  let pairedAs: string | null = null
  let retry: (() => void) | null = null
  let ping: (() => void) | null = null
  let quiet: (() => void) | null = null
  let unwatchPage: (() => void) | null = null
  let unwatchLink: (() => void) | null = null

  const snapshot = (): Feed => ({ games, offer, link, offsetMs })
  const emit = (): void => {
    const feed = snapshot()
    for (const listener of listeners) listener(feed)
  }

  function stopTimers(): void {
    retry?.()
    ping?.()
    quiet?.()
    retry = ping = quiet = null
  }

  /** Ends the socket and what it showed; says `next` once nothing is live. */
  function end(next: FeedLink): void {
    opening += 1
    socket?.close()
    socket = null
    stopTimers()
    offer = null
    bestRoundTrip = null
    link = next
    emit()
  }

  function armQuiet(at: number): void {
    quiet?.()
    quiet = ports.after(QUIET_MS, () => {
      if (at === opening) closed(at, 1006)
    })
  }

  function sendPing(at: number): void {
    if (at !== opening) return
    socket?.send(ports.wire.ping(ports.now()))
    ping = ports.after(PING_MS, () => sendPing(at))
  }

  function sayHello(): void {
    if (choice !== null)
      socket?.send(ports.wire.hello(choice, lastSeq, ports.utcOffsetMinutes()))
  }

  function closed(at: number, code: number): void {
    if (at !== opening) return
    const next = linkAfterClose(code)
    end(next)
    if (triesAgain(next) && !hidden && listeners.size > 0) {
      retry = ports.after(retryDelayMs(attempt), () => {
        retry = null
        connect()
      })
      attempt += 1
    }
  }

  function heard(at: number, text: string): void {
    if (at !== opening) return
    armQuiet(at)
    const message = ports.wire.read(text)
    switch (message.kind) {
      case "offer": {
        if (lastSeq !== null && message.seq <= lastSeq) return
        lastSeq = message.seq
        games = message.games
        keepWeek(ports.storage, games)
        offer = message.following ? message.offer : null
        link = message.following ? "live" : "not-following"
        attempt = 0
        emit()
        return
      }
      case "pong": {
        const sample = clockSample(message.phoneAt, message.homeAt, ports.now())
        if (sample === null) return
        if (bestRoundTrip === null || sample.roundTripMs <= bestRoundTrip) {
          bestRoundTrip = sample.roundTripMs
          offsetMs = sample.offsetMs
          emit()
        }
        return
      }
      case "version": {
        end("update")
        return
      }
      case "unreadable": {
        // One frame this build does not read changes nothing shown.
        return
      }
      default: {
        assertNever(message)
      }
    }
  }

  function connect(): void {
    if (socket !== null || hidden || listeners.size === 0) return
    opening += 1
    const at = opening
    pairedAs = ports.pairingId()
    void ports.pairing().then(
      (pairing) => {
        if (at !== opening || socket !== null) return
        const url = pairing === null ? null : liveUrl(pairing.base)
        if (pairing === null || url === null) {
          end("unpaired")
          return
        }
        try {
          socket = ports.open(url, pairing.token, {
            opened: () => {
              if (at !== opening) return
              armQuiet(at)
              sayHello()
              sendPing(at)
            },
            message: (text) => heard(at, text),
            closed: (code) => closed(at, code),
          })
        } catch {
          end("unpaired")
        }
      },
      () => {
        if (at === opening) closed(at, 1006)
      }
    )
  }

  function start(): void {
    unwatchLink = ports.onLink(() => {
      const now = ports.pairingId()
      if (now === pairedAs) return
      attempt = 0
      lastSeq = null
      end("asking")
      connect()
    })
    unwatchPage = ports.onVisibility((isHidden) => {
      hidden = isHidden
      if (isHidden) {
        end("asking")
      } else {
        connect()
      }
    })
  }

  function stop(): void {
    unwatchPage?.()
    unwatchLink?.()
    unwatchPage = unwatchLink = null
    end("asking")
  }

  return {
    watch(listener): () => void {
      listeners.add(listener)
      if (listeners.size === 1) start()
      listener(snapshot())
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    choose(next): void {
      choice = next
      sayHello()
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
