/**
 * The phone's link to the home server as one state: whether it is paired,
 * and the one thing it is doing, if any. `step` is pure; `./runtime` runs
 * the ports and feeds their results back as events.
 *
 * One operation at a time, by structure: pairing, unpairing and a sync are
 * arms of `activity`, and `step` refuses to start one while another runs. A
 * result for an operation that is no longer the current one is dropped.
 */

/** Why the phone is not paired, said once beside the block. */
export type UnpairedNote =
  /** Unpaired, and home was told. */
  | "unpaired"
  /** Unpaired on the phone; home could not be reached to be told. */
  | "unpaired-offline"
  /** The pairing's record could not be read back (a restore, say). */
  | "lost"

export type PairFailure =
  | "unreachable"
  | "untrusted"
  | "bad-code"
  | "too-many"
  | "not-set-up"
  | "not-kept"
  | "other"

export type Link =
  /** The phone's own record is being read: no request to home. */
  | { readonly kind: "reading" }
  | { readonly kind: "unpaired"; readonly note: UnpairedNote | null }
  | { readonly kind: "paired"; readonly base: string }

export type Activity =
  | { readonly kind: "idle" }
  | { readonly kind: "pairing"; readonly base: string }
  | { readonly kind: "unpairing" }
  | { readonly kind: "syncing"; readonly stopping: boolean }

export type HomeLinkState = {
  readonly link: Link
  readonly activity: Activity
  /** The last pairing attempt's failure, until the next attempt. */
  readonly pairFailure: PairFailure | null
}

export type HomeLinkEvent =
  | {
      readonly type: "read"
      readonly found: { readonly base: string } | "lost" | null
    }
  | { readonly type: "pairPressed"; readonly base: string }
  | { readonly type: "paired"; readonly base: string }
  | { readonly type: "pairFailed"; readonly failure: PairFailure }
  | { readonly type: "unpairPressed" }
  | { readonly type: "unpaired"; readonly told: boolean }
  | { readonly type: "syncPressed" }
  | { readonly type: "stopPressed" }
  | { readonly type: "syncEnded" }

export const INITIAL: HomeLinkState = {
  link: { kind: "reading" },
  activity: { kind: "idle" },
  pairFailure: null,
}

const idle = { kind: "idle" } as const

function assertNever(value: never): never {
  throw new Error(`unhandled home-link event: ${JSON.stringify(value)}`)
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
            : found === "lost"
              ? { kind: "unpaired", note: "lost" }
              : { kind: "paired", base: found.base },
      }
    }
    case "pairPressed": {
      if (link.kind !== "unpaired" || activity.kind !== "idle") return state
      return {
        ...state,
        activity: { kind: "pairing", base: event.base },
        pairFailure: null,
      }
    }
    case "paired": {
      if (activity.kind !== "pairing" || activity.base !== event.base)
        return state
      return {
        link: { kind: "paired", base: event.base },
        activity: idle,
        pairFailure: null,
      }
    }
    case "pairFailed": {
      if (activity.kind !== "pairing") return state
      return { ...state, activity: idle, pairFailure: event.failure }
    }
    case "unpairPressed": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "unpairing" } }
    }
    case "unpaired": {
      if (activity.kind !== "unpairing") return state
      return {
        link: {
          kind: "unpaired",
          note: event.told ? "unpaired" : "unpaired-offline",
        },
        activity: idle,
        pairFailure: null,
      }
    }
    case "syncPressed": {
      if (link.kind === "reading" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "syncing", stopping: false } }
    }
    case "stopPressed": {
      if (activity.kind !== "syncing") return state
      return { ...state, activity: { kind: "syncing", stopping: true } }
    }
    case "syncEnded": {
      if (activity.kind !== "syncing") return state
      return { ...state, activity: idle }
    }
    default: {
      return assertNever(event)
    }
  }
}
