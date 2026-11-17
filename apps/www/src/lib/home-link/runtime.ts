/**
 * The runtime behind `./model`: it owns the credential port, the transport,
 * the person's one operation and the drain's one run (what goes beside
 * what is `./model`'s), and the pace every request takes a turn on
 * (`./pace`), and decides which result is stale. The
 * Home server block reads its snapshot and calls these methods; it holds no
 * request of its own.
 *
 * LA8 (docs/learner-data-authority.md), as this module holds it:
 *
 * - **Nothing is sent but by a method a tap called,** or by `drain`, which
 *   only `lib/home-link/lanes` calls, for the drain of what this phone keeps
 *   (LA15), or `keep`, which `lib/home-link/routine` calls for Korean's
 *   look at the routine's files, and `lib/home-link/heard`, which reads
 *   home's words for an idea answer's take while the idea screen shows it
 *   (MIC10), or `look`, which `lib/home-link/compat-read` calls for whether
 *   home serves this build (`./serves`, #2843), or `check`, which
 *   `./standing`'s watch calls for whether home still knows this phone
 *   (SIGNIN1). Creating the runtime and `load` read only the phone's own
 *   record; the one read on a timer is that last one, bounded by its screen.
 * - **No retry.** A failed request is said once and left; the next tap, or
 *   the drain's next ask (LA15), is the next try.
 * - **Home's busy is kept** (AD3): the first `429` a sync or send hears,
 *   or home's overload (`503 service_overloaded` with a `Retry-After`,
 *   `overloaded`, HERD2),
 *   leaves nothing more to send until home's `Retry-After` has passed
 *   (`homeBusyFor`); until then the link answers every request of every run
 *   busy itself, as home last did, so each says so in its own words and
 *   sends nothing. The end of the wait is an event (`cooled`) the drain's
 *   watches hear and ask once on (`./kept-watch`).
 * - **Stop ends a sync, a send or a keep, and the background those and a
 *   drain run,** after the request in flight: the `get` or `send` it is handed refuses to send once
 *   stopped. A run is over only once every request it started has settled.
 * - **Unpair forgets the credential on the phone** whether or not home was
 *   told, and says which; a phone that could not forget it stays paired and
 *   says so.
 * - **The credential goes only to the paired base, over https,** never on a
 *   sync read (`native-http` refuses a credentialed `http:` request): a
 *   send's `send` takes a path, and the base is the one stored with the
 *   token.
 *
 * AW1 (`./away`): a stretch away is told to `report` once; while its hold
 * lasts, a drain, `keep`'s `onItsOwn` and `look` send nothing
 * (`HomeAwayError`); sync, send, `keep`, pairing and Unpair still go;
 * `onNetwork` and `lookAgain` end the hold.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"

import { stringFieldOf } from "@/lib/device-backend/common"
import type { HomeGet } from "@/lib/device-backend/home-sync"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { HomeBlockedReason } from "@/lib/device-backend/native-http/no-answer"
import {
  blockedReason,
  HomeAwayError,
  HomeBlockedError,
  phoneOnline,
} from "@/lib/device-backend/native-http/no-answer"

import type { HomeAddress } from "./address"
import type {
  HomeLinkEvent,
  HomeLinkState,
  Pairing as LinkPairing,
  PairFailure,
  Refusal,
  Run,
  RunStart,
} from "./model"
import {
  awayHeld,
  homeBusy,
  INITIAL,
  pairingIn,
  refusalOf,
  releasedBy,
  step,
  working,
  writing,
} from "./model"
import type { PaceMemory } from "./pace"
import { createPace } from "./pace"
import type { PairingRecord } from "./settle"
import { blockedOf, parsePairing, settleRead, unanswered } from "./settle"

/** The phone's sealed record (`HomeCredentialPlugin`): read, kept, forgotten. */
export type CredentialPort = {
  read: () => Promise<{ record: string | null; lost: boolean }>
  write: (record: string) => Promise<void>
  clear: () => Promise<void>
}

