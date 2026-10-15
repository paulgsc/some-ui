/**
 * The runtime behind `./model`: it owns the credential port, the transport
 * and the one operation in flight, and decides which result is stale. The
 * Home server block reads its snapshot and calls these methods; it holds no
 * request of its own.
 *
 * LA8 (docs/learner-data-authority.md), as this module holds it:
 *
 * - **Nothing is sent but by a method a tap called.** Creating the runtime
 *   and `load` read only the phone's own record; being paired sends nothing
 *   on a timer, on resume or on a network change.
 * - **No retry.** A failed request is said once and left; the next tap is
 *   the next try.
 * - **Stop, and the background, end a sync** after the request in flight:
 *   the `get` a sync is handed refuses to send once stopped.
 * - **Unpair always forgets the credential on the phone,** and says whether
 *   home was told.
 * - **The credential goes only to the paired base, over https,** never on a
 *   sync read (`native-http` refuses a credentialed `http:` request).
 */
import type { HomeGet } from "@/lib/device-backend/home-sync"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { HomeAnswer, HomeCall } from "@/lib/device-backend/native-http"

import type { HomeAddress } from "./address"
import type { HomeLinkEvent, HomeLinkState, PairFailure } from "./model"
import { INITIAL, step } from "./model"

/** The phone's sealed record (`HomeCredentialPlugin`): read, kept, forgotten. */
export type CredentialPort = {
  read: () => Promise<{ record: string | null; lost: boolean }>
  write: (record: string) => Promise<void>
  clear: () => Promise<void>
}

export type HomeLinkPorts = {
  credential: CredentialPort
  request: (call: HomeCall) => Promise<HomeAnswer>
  /** Calls `listener` when the app goes to the background; returns an unsubscribe. */
  onHidden: (listener: () => void) => () => void
}

type Pairing = { base: string; token: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parsePairing(record: string): Pairing | null {
  try {
    const parsed: unknown = JSON.parse(record)
    return isRecord(parsed) &&
      typeof parsed.base === "string" &&
      typeof parsed.token === "string"
      ? { base: parsed.base, token: parsed.token }
      : null
  } catch {
    return null
  }
}

/** What a failed pairing request says, from its status or what threw. */
function pairFailureOf(answer: HomeAnswer | unknown): PairFailure {
  if (isRecord(answer) && typeof answer.status === "number") {
    if (answer.status === 422) return "bad-code"
    if (answer.status === 429) return "too-many"
    if (answer.status === 503) return "not-set-up"
    return "other"
  }
  const words = [answer, isRecord(answer) ? answer.cause : undefined]
    .map(String)
    .join(" ")
  return /SSL|certif|CertPath|trust anchor/i.test(words)
    ? "untrusted"
    : "unreachable"
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
  stop: () => void
}

export function createHomeLink(ports: HomeLinkPorts): HomeLink {
  let state = INITIAL
  let loading: Promise<void> | null = null
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
            found: pairing ? { base: pairing.base } : lost ? "lost" : null,
          })
        },
        // A phone that cannot read its record is not paired; nothing is sent.
        () => dispatch({ type: "read", found: null })
      )
      return loading
    },

    async pair(address, code): Promise<void> {
      const before = state
      dispatch({ type: "pairPressed", base: address.base })
      if (state === before) return
      const { base } = address
      let failure: PairFailure | null = null
      try {
        if (new URL(base).protocol !== "https:") throw new Error("not https")
        const answer = await ports.request({
          method: "POST",
          url: `${base}/auth/pairing/finish`,
          body: { code },
        })
        if (answer.status !== 200) {
          failure = pairFailureOf(answer)
        } else {
          const parsed: unknown = JSON.parse(answer.body)
          if (!isRecord(parsed) || typeof parsed.token !== "string") {
            failure = "other"
          } else {
            try {
              await ports.credential.write(
                JSON.stringify({ base, token: parsed.token })
              )
            } catch {
              failure = "not-kept"
            }
          }
        }
      } catch (error) {
        failure = pairFailureOf(error)
      }
      dispatch(
        failure === null
          ? { type: "paired", base }
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
      // Forgotten on the phone whether or not home heard (LA8).
      await ports.credential.clear().catch(() => undefined)
      dispatch({ type: "unpaired", told })
    },

    async sync<T>(
      run: (get: HomeGet) => Promise<T>
    ): Promise<SyncOutcome<T> | null> {
      const before = state
      dispatch({ type: "syncPressed" })
      if (state === before) return null
      const stopped = (): boolean =>
        state.activity.kind === "syncing" && state.activity.stopping
      const unsubscribe = ports.onHidden(() =>
        dispatch({ type: "stopPressed" })
      )
      const get: HomeGet = (url) => {
        if (stopped()) return Promise.reject(new SyncStoppedError())
        return ports.request({ method: "GET", url })
      }
      try {
        const value = await run(get)
        return stopped() ? { kind: "stopped" } : { kind: "done", value }
      } catch (error) {
        if (error instanceof SyncStoppedError) return { kind: "stopped" }
        throw error
      } finally {
        unsubscribe()
        dispatch({ type: "syncEnded" })
      }
    },

    stop(): void {
      dispatch({ type: "stopPressed" })
    },
  }
}
