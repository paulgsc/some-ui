/**
 * Whether the paired home serves this build of the app, as one state and a
 * pure `step` (#2843): the client half of home's on-demand deploy
 * (paulgsc/server#779). A build carries the server it was built against
 * (`SERVER_CONTRACT_EPOCH` in `@some-ui/server-routes`) and asks home
 * `GET /compat?needs=<it>` (`./compat-read`); `servesOf` reads the answer.
 * `./serves` runs the ask, and a lane's mark shows what it found
 * (`./words`' `laneView`).
 *
 * When it asks (`ask`'s `why`): the app starting with the phone paired
 * (`start`, also a new pairing), the app coming back to the foreground
 * (`front`), and a route this build calls answering not found (`missing`),
 * at most once a `MISSING_GAP`. Never on a timer.
 */
import { assertNever, isRecord } from "@some-ui/core-utils"

/**
 * What home said of this build: it serves it (`fits`); it is fetching a
 * newer server to (`updating`); it can't yet (`not-yet`); or this build is
 * older than the oldest home serves (`too-old`).
 */
export type Serves = "fits" | "updating" | "not-yet" | "too-old"

export type ServesState = {
  /** What home last said; null while it has said nothing on this pairing. */
  readonly serves: Serves | null
  /** An ask is out. */
  readonly asking: boolean
  /** When the last ask went, on the page's clock; null before the first. */
  readonly askedAt: number | null
}

export type ServesEvent =
  | {
      readonly type: "ask"
      readonly why: "start" | "front" | "missing"
      readonly at: number
    }
  /** Home answered, and what it said, or null when it said nothing readable. */
  | { readonly type: "answered"; readonly serves: Serves | null }
  /** No answer: unreachable, or the link was busy. What was known stays. */
  | { readonly type: "unanswered" }
  /** The phone is no longer paired: what home said is forgotten. */
  | { readonly type: "unpaired" }

export const INITIAL_SERVES: ServesState = {
  serves: null,
  asking: false,
  askedAt: null,
}

/** The least time between two asks a not-found starts. */
export const MISSING_GAP = 60_000

export function step(state: ServesState, event: ServesEvent): ServesState {
  switch (event.type) {
    case "ask": {
      if (state.asking) return state
      if (
        event.why === "missing" &&
        state.askedAt !== null &&
        event.at - state.askedAt < MISSING_GAP
      ) {
        return state
      }
      return { ...state, asking: true, askedAt: event.at }
    }
    case "answered": {
      if (!state.asking) return state
      return { ...state, asking: false, serves: event.serves }
    }
    case "unanswered": {
      if (!state.asking) return state
      return { ...state, asking: false }
    }
    case "unpaired": {
      return state === INITIAL_SERVES ? state : INITIAL_SERVES
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * What home's answer to `/compat` says of this build, or null when it is
 * not that answer (a home older than the ask, say). `supported` decides;
 * otherwise `deploy` says which way: the build is behind home
 * (`client_behind`), home is fetching a newer server (`wanted`,
 * `in_flight`), or it can't serve this build now (anything else: nothing
 * newer was found, a pull ran moments ago, the ask was past belief, or home
 * could not ask for one).
 */
export function servesOf(answer: {
  readonly status: number
  readonly body: string
}): Serves | null {
  if (answer.status !== 200) return null
  let body: unknown
  try {
    body = JSON.parse(answer.body)
  } catch {
    return null
  }
  if (!isRecord(body)) return null
  const { supported, deploy } = body
  if (supported === true) return "fits"
  if (supported !== false || typeof deploy !== "string") return null
  if (deploy === "client_behind") return "too-old"
  if (deploy === "wanted" || deploy === "in_flight") return "updating"
  return "not-yet"
}