export type HomeLinkPorts = {
  credential: CredentialPort
  request: (call: HomeRequest) => Promise<HomeAnswer>
  /**
   * Calls `listener` when the app goes to the background, and at once if it
   * already is; returns an unsubscribe.
   */
  onHidden: (listener: () => void) => () => void
  now: () => number
  /** Runs `run` once, `ms` from now; returns the cancel. */
  after: (ms: number, run: () => void) => () => void
  /** Where a stretch away from home is told, once as it starts (AW1). */
  report?: (failure: ForeignFailure) => void
  /**
   * Calls `listener` when the phone's network comes back or changes;
   * returns an unsubscribe. Held for the page's life.
   */
  onNetwork?: (listener: () => void) => () => void
  /** Where the pace is kept between page loads (HERD1, `./pace`). */
  paceMemory?: PaceMemory | null
}

/** How long home's busy lasts when its `Retry-After` can't be read. */
const HOME_BUSY_MS = 60_000
/** The shortest and longest wait a `Retry-After` is held to. */
const HOME_BUSY_MIN_MS = 1_000
const HOME_BUSY_MAX_MS = 600_000

/**
 * How long to leave home alone after its `429`: its `Retry-After` in whole
 * seconds, held between 1 s and 10 minutes, or a minute when it sent none
 * this phone can read (a date, say).
 */
export function homeBusyFor(retryAfter: string | undefined): number {
  const ms = retryAfterMs(retryAfter)
  if (ms === null) return HOME_BUSY_MS
  return Math.min(Math.max(ms, HOME_BUSY_MIN_MS), HOME_BUSY_MAX_MS)
}

/** Home's `Retry-After` in ms, when it sent whole seconds; null otherwise. */
function retryAfterMs(retryAfter: string | undefined): number | null {
  const text = retryAfter?.trim() ?? ""
  return /^\d+$/.test(text) ? Number(text) * 1_000 : null
}

/** Home's error code in an answer's body, or null. */
function errorCodeOf(answer: HomeAnswer): string | null {
  try {
    const parsed: unknown = JSON.parse(answer.body)
    const code =
      isRecord(parsed) && isRecord(parsed.error) ? parsed.error.code : null
    return typeof code === "string" ? code : null
  } catch {
    return null
  }
}

/**
 * Home said it has no room just now (paulgsc/server#934, AD4): `503` with
 * its code `service_overloaded` and a `Retry-After` this phone can read. Busy,
 * as a `429` is (HERD2). A `503` with that code and no `Retry-After` is one
 * of home's caps (a day's new accounts, pairing), which waiting out a
 * moment does not end, so it is not busy.
 */
function overloaded(answer: HomeAnswer): boolean {
  return (
    answer.status === 503 &&
    retryAfterMs(answer.retryAfter) !== null &&
    errorCodeOf(answer) === "service_overloaded"
  )
}

/** What the link answers for home while home's busy lasts: nothing was sent. */
const HOME_BUSY: HomeAnswer = { status: 429, body: "" }

/**
 * What a pairing answer other than 200 says. A 503 is read by its code
 * (#3099): `service_overloaded` with a `Retry-After` is home shedding load
 * for a while; without one, it is home's cap on pairing attempts, which no
 * wait lifts soon; anything else is pairing not set up there.
 */
function pairRefusalOf(answer: HomeAnswer): PairFailure {
  const { status } = answer
  if (status === 422) return "bad-code"
  if (status === 429) return "too-many"
  if (status === 503) {
    if (overloaded(answer)) return "busy"
    // Overloaded with no wait to keep: home's cap on tries (#3099).
    return errorCodeOf(answer) === "service_overloaded"
      ? "too-many"
      : "not-set-up"
  }
  // A www host without the proxy path, say: nothing there pairs.
  if (status === 404 || status === 405) return "not-home"
  return "other"
}

/**
 * What a pairing request that threw says: a certificate this phone doesn't
 * trust, a name it can't find (NA1, `native-http`'s `blockedReason`), or no
 * answer.
 */
function thrownFailureOf(error: unknown): PairFailure {
  // A silence first: offline, every name fails as a blocked one would.
  if (unanswered(error)) return "unreachable"
  const blocked =
    error instanceof HomeBlockedError
      ? error.reason
      : blockedReason(error, phoneOnline())
  if (blocked === "trust") return "untrusted"
  if (blocked === "name") return "no-name"
  return "unreachable"
}

