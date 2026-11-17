/**
 * The phone's link to the home server as one state: whether it is paired,
 * the one thing the person's side is doing (`activity`), and the drain's
 * one run (`drain`). `step` is pure; `./runtime` runs the ports and feeds
 * their results back as events.
 *
 * What runs at once, by structure:
 *
 * - **The person's side, one at a time:** pairing, unpairing, a sync, a
 *   tap's send and a screen's read (`keeping`) are arms of `activity`, and
 *   `step` refuses to start one while another runs.
 * - **The drain, one run at a time:** one lane's run (`./lanes`), so no two
 *   lanes' read-then-write of what this phone keeps (`./sent`) interleave.
 * - **A read or a sync beside a drain run:** each of its requests is answered
 *   on its own, and none changes what a lane is sending.
 * - **A send or an Unpair never beside one:** a tap's steps (Clear, Let it
 *   go, Delete) work on records a lane sends, and Unpair must not sign out
 *   under a run holding the old key. Either may be pressed while a drain
 *   runs: the runtime stops that run, which keeps what home took, and sends
 *   nothing until that run has ended (`writing`); no drain starts while one
 *   runs, and a tap's let-go on the phone of what home answered happens
 *   inside its run (`./delete-note`'s `settle`). Pairing happens unpaired,
 *   when nothing drains, or over a pairing home has forgotten (SIGNIN3),
 *   which writes as an Unpair does: the runtime stops the drain's run under
 *   the old key first, and none starts until the pairing has ended.
 *
 * A result for an operation that is no longer the current one is dropped.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeBlockedReason } from "@/lib/device-backend/native-http/no-answer"

import type { Away, AwayEvent } from "./away"
import { held, stepAway } from "./away"

/** Why the phone is not paired, said once beside the block. */
export type UnpairedNote =
  /** Unpaired, and home was told. */
  | "unpaired"
  /** Unpaired on the phone; home could not be reached to be told. */
  | "unpaired-offline"
  /** The pairing's record could not be read back (a restore, say). */
  | "lost"
  /** The record is there, but the phone could not read it just now. */
  | "unreadable"

export type PairFailure =
  | "unreachable"
  | "untrusted"
  /** This phone couldn't find home's name on this network (NA1). */
  | "no-name"
  /** Home is shedding load for a while (a 503 `service_overloaded`). */
  | "busy"
  | "bad-code"
  | "too-many"
  | "not-set-up"
  | "not-home"
  | "not-kept"
  | "other"

/**
 * Whether home still knows a paired phone (SIGNIN1, #3087): the phone's
 * sign-in. Pairing makes home's session for it, which home can end on its
 * own (sign out everywhere, a later sign-in pushing it out, its time
 * running out), so the record on the phone says only that it was paired.
 * Learned from home's own word: a credentialed answer, or the check
 * (`./standing`). Only a refusal of the key says forgotten; a silence says
 * nothing of it (`away`). Home also refuses every key while its sign-in is
 * off, and knows them again once it is back, so a success from a request
 * sent after the refusal says known again; an older one answering late
 * says nothing.
 */
type Standing =
  /** Home hasn't answered this pairing's key since the app started. */
  | { readonly kind: "unchecked" }
  /** Home answered this pairing's key. */
  | { readonly kind: "known" }
  /** Home refused this pairing's key, on a request sent at `at`. */
  | { readonly kind: "forgotten"; readonly at: number }

type Link =
  /** The phone's own record is being read: no request to home. */
  | { readonly kind: "reading" }
  | { readonly kind: "unpaired"; readonly note: UnpairedNote | null }
  | {
      readonly kind: "paired"
      readonly base: string
      /**
       * This pairing's own id, made when it was paired: what this phone's
       * record of what home holds is for (`./sent`), so a new pairing
       * starts from nothing.
       */
      readonly id: string
      /** The last Unpair could not forget the key on the phone. */
      readonly notForgotten: boolean
      /** When this phone paired, or null for a pairing kept before the day was. */
      readonly since: number | null
      readonly standing: Standing
    }

type Activity =
  | { readonly kind: "idle" }
  | { readonly kind: "pairing"; readonly base: string }
  | { readonly kind: "unpairing" }
  /** Reading published content from home, with no credential. */
  | { readonly kind: "syncing"; readonly stopping: boolean }
  /** Sending what this phone holds to the paired home, with its key. */
  | { readonly kind: "sending"; readonly stopping: boolean }
  /** A screen's read of home, with its key: Korean's look, My data, Ideas on home. */
  | { readonly kind: "keeping"; readonly stopping: boolean }

type Drain =
  | { readonly kind: "idle" }
  /** One lane's run (`lib/home-link/lanes`, LA15). */
  | { readonly kind: "draining"; readonly stopping: boolean }

