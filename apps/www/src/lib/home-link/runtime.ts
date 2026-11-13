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
 *   home serves this build (`./serves`, #2843). Creating the runtime and `load` read only the phone's own
 *   record; the one read on a timer is that last one, bounded by its screen.
 * - **No retry.** A failed request is said once and left; the next tap, or
 *   the drain's next ask (LA15), is the next try.
 * - **Home's busy is kept** (AD3): the first `429` a sync or send hears
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
 * AW1 (#2928, `./away`), as this module holds it: **away from home is said
 * once, and waited out.** A request that finds no answer starts a stretch
 * away, told to `report` once, when it starts; while its hold lasts, a drain,
 * a screen's read on its own (`keep`'s `onItsOwn`) and `look` send nothing
 * and are answered as unanswered (`HomeAwayError`) at once, nor told again.
 * What the person asks for still goes (a sync, a send, a screen's read,
 * pairing and Unpair): a tap is a try. Any answer ends the stretch; the
 * hold's end, a network change (`onNetwork`) or `lookAgain` (a pull, Send
 * now) lets the next ask go.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"

import { stringFieldOf } from "@/lib/device-backend/common"
import type { HomeGet } from "@/lib/device-backend/home-sync"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { HomeRequest } from "@/lib/device-backend/native-http"
import {
  HomeAwayError,
  HomeNoAnswerError,
} from "@/lib/device-backend/native-http/no-answer"
import { isFileHostTimeout } from "@/lib/file-host-config/client"

import type { HomeAddress } from "./address"
import type { HomeLinkEvent, HomeLinkState, PairFailure } from "./model"
import { awayHeld, homeBusy, INITIAL, step, working, writing } from "./model"
import { createPace } from "./pace"

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
  const text = retryAfter?.trim() ?? ""
  if (!/^\d+$/.test(text)) return HOME_BUSY_MS
  const ms = Number(text) * 1_000
  return Math.min(Math.max(ms, HOME_BUSY_MIN_MS), HOME_BUSY_MAX_MS)
}

/** What the link answers for home while home's busy lasts: nothing was sent. */
const HOME_BUSY: HomeAnswer = { status: 429, body: "" }

/** A pairing kept before it had an id is known by its base. */
type Pairing = { base: string; token: string; id: string }

export function parsePairing(record: string): Pairing | null {
  try {
    const parsed: unknown = JSON.parse(record)
    return isRecord(parsed) &&
      typeof parsed.base === "string" &&
      typeof parsed.token === "string"
      ? {
          base: parsed.base,
          token: parsed.token,
          id: typeof parsed.id === "string" ? parsed.id : parsed.base,
        }
      : null
  } catch {
    return null
  }
}

/** What a pairing answer other than 200 says. */
function refusalOf(status: number): PairFailure {
  if (status === 422) return "bad-code"
  if (status === 429) return "too-many"
  if (status === 503) return "not-set-up"
  // A www host without the proxy path, say: nothing there pairs.
  if (status === 404 || status === 405) return "not-home"
  return "other"
}

/** What a pairing request that threw says: TLS refused, or no answer. */
function thrownFailureOf(error: unknown): PairFailure {
  const words = [error, isRecord(error) ? error.cause : undefined]
    .map(String)
    .join(" ")
  return /SSL|certif|CertPath|trust anchor/i.test(words)
    ? "untrusted"
    : "unreachable"
}

/**
 * `error` is a request finding no answer from home, or a wrapping of that:
 * `native-http`'s connection failing or timing out (`HomeNoAnswerError`),
 * or `requestJSON`'s own deadline passing first (`isFileHostTimeout`). Any
 * other failure, a Keystore read or a plugin missing from the build among
 * them, is a fault on this phone.
 */
export function unanswered(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof HomeNoAnswerError || isFileHostTimeout(cause)) {
      return true
    }
  }
  return false
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

type SyncOutcome<T> =
  | { readonly kind: "done"; readonly value: T }
  | { readonly kind: "stopped" }