/** What the native log says as a blocked stretch starts (NA1). */
const BLOCKED_SUMMARY: Readonly<Record<HomeBlockedReason, string>> = {
  name: "This phone couldn't find home's name on this network.",
  trust: "This phone doesn't trust home's certificate.",
}

/** `send`, and whether home answered any of it as busy (`429`). */
export function noticingBusy(send: HomeCall): {
  send: HomeCall
  seen: { busy: boolean }
} {
  const seen = { busy: false }
  return {
    seen,
    send: async (method, path, body): ReturnType<HomeCall> => {
      const answer = await send(method, path, body)
      if (answer.status === 429) seen.busy = true
      return answer
    },
  }
}

export type HomeLink = {
  getSnapshot: () => HomeLinkState
  subscribe: (listener: () => void) => () => void
  /** Reads the phone's own record, once. Sends nothing. */
  load: () => Promise<void>
  /**
   * Asks home once whether it still knows this phone (SIGNIN1): one
   * `GET /auth/session` with the key, on the drain's turn of the pace and
   * holding no activity, so it goes beside anything else. Nothing while
   * unpaired, already forgotten, held away (AW1) or while home is busy
   * (AD3). Only `./standing`'s watch calls it.
   */
  check: () => Promise<void>
  /**
   * Pairs with `address` by `code`, sending `name` too when the owner typed
   * one (SIGNIN2; only where home takes one, `./naming`): unpaired, or over
   * a pairing home has forgotten, which it replaces (SIGNIN3, `mayPair`).
   */
  pair: (address: HomeAddress, code: string, name?: string) => Promise<void>
  unpair: () => Promise<void>
  /**
   * Runs `run` with a `get` that stops sending once `stop` is pressed or the
   * app goes to the background. Credential-free: the sync reads published
   * content only.
   */
  sync: <T>(
    /** The API base the sync reads from, whose busy it keeps (#3127). */
    base: string,
    run: (get: HomeGet) => Promise<T>
  ) => Promise<Run<T>>
  /**
   * Runs `run` with a `send` to the paired home; `refused` when unpaired or
   * busy (`./model`'s `Refusal`).
   */
  send: <T>(run: (send: HomeCall) => Promise<T>) => Promise<Run<T>>
  /**
   * As `send`, for a screen's read (Korean's look at the routine's files,
   * `./routine`; an idea answer's words, `./heard`; My data), which goes
   * beside a drain run. `onItsOwn`: a read the screen makes without the
   * person asking just then, held away from home as a drain is (AW1).
   */
  keep: <T>(
    run: (send: HomeCall) => Promise<T>,
    options?: { readonly onItsOwn?: boolean }
  ) => Promise<Run<T>>
  /**
   * As `send`, for one lane's run of the drain (`./lanes`, LA15);
   * `refused: preempted` also when a send, a pairing or an Unpair stopped
   * it to go first (`./model`).
   */
  drain: <T>(run: (send: HomeCall) => Promise<T>) => Promise<Run<T>>
  /**
   * One `GET` of `path` at the paired home's own address, outside the API
   * and without the credential: home's word on itself, which it answers
   * anyone (`/compat`, `./compat-read`). It takes the drain's turn on the
   * pace and holds no activity, so it goes beside anything the person or a
   * lane is doing; `refused` when unpaired or its record is gone, and
   * `stopped` when its turn was let go.
   */
  look: (path: string) => Promise<Run<HomeAnswer>>
  /**
   * Calls `listener` each time a request with the credential is answered
   * not found other than as home's JSON error, which is how home answers a
   * route it doesn't have (`./serves`); returns an unsubscribe.
   */
  onMissing: (listener: () => void) => () => void
  /** Stops the person's sync, send or read. */
  stop: () => void
  /**
   * Ends a hold away from home (AW1), so the next ask goes at once: the
   * person pulled to check again (`AwayEvent`'s `lookAgain`).
   */
  lookAgain: () => void
  /**
   * Tells the link home answered a way to it other than a request (Game
   * day's live socket, LA21), ending a stretch away as an answer would.
   */
  answered: () => void
}

