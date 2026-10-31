/**
 * The game day's live socket as a state machine (GWB4, #2078; LA21 in
 * docs/learner-data-authority.md): the state union and the pure `step`.
 * `./live` is the runtime that owns the socket, the timers and the pairing
 * read, and runs the effects `step` returns; `./live-model` holds the
 * arithmetic. Nothing here touches a handle or a clock: a clock reading
 * arrives in the event that needs it.
 *
 * An opening is numbered (`opening`), and every event from a socket, a timer
 * or the pairing read carries the number it was made under: one from an
 * earlier opening is stale and changes nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  Feed,
  FeedChoice,
  FeedLink,
  Game,
  HomeMessage,
} from "@some-ui/game-week"

import {
  clockSample,
  linkAfterClose,
  liveUrl,
  retryDelayMs,
  triesAgain,
  UNREADABLE,
} from "./live-model"

/** How often the phone checks the clocks, which also keeps the socket warm. */
export const PING_MS = 15_000

/** Nothing from home for this long: the socket is gone, whatever it says. */
export const QUIET_MS = 40_000

/**
 * Where the socket is: `idle` with none, `pairing` while the pairing is read,
 * `connecting` once a socket is made, `open` once home accepted it.
 */
export type LivePhase = "idle" | "pairing" | "connecting" | "open"

export type LiveState = {
  readonly phase: LivePhase
  /** This opening's number; an event made under another is stale. */
  readonly opening: number
  readonly link: FeedLink
  /** The week's games: the last home sent, kept while away. */
  readonly games: ReadonlyArray<Game>
  readonly offer: Feed["offer"]
  readonly offsetMs: number | null
  /** The shortest round trip this opening; a longer one moves no offset. */
  readonly bestRoundTrip: number | null
  /** The newest offer's number seen from this pairing. */
  readonly lastSeq: number | null
  /** Whether this opening's last hello told home a `lastSeq`. */
  readonly saidSeq: boolean
  readonly choice: FeedChoice | null
  /** Whether the recorder watches the feed. */
  readonly watched: boolean
  /** Whether the app is in the background. */
  readonly hidden: boolean
  /** Tries since home last answered, for the wait before the next. */
  readonly attempt: number
  /** The pairing the current opening was made under. */
  readonly pairedAs: string | null
}

export type LiveTimer = "quiet" | "ping" | "retry"

export type LiveEvent =
  | { readonly kind: "watch" }
  | { readonly kind: "unwatch" }
  | { readonly kind: "visibility"; readonly hidden: boolean }
  | { readonly kind: "relinked"; readonly pairingId: string | null }
  | { readonly kind: "choose"; readonly choice: FeedChoice }
  | {
      readonly kind: "pairing-read"
      readonly at: number
      readonly pairingId: string | null
    }
  | {
      readonly kind: "paired"
      readonly at: number
      readonly pairing: { readonly base: string; readonly token: string } | null
    }
  | { readonly kind: "pairing-failed"; readonly at: number }
  | { readonly kind: "open-refused"; readonly at: number }
  | { readonly kind: "opened"; readonly at: number }
  | {
      readonly kind: "heard"
      readonly at: number
      readonly message: HomeMessage
      /** The phone's clock when it arrived. */
      readonly now: number
    }
  | { readonly kind: "closed"; readonly at: number; readonly code: number }
  | { readonly kind: "due"; readonly at: number; readonly timer: LiveTimer }

export type LiveEffect =
  /** Read the pairing, then say `pairing-read` and `paired` under `at`. */
  | { readonly kind: "read-pairing"; readonly at: number }
  | {
      readonly kind: "open"
      readonly at: number
      readonly url: string
      readonly token: string
    }
  | { readonly kind: "close" }
  | {
      readonly kind: "hello"
      readonly choice: FeedChoice
      readonly lastSeq: number | null
    }
  | { readonly kind: "ping" }
  | {
      readonly kind: "arm"
      readonly timer: LiveTimer
      readonly ms: number
      readonly at: number
    }
  | { readonly kind: "disarm" }
  | { readonly kind: "keep-week"; readonly games: ReadonlyArray<Game> }

export type LiveStep = {
  readonly state: LiveState
  readonly effects: ReadonlyArray<LiveEffect>
}

export function initialLive(games: ReadonlyArray<Game>): LiveState {
  return {
    phase: "idle",
    opening: 0,
    link: "asking",
    games,
    offer: null,
    offsetMs: null,
    bestRoundTrip: null,
    lastSeq: null,
    saidSeq: false,
    choice: null,
    watched: false,
    hidden: false,
    attempt: 0,
    pairedAs: null,
  }
}

/** What the recorder sees of `state`. */
export function feedOf(state: LiveState): Feed {
  return {
    games: state.games,
    offer: state.offer,
    link: state.link,
    offsetMs: state.offsetMs,
  }
}

const done = (
  state: LiveState,
  effects: ReadonlyArray<LiveEffect> = []
): LiveStep => ({ state, effects })

/** Ends the socket and what it showed, leaving the phone at `next`. */
function end(state: LiveState, next: FeedLink): LiveStep {
  const closing =
    state.phase === "connecting" || state.phase === "open"
      ? [{ kind: "close" } as const]
      : []
  return done(
    {
      ...state,
      phase: "idle",
      opening: state.opening + 1,
      offer: null,
      bestRoundTrip: null,
      saidSeq: false,
      link: next,
    },
    [...closing, { kind: "disarm" }]
  )
}

