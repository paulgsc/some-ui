/**
 * The runtime behind `./model`: it owns the credential port, the transport
 * and the one operation in flight, and decides which result is stale. The
 * Home server block reads its snapshot and calls these methods; it holds no
 * request of its own.
 *
 * LA8 (docs/learner-data-authority.md), as this module holds it:
 *
 * - **Nothing is sent but by a method a tap called,** or by `keep`, which
 *   only `lib/home-link/aph` calls, for aph once its person opted in to
 *   keeping it on home (LA9). Creating the runtime and `load` read only the
 *   phone's own record; being paired sends nothing on a timer, on resume or
 *   on a network change.
 * - **No retry.** A failed request is said once and left; the next tap is
 *   the next try. (aph's outbox is sent again when aph next asks: LA9.)
 * - **Stop, and the background, end a sync, a send or a keep** after the request
 *   in flight: the `get` or `send` it is handed refuses to send once
 *   stopped. A run is over only once every request it started has settled.
 * - **Unpair forgets the credential on the phone** whether or not home was
 *   told, and says which; a phone that could not forget it stays paired and
 *   says so.
 * - **The credential goes only to the paired base, over https,** never on a
 *   sync read (`native-http` refuses a credentialed `http:` request): a
 *   send's `send` takes a path, and the base is the one stored with the
 *   token.
 */
import { isRecord, stringFieldOf } from "@/lib/device-backend/common"
import type { HomeGet } from "@/lib/device-backend/home-sync"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { HomeAnswer, HomeCall } from "@/lib/device-backend/native-http"

import type { HomeAddress } from "./address"
import type { HomeLinkEvent, HomeLinkState, PairFailure } from "./model"
import { INITIAL, step, working } from "./model"

/** The phone's sealed record (`HomeCredentialPlugin`): read, kept, forgotten. */
export type CredentialPort = {
  read: () => Promise<{ record: string | null; lost: boolean }>
  write: (record: string) => Promise<void>
  clear: () => Promise<void>
}

export type HomeLinkPorts = {
  credential: CredentialPort
  request: (call: HomeCall) => Promise<HomeAnswer>
  /**
   * Calls `listener` when the app goes to the background, and at once if it
   * already is; returns an unsubscribe.
   */
  onHidden: (listener: () => void) => () => void
}

/** A pairing kept before it had an id is known by its base. */
type Pairing = { base: string; token: string; id: string }

function parsePairing(record: string): Pairing | null {
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
 * A credentialed request to `path` under the paired base, with `body` sent
 * as these bytes. Refuses before sending once stopped.
 */
export type HomeSend = (
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: string
) => Promise<HomeAnswer>

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
    run: (send: HomeSend) => Promise<T>
  ) => Promise<SyncOutcome<T> | null>
  /** As `send`, for aph kept on home (LA9). */
  keep: <T>(
    run: (send: HomeSend) => Promise<T>
  ) => Promise<SyncOutcome<T> | null>
  stop: () => void
}

export function createHomeLink(ports: HomeLinkPorts): HomeLink {
  let state = INITIAL
  let loading: Promise<void> | null = null
  // An Unpair that told home but could not forget the token: the retry
  // finds home no longer holds it, or finds no record left to send.
  let toldBefore = false
  const listeners = new Set<() => void>()

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

  const stopped = (): boolean =>
    working(state.activity) && state.activity.stopping

  // Every request a sync or send started, until it settles: a caller can
  // give up on one (requestJSON's own deadline) that the native call still
  // completes, and the next tap must not race it.
  const inFlight = new Set<Promise<void>>()
  const track = (request: Promise<HomeAnswer>): Promise<HomeAnswer> => {
    const settled = request.then(
      () => undefined,
      () => undefined
    )
    inFlight.add(settled)
    void settled.then(() => inFlight.delete(settled))
    return request
  }

  /** Shared by `sync` and `send`; ends once its requests have settled. */
  const work = async <T>(
    pressed: HomeLinkEvent,
    run: () => Promise<T>
  ): Promise<SyncOutcome<T> | null> => {
    const before = state
    dispatch(pressed)
    if (state === before) return null
    const unsubscribe = ports.onHidden(() => dispatch({ type: "stopPressed" }))
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
      await Promise.all(inFlight)
      dispatch({ type: "workEnded" })
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
      answer = await ports.request({
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
      await ports
        .request({ method: "POST", url: `${base}/auth/sign-out`, token })
        .catch(() => undefined)
      return "not-kept"
    }
    return null
  }

  /** A run with a `send` to the paired home, after `pressed` starts it. */
  const credentialed = <T>(
    pressed: HomeLinkEvent,
    run: (send: HomeSend) => Promise<T>
  ): Promise<SyncOutcome<T> | null> =>
    work(pressed, async () => {
      const pairing = await readPairing()
      if (pairing === null) throw new Error("this phone's pairing is gone")
      const send: HomeSend = (method, path, body) => {
        if (stopped()) return Promise.reject(new SyncStoppedError())
        if (!path.startsWith("/")) {
          return Promise.reject(new Error(`not a path: ${path}`))
        }
        return track(
          ports.request({
            method,
            url: `${pairing.base}${path}`,
            token: pairing.token,
            ...(body === undefined ? {} : { body }),
          })
        )
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
      let told = false
      try {
        const pairing = await readPairing()
        if (pairing) {
          const answer = await ports.request({
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
      const get: HomeGet = (url) => {
        if (stopped()) return Promise.reject(new SyncStoppedError())
        return track(ports.request({ method: "GET", url }))
      }
      return work({ type: "syncPressed" }, () => run(get))
    },

    send<T>(
      run: (send: HomeSend) => Promise<T>
    ): Promise<SyncOutcome<T> | null> {
      return credentialed({ type: "sendPressed" }, run)
    },

    keep<T>(
      run: (send: HomeSend) => Promise<T>
    ): Promise<SyncOutcome<T> | null> {
      return credentialed({ type: "keepStarted" }, run)
    },

    stop(): void {
      dispatch({ type: "stopPressed" })
    },
  }
}