export type HomeLinkState = {
  readonly link: Link
  readonly activity: Activity
  readonly drain: Drain
  /** The last pairing attempt's failure and its host, until the next attempt. */
  readonly pairFailure: {
    readonly failure: PairFailure
    readonly base: string
  } | null
  /** When home's busy ends (AD3, `./runtime`); null while it is not busy. */
  readonly homeBusyUntil: number | null
  /** The stretch away from home under way (AW1, `./away`); null at home. */
  readonly away: Away | null
  /**
   * How many times a hold away ended on its time or a stretch ended with home
   * answering (AW1): each is one ask of the lanes that found no answer
   * (`./kept-watch`). A network change, a pull or Send now ask themselves.
   */
  readonly awayReleases: number
  /**
   * The last request to home failed before home could answer, for `reason`
   * (NA1, #3099): this phone couldn't find home's name on this network, or
   * doesn't trust home's certificate. Held as a silence is (AW1, C476), but
   * said as itself, never as away; the next answer, a network change, a
   * silence or a new pairing clears it. Null otherwise.
   */
  readonly blocked: {
    readonly reason: HomeBlockedReason
    readonly at: number
  } | null
}

export type HomeLinkEvent =
  | {
      readonly type: "read"
      readonly found:
        | {
            readonly base: string
            readonly id: string
            readonly since: number | null
          }
        | "lost"
        | "unreadable"
        | null
    }
  | { readonly type: "pairPressed"; readonly base: string }
  | {
      readonly type: "paired"
      readonly base: string
      readonly id: string
      /** When the pairing was made, which is also when home last knew it. */
      readonly at: number
    }
  | { readonly type: "pairFailed"; readonly failure: PairFailure }
  | { readonly type: "unpairPressed" }
  | { readonly type: "unpaired"; readonly told: boolean }
  | { readonly type: "unpairFailed" }
  | { readonly type: "syncPressed" }
  | { readonly type: "sendPressed" }
  | { readonly type: "keepStarted" }
  | { readonly type: "stopPressed" }
  | { readonly type: "drainStarted" }
  /** Stop the drain's run: the background, or a send or an Unpair pressed. */
  | { readonly type: "drainStopped" }
  | { readonly type: "drainEnded" }
  /** The sync or send in flight ended, finished or stopped. */
  | { readonly type: "workEnded" }
  /** Home answered `429`, asking to be left alone until `until`. */
  | { readonly type: "homeBusy"; readonly until: number }
  /** The time home asked for has passed. */
  | { readonly type: "cooled" }
  /**
   * Home answered pairing `id`'s key (`known`) or refused it, on a request
   * sent at `at` (SIGNIN1): dropped for any other pairing, so a late answer
   * to an old one says nothing of the new, and during an Unpair, whose own
   * sign-out ends the key.
   */
  | {
      readonly type: "heard"
      readonly id: string
      readonly known: boolean
      readonly at: number
    }
  /** Away from home (AW1, `./away`): a request found no answer, or one did. */
  | AwayEvent
  /** A request failed for `reason` before home could answer (NA1). */
  | {
      readonly type: "blocked"
      readonly reason: HomeBlockedReason
      readonly at: number
    }
  /** Home answered a request, after one was blocked (NA1). */
  | { readonly type: "unblocked" }

export const INITIAL: HomeLinkState = {
  link: { kind: "reading" },
  activity: { kind: "idle" },
  drain: { kind: "idle" },
  pairFailure: null,
  homeBusyUntil: null,
  away: null,
  awayReleases: 0,
  blocked: null,
}

const idle = { kind: "idle" } as const
const UNCHECKED: Standing = { kind: "unchecked" }
const KNOWN: Standing = { kind: "known" }

/** A sync, a send or a read: the activities Stop ends. */
export function working(
  activity: Activity
): activity is Extract<Activity, { stopping: boolean }> {
  return (
    activity.kind === "syncing" ||
    activity.kind === "sending" ||
    activity.kind === "keeping"
  )
}

/**
 * Whether home is still to be left alone at `now` (AD3): a wait whose time
 * has passed is over, even before the link hears its timer.
 */
export function homeBusy(state: HomeLinkState, now: number): boolean {
  return state.homeBusyUntil !== null && now < state.homeBusyUntil
}

/** The person's activities no drain run goes beside. */
export function writing(activity: Activity): boolean {
  return (
    activity.kind === "sending" ||
    activity.kind === "unpairing" ||
    activity.kind === "pairing"
  )
}

/**
 * Whether Pair may start from `link` (SIGNIN3, #3089): unpaired, or over a
 * pairing home has forgotten, which the new one replaces without a sign-out
 * first. A pairing home knows signs out before another is made.
 */
export function mayPair(link: HomeLinkState["link"]): boolean {
  return (
    link.kind === "unpaired" ||
    (link.kind === "paired" && link.standing.kind === "forgotten")
  )
}

/** Whether the link would start a drain run. */
export function drainFree(state: HomeLinkState): boolean {
  return state.drain.kind === "idle" && !writing(state.activity)
}

/**
 * Whether the link holds what the phone starts on its own at `now`, away
 * from home (AW1): a hold whose time has passed is over.
 */
export function awayHeld(state: HomeLinkState, now: number): boolean {
  return held(state.away, now)
}

/** Whether the link would start a drain run at `now`, home not busy nor held away. */
export function linkOpen(state: HomeLinkState, now: number): boolean {
  return drainFree(state) && !homeBusy(state, now) && !awayHeld(state, now)
}