/** Opens a socket, if the recorder watches in front and none is open. */
function connect(previous: LiveStep): LiveStep {
  const { state } = previous
  if (state.phase !== "idle" || state.hidden || !state.watched) return previous
  const at = state.opening + 1
  return done({ ...state, phase: "pairing", opening: at }, [
    ...previous.effects,
    { kind: "read-pairing", at },
  ])
}

function hello(state: LiveState): LiveStep {
  if (state.phase !== "open" || state.choice === null) return done(state)
  return done({ ...state, saidSeq: state.lastSeq !== null }, [
    { kind: "hello", choice: state.choice, lastSeq: state.lastSeq },
  ])
}

/** The socket is gone with `code`: say where that leaves the phone. */
function closed(state: LiveState, code: number): LiveStep {
  // Home could not have sent the `lastSeq` this phone told it (the phone
  // kept one across a home whose clock or counter moved): forget it and say
  // hello again without one, at once.
  if (code === UNREADABLE && state.saidSeq) {
    return connect(end({ ...state, lastSeq: null }, "asking"))
  }
  const next = linkAfterClose(code)
  const ended = end(state, next)
  if (!triesAgain(next) || state.hidden || !state.watched) return ended
  return done({ ...ended.state, attempt: state.attempt + 1 }, [
    ...ended.effects,
    {
      kind: "arm",
      timer: "retry",
      ms: retryDelayMs(state.attempt),
      at: ended.state.opening,
    },
  ])
}

function heard(state: LiveState, message: HomeMessage, now: number): LiveStep {
  const quiet: LiveEffect = {
    kind: "arm",
    timer: "quiet",
    ms: QUIET_MS,
    at: state.opening,
  }
  switch (message.kind) {
    case "offer": {
      if (state.lastSeq !== null && message.seq <= state.lastSeq)
        return done(state, [quiet])
      return done(
        {
          ...state,
          lastSeq: message.seq,
          games: message.games,
          offer: message.following ? message.offer : null,
          link: message.following ? "live" : "not-following",
          attempt: 0,
        },
        [quiet, { kind: "keep-week", games: message.games }]
      )
    }
    case "pong": {
      const sample = clockSample(message.phoneAt, message.homeAt, now)
      if (
        sample === null ||
        (state.bestRoundTrip !== null &&
          sample.roundTripMs > state.bestRoundTrip)
      )
        return done(state, [quiet])
      return done(
        {
          ...state,
          bestRoundTrip: sample.roundTripMs,
          offsetMs: sample.offsetMs,
        },
        [quiet]
      )
    }
    case "version": {
      return end(state, "update")
    }
    case "unreadable": {
      // One frame this build does not read changes nothing shown.
      return done(state, [quiet])
    }
    default: {
      return assertNever(message)
    }
  }
}

/** Whether `event` was made under an opening other than the current one. */
function stale(state: LiveState, event: LiveEvent): boolean {
  return "at" in event && event.at !== state.opening
}

export function step(state: LiveState, event: LiveEvent): LiveStep {
  if (stale(state, event)) return done(state)
  switch (event.kind) {
    case "watch": {
      return connect(done({ ...state, watched: true }))
    }
    case "unwatch": {
      return end({ ...state, watched: false }, "asking")
    }
    case "visibility": {
      return event.hidden
        ? end({ ...state, hidden: true }, "asking")
        : connect(done({ ...state, hidden: false }))
    }
    case "relinked": {
      if (event.pairingId === state.pairedAs) return done(state)
      return connect(end({ ...state, attempt: 0, lastSeq: null }, "asking"))
    }
    case "choose": {
      return hello({ ...state, choice: event.choice })
    }
    case "pairing-read": {
      return done({ ...state, pairedAs: event.pairingId })
    }
    case "paired": {
      if (state.phase !== "pairing") return done(state)
      const url = event.pairing === null ? null : liveUrl(event.pairing.base)
      if (event.pairing === null || url === null) return end(state, "unpaired")
      return done({ ...state, phase: "connecting" }, [
        { kind: "open", at: event.at, url, token: event.pairing.token },
      ])
    }
    case "pairing-failed": {
      return closed(state, 1006)
    }
    case "open-refused": {
      return end(state, "unpaired")
    }
    case "opened": {
      if (state.phase !== "connecting") return done(state)
      const said = hello({ ...state, phase: "open" })
      return done(said.state, [
        { kind: "arm", timer: "quiet", ms: QUIET_MS, at: event.at },
        ...said.effects,
        { kind: "ping" },
        { kind: "arm", timer: "ping", ms: PING_MS, at: event.at },
      ])
    }
    case "heard": {
      return heard(state, event.message, event.now)
    }
    case "closed": {
      return closed(state, event.code)
    }
    case "due": {
      switch (event.timer) {
        case "quiet": {
          return closed(state, 1006)
        }
        case "ping": {
          return state.phase === "open"
            ? done(state, [
                { kind: "ping" },
                { kind: "arm", timer: "ping", ms: PING_MS, at: event.at },
              ])
            : done(state)
        }
        case "retry": {
          return connect(done(state))
        }
        default: {
          return assertNever(event.timer)
        }
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