/**
 * The link says paired, but the record on the phone has gone (a key the
 * Keystore lost since the read): the run is turned away as `gone`.
 */
class PairingGoneError extends Error {
  override name = "PairingGoneError"
}

/** The person's side of the link, or the drain's (`./model`). */
type Side = "person" | "drain"

export function createHomeLink(ports: HomeLinkPorts): HomeLink {
  let state = INITIAL
  let loading: Promise<void> | null = null
  // An Unpair that told home but could not forget the token: the retry
  // finds home no longer holds it, or finds no record left to send.
  let toldBefore = false
  const listeners = new Set<() => void>()
  const missingListeners = new Set<() => void>()

  /**
   * Reads the phone's own record, once: whatever the read comes to,
   * `./settle` makes it what the link's `read` finds.
   */
  const load = (): Promise<void> => {
    loading ??= ports.credential.read().then(
      ({ record, lost }) => {
        dispatch({
          type: "read",
          found: settleRead({ kind: "read", record, lost }),
        })
      },
      () => {
        dispatch({ type: "read", found: settleRead({ kind: "failed" }) })
      }
    )
    return loading
  }

  // The runs waiting on the pairing record's read, by ticket (#3152).
  const parkedRuns = new Map<number, (to: LinkPairing) => void>()
  let nextTicket = 0

  const dispatch = (event: HomeLinkEvent): void => {
    const next = step(state, event)
    if (next === state) return
    const before = state
    state = next
    for (const { ticket, to } of releasedBy(before, next)) {
      const release = parkedRuns.get(ticket)
      parkedRuns.delete(ticket)
      release?.(to)
    }
    for (const listener of listeners) listener()
  }

  /**
   * Waits, as the link's state, for the pairing record's read (#3152): a
   * run asked for while it is read parks here, and the read's end releases
   * it with what the read found. Starts the read, should nothing have yet.
   */
  const parked = (): Promise<LinkPairing> =>
    new Promise((resolve) => {
      nextTicket += 1
      const ticket = nextTicket
      parkedRuns.set(ticket, resolve)
      dispatch({ type: "parked", ticket })
      void load()
    })

  /** Whether this phone is paired, once the record's read has ended. */
  const known = async (): Promise<LinkPairing> =>
    state.link.kind === "reading" ? parked() : pairingIn(state)

  /** A refusal said as a run's end. */
  const refused = (why: Refusal): Run<never> => ({ kind: "refused", why })

  const readPairing = async (): Promise<PairingRecord | null> => {
    const { record } = await ports.credential.read()
    return record === null ? null : parsePairing(record)
  }

  const stopped = (side: Side): boolean =>
    side === "drain"
      ? state.drain.kind === "draining" && state.drain.stopping
      : working(state.activity) && state.activity.stopping

  const pace = createPace(ports, ports.paceMemory ?? null)

  // Home's busy (AD3): the cancel of the timer that ends it, while it lasts.
  let cancelCooling: (() => void) | null = null
  const cool = (): void => {
    cancelCooling?.()
    cancelCooling = null
    dispatch({ type: "cooled", at: ports.now() })
    armCooling()
  }
  /** The timer for the soonest end of a home's busy still under way. */
  const armCooling = (): void => {
    const ends = Object.values(state.busyHomes)
    if (ends.length === 0) return
    cancelCooling?.()
    cancelCooling = ports.after(
      Math.max(Math.min(...ends) - ports.now(), 0),
      cool
    )
  }
  /**
   * Whether home is still to be left alone; a wait already over ends here,
   * as well as on its timer, which a backgrounded WebView can hold back.
   */
  const homeBusyNow = (
    /** The home a request goes to; the link's own busy if none (#3127). */
    base?: string
  ): boolean => {
    const now = ports.now()
    const busy =
      base === undefined
        ? homeBusy(state, now)
        : (state.busyHomes[base] ?? now) > now
    if (busy) return true
    if (Object.values(state.busyHomes).some((until) => until <= now)) cool()
    return false
  }
  const heardBusy = (
    answer: HomeAnswer,
    /** The home that said it: the base its request went to (#3127). */
    base: string
  ): void => {
    // One lesson a busy stretch: requests already out when it began come
    // back busy too, and say nothing more of home's rate.
    const learning = !((state.busyHomes[base] ?? 0) > ports.now())
    pace.spend(learning ? retryAfterMs(answer.retryAfter) : null)
    dispatch({
      type: "homeBusy",
      until: ports.now() + homeBusyFor(answer.retryAfter),
      base,
    })
    armCooling()
  }

  // Every request each side's run started, until it settles: a caller can
  // give up on one (requestJSON's own deadline) that the native call still
  // completes, and the next tap must not race it.
  const inFlight: Record<Side, Set<Promise<void>>> = {
    person: new Set(),
    drain: new Set(),
  }
  const track = (
    side: Side,
    request: Promise<HomeAnswer>
  ): Promise<HomeAnswer> => {
    const settled = request.then(
      () => undefined,
      () => undefined
    )
    inFlight[side].add(settled)
    void settled.then(() => inFlight[side].delete(settled))
    return request
  }

  // Away from home (AW1): the cancel of the timer that ends the hold.
  let cancelLapse: (() => void) | null = null
  const lapse = (): void => {
    cancelLapse?.()
    cancelLapse = null
    dispatch({ type: "lapsed" })
  }
  /** Whether the hold away lasts; one already over ends here, as `homeBusyNow`'s. */
  const awayNow = (): boolean => {
    if (awayHeld(state, ports.now())) return true
    if (state.away?.heldUntil != null) lapse()
    return false
  }
  /**
   * Whether home answered `answered`, or `cause` found it silent; `summary`
   * is what the native log says as the stretch starts.
   */
  const reached = (
    answered: boolean,
    cause: unknown = null,
    summary = "Away from home: home didn't answer."
  ): void => {
    if (answered) {
      if (state.away === null) return
      cancelLapse?.()
      cancelLapse = null
      dispatch({ type: "answered" })
      return
    }
    const before = state.away
    dispatch({ type: "unanswered", now: ports.now() })
    const after = state.away
    if (after === before || after?.heldUntil == null) return
    if (before === null) {
      ports.report?.({
        port: "home server",
        error: {
          kind: "unreachable",
          retryable: true,
          summary,
          cause,
        },
      })
    }
    cancelLapse?.()
    cancelLapse = ports.after(Math.max(after.heldUntil - ports.now(), 0), lapse)
  }
  /**
   * `request` as sent, its answer or silence told to the away state (AW1),
   * and a failure before home could answer told as itself (NA1).
   */
  const heard = (request: Promise<HomeAnswer>): Promise<HomeAnswer> =>
    request.then(
      (answer) => {
        reached(true)
        if (state.blocked !== null) dispatch({ type: "unblocked" })
        return answer
      },
      (error: unknown) => {
        const blocked = blockedOf(error)
        if (blocked !== null) {
          // Held as a silence is (C476), so the phone asks no more often
          // than away; said as itself (NA1), so never as away.
          reached(false, error, BLOCKED_SUMMARY[blocked])
          dispatch({ type: "blocked", reason: blocked, at: ports.now() })
        } else if (unanswered(error)) {
          reached(false, error)
        }
        throw error
      }
    )
  const lookAgain = (fresh: boolean): void => {
    cancelLapse?.()
    cancelLapse = null
    dispatch({ type: "lookAgain", fresh })
  }
  ports.onNetwork?.(() => lookAgain(true))

  /**
   * `call` sent at its turn on the pace and tracked, its `429` starting
   * home's busy; or, while that lasts, answered busy here with nothing sent
   * and no turn taken. Unless `tapped`, held away as busy is (AW1).
   */
  const ask = async (
    side: Side,
    /** The home `call` goes to, whose busy it hears (#3127). */
    base: string,
    call: HomeRequest,
    tapped: boolean,
    /** Told the moment the request goes, after its turn (SIGNIN1). */
    onSent?: (at: number) => void
  ): Promise<HomeAnswer> => {
    const away = (): boolean => !tapped && awayNow()
    if (away()) throw new HomeAwayError()
    if (homeBusyNow(base)) return HOME_BUSY
    const went = await pace.turn(side === "person")
    if (!went || stopped(side)) throw new SyncStoppedError()
    if (away()) throw new HomeAwayError()
    if (homeBusyNow(base)) return HOME_BUSY
    onSent?.(ports.now())
    const answer = await track(side, heard(ports.request(call)))
    if (answer.status === 429) heardBusy(answer, base)
    // Home's overload is its busy, said to the caller as the link says it.
    if (overloaded(answer)) {
      heardBusy(answer, base)
      return HOME_BUSY
    }
    return answer
  }

  /**
   * What an answer to pairing `id`'s key, sent at `sent`, says of home
   * knowing this phone (SIGNIN1): a refusal (`401`) that it doesn't, any
   * success that it does. Anything else (busy, a fault on home) says neither.
   */
  const heardKey = (id: string, answer: HomeAnswer, sent: number): void => {
    if (answer.status === 401) {
      dispatch({ type: "heard", id, known: false, at: sent })
    } else if (answer.status >= 200 && answer.status < 300) {
      dispatch({ type: "heard", id, known: true, at: sent })
    }
  }

  /**
   * `call` to the home at `base`, sent at its turn on the pace, as the
   * person's (pairing, Unpair).
   */
  const personal = async (
    call: HomeRequest,
    base: string
  ): Promise<HomeAnswer> => {
    await pace.turn(true)
    const answer = await ports.request(call)
    // Home busy starts the link's wait for every other request (AD3, #3127);
    // a pairing or an Unpair still goes during one, so it never waits on it.
    if (answer.status === 429 || overloaded(answer)) heardBusy(answer, base)
    // An answer ends a stretch away; a silence here is a pairing's or an
    // Unpair's own to say, and starts none (AW1).
    reached(true)
    return answer
  }

  // The drain's run under way, until it has ended, and whether a send or
  // an Unpair stopped it to go first.
  let draining: Promise<void> | null = null
  let preempted = false
  /** Whether the person is pairing, read afresh after a wait. */
  const pairingNow = (): boolean => state.activity.kind === "pairing"

  /** Stops the drain's run, if one runs, and resolves once it has ended. */
  const drainGone = async (): Promise<void> => {
    if (draining === null) return
    preempted = true
    dispatch({ type: "drainStopped" })
    pace.leave(false)
    await draining
  }

  /** Shared by every run; ends once its requests have settled. */
  const work = async <T>(
    side: Side,
    pressed: RunStart,
    run: () => Promise<T>
  ): Promise<Run<T>> => {
    const why = refusalOf(state, pressed)
    if (why === "reading") {
      await known()
      return work(side, pressed, run)
    }
    if (why !== null) return refused(why)
    dispatch(pressed)
    let ended = (): void => undefined
    if (side === "drain") {
      preempted = false
      draining = new Promise((resolve) => {
        ended = resolve
      })
    } else if (writing(state.activity)) {
      await drainGone()
    }
    const unsubscribe = ports.onHidden(() => {
      dispatch({ type: side === "drain" ? "drainStopped" : "stopPressed" })
      pace.leave(side === "person")
    })
    try {
      const value = await run()
      // A run that resolves either finished or kept its own progress (a
      // copy stopped part way); only one that rejects with the stop ended
      // with nothing to say.
      return { kind: "done", value }
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      if (error instanceof PairingGoneError) return refused("gone")
      throw error
    } finally {
      unsubscribe()
      await Promise.all(inFlight[side])
      if (side === "drain") {
        draining = null
        dispatch({ type: "drainEnded" })
        ended()
      } else {
        dispatch({ type: "workEnded" })
      }
    }
  }

  /** One pairing request, and the token kept; why not, when it was not. */
  const finishPairing = async (
    base: string,
    code: string,
    name: string | undefined,
    id: string,
    pairedAt: number
  ): Promise<PairFailure | null> => {
    // `pairingAddress` refuses http; this is the runtime's own guard.
    if (new URL(base).protocol !== "https:") return "other"
    let answer: HomeAnswer
    try {
      answer = await personal(
        {
          method: "POST",
          url: `${base}/auth/pairing/finish`,
          body: name === undefined ? { code } : { code, label: name },
        },
        base
      )
    } catch (error) {
      return thrownFailureOf(error)
    }
    // Home's overload is busy, not a pairing it can't do (AD3, #3127);
    // `pairRefusalOf` reads it by its code (#3099).
    if (answer.status !== 200) return pairRefusalOf(answer)
    const token = stringFieldOf(answer.body, "token")
    if (token === null) return "other"
    // Home's id for this phone, from a home that gives one (C496).
    const phoneId = stringFieldOf(answer.body, "phoneId")
    try {
      await ports.credential.write(
        JSON.stringify({
          base,
          token,
          id,
          pairedAt,
          phoneId,
          name: name ?? null,
        })
      )
    } catch {
      // Home made a session this phone cannot keep: end it, in the same
      // tap, rather than leave it to expire.
      await personal(
        { method: "POST", url: `${base}/auth/sign-out`, token },
        base
      )
        // Ignored: a sign-out home does not hear leaves that session to
        // expire on its own; this phone kept nothing of it either way.
        .catch(() => undefined)
      return "not-kept"
    }
    return null
  }

  /** A run with a `send` to the paired home, after `pressed` starts it. */
  const credentialed = <T>(
    side: Side,
    pressed: RunStart,
    tapped: boolean,
    run: (send: HomeCall) => Promise<T>
  ): Promise<Run<T>> =>
    work(side, pressed, async () => {
      const pairing = await readPairing()
      if (pairing === null) throw new PairingGoneError()
      const send: HomeCall = (method, path, body, range) => {
        if (stopped(side)) return Promise.reject(new SyncStoppedError())
        if (!path.startsWith("/")) {
          return Promise.reject(new Error(`not a path: ${path}`))
        }
        // When the request went; a busy answer sends nothing and says
        // nothing of the key.
        let sent: number | null = null
        return ask(
          side,
          pairing.base,
          {
            method,
            url: `${pairing.base}${path}`,
            token: pairing.token,
            ...(body === undefined ? {} : { body }),
            ...(range === undefined ? {} : { range }),
          },
          tapped,
          (at) => {
            sent = at
          }
        ).then((answer) => {
          if (sent !== null) heardKey(pairing.id, answer, sent)
          // Home answers a route it doesn't have in plain words ("not
          // found"); a record it doesn't hold comes as its JSON error.
          if (
            answer.status === 404 &&
            !answer.body.trimStart().startsWith("{")
          ) {
            for (const listener of missingListeners) listener()
          }
          return answer
        })
      }
      return run(send)
    })

  return {
    getSnapshot: (): HomeLinkState => state,

    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },

    load,

    async pair(address, code, name): Promise<void> {
      const before = state
      dispatch({ type: "pairPressed", base: address.base })
      if (state === before) return
      // Over a pairing home forgot (SIGNIN3): no run under the old key goes
      // on beside the new pairing, nor a check waiting its turn. Its key is
      // not signed out; home refused it.
      if (before.link.kind === "paired") {
        pace.leave(false)
        await drainGone()
      }
      const { base } = address
      const id = crypto.randomUUID()
      const at = ports.now()
      const failure = await finishPairing(base, code, name, id, at)
      dispatch(
        failure === null
          ? { type: "paired", base, id, at, name: name ?? null }
          : { type: "pairFailed", failure }
      )
    },

    async check(): Promise<void> {
      const { link } = state
      if (link.kind !== "paired" || link.standing.kind === "forgotten") return
      // Pairing again (SIGNIN3): the new pairing is known once made.
      if (pairingNow()) return
      const pairing = await readPairing()
        // Ignored: a record the phone can't read just now is the read's own
        // to say (`load`); the check asks again at its next moment.
        .catch(() => null)
      if (pairing?.id !== link.id) return
      if (awayNow() || homeBusyNow()) return
      if (!(await pace.turn(false))) return
      // Home may have asked to be left alone while this waited its turn, or
      // the person may have started pairing again.
      if (awayNow() || homeBusyNow() || pairingNow()) return
      let answer: HomeAnswer
      const sent = ports.now()
      try {
        answer = await heard(
          ports.request({
            method: "GET",
            url: `${pairing.base}/auth/session`,
            token: pairing.token,
          })
        )
      } catch {
        // A silence is the away state's (`heard`); nothing else is said.
        return
      }
      if (answer.status === 429 || overloaded(answer)) {
        heardBusy(answer, pairing.base)
      }
      heardKey(pairing.id, answer, sent)
    },

    async unpair(): Promise<void> {
      const before = state
      dispatch({ type: "unpairPressed" })
      if (state === before) return
      await drainGone()
      let told = false
      try {
        const pairing = await readPairing()
        if (pairing) {
          const answer = await personal(
            {
              method: "POST",
              url: `${pairing.base}/auth/sign-out`,
              token: pairing.token,
            },
            pairing.base
          )
          told = answer.status >= 200 && answer.status < 300
        }
      } catch {
        told = false
      }
      told ||= toldBefore
      try {
        await ports.credential.clear()
      } catch {
        toldBefore = told
        dispatch({ type: "unpairFailed" })
        return
      }
      toldBefore = false
      dispatch({ type: "unpaired", told })
    },

    sync<T>(base: string, run: (get: HomeGet) => Promise<T>): Promise<Run<T>> {
      const get: HomeGet = (url, etag) => {
        if (stopped("person")) return Promise.reject(new SyncStoppedError())
        return ask(
          "person",
          base,
          {
            method: "GET",
            url,
            ...(etag === undefined ? {} : { ifNoneMatch: etag }),
          },
          true
        )
      }
      return work("person", { type: "syncPressed" }, () => run(get))
    },

    send<T>(run: (send: HomeCall) => Promise<T>): Promise<Run<T>> {
      return credentialed("person", { type: "sendPressed" }, true, run)
    },

    keep<T>(
      run: (send: HomeCall) => Promise<T>,
      options?: { readonly onItsOwn?: boolean }
    ): Promise<Run<T>> {
      return credentialed(
        "person",
        { type: "keepStarted" },
        options?.onItsOwn !== true,
        run
      )
    },

    async look(path: string): Promise<Run<HomeAnswer>> {
      if (!path.startsWith("/")) throw new Error(`not a path: ${path}`)
      if ((await known()).kind !== "paired") return refused("unpaired")
      const pairing = await readPairing()
      if (pairing === null) return refused("gone")
      if (awayNow()) throw new HomeAwayError()
      if (homeBusyNow()) return { kind: "done", value: HOME_BUSY }
      // Its turn let go: the app went to the background while it waited.
      if (!(await pace.turn(false))) return { kind: "stopped" }
      // Home may have asked to be left alone while this waited its turn.
      if (awayNow()) throw new HomeAwayError()
      if (homeBusyNow()) return { kind: "done", value: HOME_BUSY }
      const answer = await heard(
        ports.request({
          method: "GET",
          url: `${pairing.base.replace(/\/api\/v1$/, "")}${path}`,
        })
      )
      if (answer.status === 429) heardBusy(answer, pairing.base)
      if (overloaded(answer)) {
        heardBusy(answer, pairing.base)
        return { kind: "done", value: HOME_BUSY }
      }
      return { kind: "done", value: answer }
    },

    onMissing(listener): () => void {
      missingListeners.add(listener)
      return (): void => {
        missingListeners.delete(listener)
      }
    },

    async drain<T>(run: (send: HomeCall) => Promise<T>): Promise<Run<T>> {
      const outcome = await credentialed(
        "drain",
        { type: "drainStarted" },
        false,
        run
      )
      // Only a run that started was preempted: one the link turned away
      // says why itself, whatever an earlier run left `preempted` at.
      return preempted && outcome.kind !== "refused"
        ? refused("preempted")
        : outcome
    },

    stop(): void {
      if (!working(state.activity)) return
      dispatch({ type: "stopPressed" })
      pace.leave(true)
    },

    lookAgain: (): void => lookAgain(false),

    answered(): void {
      reached(true)
    },
  }
}