export type HomeLink = {
  getSnapshot: () => HomeLinkState
  subscribe: (listener: () => void) => () => void
  /** Reads the phone's own record, once. Sends nothing. */
  load: () => Promise<void>
  pair: (address: HomeAddress, code: string) => Promise<void>
  unpair: () => Promise<void>
  /**
   * Runs `run` with a `get` that stops sending once `stop` is pressed or the
   * app goes to the background. Credential-free: the sync reads published
   * content only.
   */
  sync: <T>(run: (get: HomeGet) => Promise<T>) => Promise<SyncOutcome<T> | null>
  /**
   * Runs `run` with a `send` to the paired home; `null` when unpaired or
   * busy.
   */
  send: <T>(
    run: (send: HomeCall) => Promise<T>
  ) => Promise<SyncOutcome<T> | null>
  /**
   * As `send`, for a screen's read (Korean's look at the routine's files,
   * `./routine`; an idea answer's words, `./heard`; My data), which goes
   * beside a drain run. `onItsOwn`: a read the screen makes without the
   * person asking just then, held away from home as a drain is (AW1).
   */
  keep: <T>(
    run: (send: HomeCall) => Promise<T>,
    options?: { readonly onItsOwn?: boolean }
  ) => Promise<SyncOutcome<T> | null>
  /**
   * As `send`, for one lane's run of the drain (`./lanes`, LA15); `null`
   * also when a send or an Unpair stopped it to go first (`./model`).
   */
  drain: <T>(
    run: (send: HomeCall) => Promise<T>
  ) => Promise<SyncOutcome<T> | null>
  /**
   * One `GET` of `path` at the paired home's own address, outside the API
   * and without the credential: home's word on itself, which it answers
   * anyone (`/compat`, `./compat-read`). It takes the drain's turn on the
   * pace and holds no activity, so it goes beside anything the person or a
   * lane is doing; `null` when unpaired or its turn was let go.
   */
  look: (path: string) => Promise<SyncOutcome<HomeAnswer> | null>
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
   * person pulled to check again.
   */
  lookAgain: () => void
  /**
   * Tells the link home answered a way to it other than a request (Game
   * day's live socket, LA21), ending a stretch away as an answer would.
   */
  answered: () => void
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

  const dispatch = (event: HomeLinkEvent): void => {
    const next = step(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const readPairing = async (): Promise<Pairing | null> => {
    const { record } = await ports.credential.read()
    return record === null ? null : parsePairing(record)
  }

  const stopped = (side: Side): boolean =>
    side === "drain"
      ? state.drain.kind === "draining" && state.drain.stopping
      : working(state.activity) && state.activity.stopping

  const pace = createPace(ports)

  // Home's busy (AD3): the cancel of the timer that ends it, while it lasts.
  let cancelCooling: (() => void) | null = null
  const cool = (): void => {
    cancelCooling?.()
    cancelCooling = null
    dispatch({ type: "cooled" })
  }
  /**
   * Whether home is still to be left alone; a wait already over ends here,
   * as well as on its timer, which a backgrounded WebView can hold back.
   */
  const homeBusyNow = (): boolean => {
    if (homeBusy(state, ports.now())) return true
    if (state.homeBusyUntil !== null) cool()
    return false
  }
  const heardBusy = (answer: HomeAnswer): void => {
    dispatch({
      type: "homeBusy",
      until: ports.now() + homeBusyFor(answer.retryAfter),
    })
    const until = state.homeBusyUntil
    if (until === null) return
    cancelCooling?.()
    cancelCooling = ports.after(Math.max(until - ports.now(), 0), cool)
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
  /** Whether home answered `answered`, or `cause` found it silent. */
  const reached = (answered: boolean, cause: unknown = null): void => {
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
          summary: "Away from home: home didn't answer.",
          cause,
        },
      })
    }
    cancelLapse?.()
    cancelLapse = ports.after(Math.max(after.heldUntil - ports.now(), 0), lapse)
  }
  /** `request` as sent, its answer or silence told to the away state. */
  const heard = (request: Promise<HomeAnswer>): Promise<HomeAnswer> =>
    request.then(
      (answer) => {
        reached(true)
        return answer
      },
      (error: unknown) => {
        if (unanswered(error)) reached(false, error)
        throw error
      }
    )
  const lookAgain = (): void => {
    cancelLapse?.()
    cancelLapse = null
    dispatch({ type: "lookAgain" })
  }
  ports.onNetwork?.(lookAgain)

  /**
   * `call` sent at its turn on the pace and tracked, its `429` starting
   * home's busy; or, while that lasts, answered busy here with nothing sent
   * and no turn taken. Unless `tapped`, held away as busy is (AW1).
   */
  const ask = async (
    side: Side,
    call: HomeRequest,
    tapped: boolean
  ): Promise<HomeAnswer> => {
    const away = (): boolean => !tapped && awayNow()
    if (away()) throw new HomeAwayError()
    if (homeBusyNow()) return HOME_BUSY
    const went = await pace.turn(side === "person")
    if (!went || stopped(side)) throw new SyncStoppedError()
    if (away()) throw new HomeAwayError()
    if (homeBusyNow()) return HOME_BUSY
    const answer = await track(side, heard(ports.request(call)))
    if (answer.status === 429) heardBusy(answer)
    return answer
  }

  /** `call` sent at its turn on the pace, as the person's (pairing, Unpair). */
  const personal = async (call: HomeRequest): Promise<HomeAnswer> => {
    await pace.turn(true)
    const answer = await ports.request(call)
    // An answer ends a stretch away; a silence here is a pairing's or an
    // Unpair's own to say, and starts none (AW1).
    reached(true)
    return answer
  }

  // The drain's run under way, until it has ended, and whether a send or
  // an Unpair stopped it to go first.
  let draining: Promise<void> | null = null
  let preempted = false
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
    pressed: HomeLinkEvent,
    run: () => Promise<T>
  ): Promise<SyncOutcome<T> | null> => {
    const before = state
    dispatch(pressed)
    if (state === before) return null
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
    id: string
  ): Promise<PairFailure | null> => {
    // `pairingAddress` refuses http; this is the runtime's own guard.
    if (new URL(base).protocol !== "https:") return "other"
    let answer: HomeAnswer
    try {
      answer = await personal({
        method: "POST",
        url: `${base}/auth/pairing/finish`,
        body: { code },
      })
    } catch (error) {
      return thrownFailureOf(error)
    }
    if (answer.status !== 200) return refusalOf(answer.status)
    const token = stringFieldOf(answer.body, "token")
    if (token === null) return "other"
    try {
      await ports.credential.write(JSON.stringify({ base, token, id }))
    } catch {
      // Home made a session this phone cannot keep: end it, in the same
      // tap, rather than leave it to expire.
      await personal({ method: "POST", url: `${base}/auth/sign-out`, token })
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
    pressed: HomeLinkEvent,
    tapped: boolean,
    run: (send: HomeCall) => Promise<T>
  ): Promise<SyncOutcome<T> | null> =>
    work(side, pressed, async () => {
      const pairing = await readPairing()
      if (pairing === null) throw new Error("this phone's pairing is gone")
      const send: HomeCall = (method, path, body, range) => {
        if (stopped(side)) return Promise.reject(new SyncStoppedError())
        if (!path.startsWith("/")) {
          return Promise.reject(new Error(`not a path: ${path}`))
        }
        return ask(
          side,
          {
            method,
            url: `${pairing.base}${path}`,
            token: pairing.token,
            ...(body === undefined ? {} : { body }),
            ...(range === undefined ? {} : { range }),
          },
          tapped
        ).then((answer) => {
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

    load(): Promise<void> {
      loading ??= ports.credential.read().then(
        ({ record, lost }) => {
          const pairing = record === null ? null : parsePairing(record)
          dispatch({
            type: "read",
            found: pairing
              ? { base: pairing.base, id: pairing.id }
              : lost
                ? "lost"
                : null,
          })
        },
        () => dispatch({ type: "read", found: "unreadable" })
      )
      return loading
    },

    async pair(address, code): Promise<void> {
      const before = state
      dispatch({ type: "pairPressed", base: address.base })
      if (state === before) return
      const { base } = address
      const id = crypto.randomUUID()
      const failure = await finishPairing(base, code, id)
      dispatch(
        failure === null
          ? { type: "paired", base, id }
          : { type: "pairFailed", failure }
      )
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
          const answer = await personal({
            method: "POST",
            url: `${pairing.base}/auth/sign-out`,
            token: pairing.token,
          })
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

    sync<T>(run: (get: HomeGet) => Promise<T>): Promise<SyncOutcome<T> | null> {
      const get: HomeGet = (url, etag) => {
        if (stopped("person")) return Promise.reject(new SyncStoppedError())
        return ask(
          "person",
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

    send<T>(
      run: (send: HomeCall) => Promise<T>
    ): Promise<SyncOutcome<T> | null> {
      return credentialed("person", { type: "sendPressed" }, true, run)
    },

    keep<T>(
      run: (send: HomeCall) => Promise<T>,
      options?: { readonly onItsOwn?: boolean }
    ): Promise<SyncOutcome<T> | null> {
      return credentialed(
        "person",
        { type: "keepStarted" },
        options?.onItsOwn !== true,
        run
      )
    },

    async look(path: string): Promise<SyncOutcome<HomeAnswer> | null> {
      if (!path.startsWith("/")) throw new Error(`not a path: ${path}`)
      if (state.link.kind !== "paired") return null
      const pairing = await readPairing()
      if (pairing === null) return null
      if (awayNow()) throw new HomeAwayError()
      if (homeBusyNow()) return { kind: "done", value: HOME_BUSY }
      if (!(await pace.turn(false))) return null
      // Home may have asked to be left alone while this waited its turn.
      if (awayNow()) throw new HomeAwayError()
      if (homeBusyNow()) return { kind: "done", value: HOME_BUSY }
      const answer = await heard(
        ports.request({
          method: "GET",
          url: `${pairing.base.replace(/\/api\/v1$/, "")}${path}`,
        })
      )
      if (answer.status === 429) heardBusy(answer)
      return { kind: "done", value: answer }
    },

    onMissing(listener): () => void {
      missingListeners.add(listener)
      return (): void => {
        missingListeners.delete(listener)
      }
    },

    async drain<T>(
      run: (send: HomeCall) => Promise<T>
    ): Promise<SyncOutcome<T> | null> {
      const outcome = await credentialed(
        "drain",
        { type: "drainStarted" },
        false,
        run
      )
      return preempted ? null : outcome
    },

    stop(): void {
      if (!working(state.activity)) return
      dispatch({ type: "stopPressed" })
      pace.leave(true)
    },

    lookAgain,

    answered(): void {
      reached(true)
    },
  }
}