export function step(
  state: HomeLinkState,
  event: HomeLinkEvent
): HomeLinkState {
  const { link, activity } = state
  switch (event.type) {
    case "read": {
      if (link.kind !== "reading") return state
      const { found } = event
      return {
        ...state,
        link:
          found === null
            ? { kind: "unpaired", note: null }
            : typeof found === "string"
              ? { kind: "unpaired", note: found }
              : {
                  kind: "paired",
                  base: found.base,
                  id: found.id,
                  notForgotten: false,
                  since: found.since,
                  standing: UNCHECKED,
                },
      }
    }
    case "pairPressed": {
      if (!mayPair(link) || activity.kind !== "idle") return state
      return {
        ...state,
        activity: { kind: "pairing", base: event.base },
        pairFailure: null,
      }
    }
    case "paired": {
      if (activity.kind !== "pairing" || activity.base !== event.base)
        return state
      // Pairing again with another home (SIGNIN3): the old one's busy is
      // not this one's.
      const elsewhere = link.kind === "paired" && link.base !== event.base
      return {
        ...state,
        homeBusyUntil: elsewhere ? null : state.homeBusyUntil,
        blocked: null,
        link: {
          kind: "paired",
          base: event.base,
          id: event.id,
          notForgotten: false,
          since: event.at,
          standing: KNOWN,
        },
        activity: idle,
        pairFailure: null,
      }
    }
    case "pairFailed": {
      if (activity.kind !== "pairing") return state
      return {
        ...state,
        activity: idle,
        pairFailure: { failure: event.failure, base: activity.base },
      }
    }
    case "unpairPressed": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "unpairing" } }
    }
    case "unpaired": {
      if (activity.kind !== "unpairing") return state
      return {
        ...state,
        link: {
          kind: "unpaired",
          note: event.told ? "unpaired" : "unpaired-offline",
        },
        activity: idle,
        pairFailure: null,
        away: null,
        blocked: null,
      }
    }
    case "unpairFailed": {
      if (activity.kind !== "unpairing" || link.kind !== "paired") return state
      return { ...state, link: { ...link, notForgotten: true }, activity: idle }
    }
    case "syncPressed": {
      if (link.kind === "reading" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "syncing", stopping: false } }
    }
    case "sendPressed": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "sending", stopping: false } }
    }
    case "keepStarted": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "keeping", stopping: false } }
    }
    case "stopPressed": {
      if (!working(activity)) return state
      return { ...state, activity: { kind: activity.kind, stopping: true } }
    }
    case "workEnded": {
      if (!working(activity)) return state
      return { ...state, activity: idle }
    }
    case "drainStarted": {
      if (link.kind !== "paired" || !drainFree(state)) return state
      return { ...state, drain: { kind: "draining", stopping: false } }
    }
    case "drainStopped": {
      if (state.drain.kind !== "draining") return state
      return { ...state, drain: { kind: "draining", stopping: true } }
    }
    case "drainEnded": {
      if (state.drain.kind !== "draining") return state
      return { ...state, drain: idle }
    }
    case "homeBusy": {
      const until = Math.max(state.homeBusyUntil ?? event.until, event.until)
      if (until === state.homeBusyUntil) return state
      return { ...state, homeBusyUntil: until }
    }
    case "cooled": {
      if (state.homeBusyUntil === null) return state
      return { ...state, homeBusyUntil: null }
    }
    case "heard": {
      if (link.kind !== "paired" || link.id !== event.id) return state
      // A key being let go: the sign-out's answer says what comes next. A
      // pairing again still hears it, so one that fails leaves the old
      // pairing as home last said it was.
      if (activity.kind === "unpairing") return state
      const { standing } = link
      if (event.known) {
        if (standing.kind === "known") return state
        if (standing.kind === "forgotten" && event.at <= standing.at) {
          return state
        }
        return { ...state, link: { ...link, standing: KNOWN } }
      }
      if (standing.kind === "forgotten") return state
      return {
        ...state,
        link: { ...link, standing: { kind: "forgotten", at: event.at } },
      }
    }
    case "unanswered":
    case "answered":
    case "lapsed":
    case "lookAgain": {
      // The latest failure is home's silence, or the network changed: what
      // blocked a request before is not what is said now (NA1).
      const blocked =
        event.type === "unanswered" ||
        (event.type === "lookAgain" && event.fresh)
          ? null
          : state.blocked
      const away = stepAway(state.away, event)
      if (away === state.away && blocked === state.blocked) return state
      // A hold ending on its time, or home answering: a release (AW1).
      const released =
        away !== state.away &&
        (event.type === "lapsed" || event.type === "answered")
      return {
        ...state,
        away,
        awayReleases: state.awayReleases + (released ? 1 : 0),
        blocked,
      }
    }
    case "blocked": {
      if (link.kind !== "paired") return state
      const { reason, at } = event
      if (state.blocked?.reason === reason) return state
      return { ...state, blocked: { reason, at } }
    }
    case "unblocked": {
      if (state.blocked === null) return state
      return { ...state, blocked: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
