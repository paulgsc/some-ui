/**
 * Runs the approval page's machine (`connect.ts`) against the outside world:
 * the server (through `ApprovalClient`), the passkey ceremony and the
 * browser's location. It turns each effect into a call on a port and each
 * result into an event, and decides nothing: which results still matter is
 * `step`'s, since each event is taken only in the state that asked for it.
 *
 * The one thing it holds is whether a page is showing. Leaving for the
 * service's redirect is the only effect a person would notice after they had
 * gone, so a result that lands while no page is attached changes the state
 * and goes nowhere.
 */
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"

import type { ApprovalClient } from "./client"
import type {
  ConnectEffect,
  ConnectEvent,
  ConnectIntent,
  ConnectState,
} from "./connect"
import { initialState, readAuthorizationParams, step } from "./connect"

export type ConnectPorts = {
  /** `undefined` on a build with no server. */
  client: ApprovalClient | undefined
  /** Asks the server whether this browser holds a session. */
  hasSession: () => Promise<boolean>
  /** The passkey sign-in. */
  signIn: () => Promise<void>
  /** Words for a failed sign-in (`describeAuthError`). */
  describeSignInError: (error: unknown) => string
  /** Leaves the app for the service's redirect: a full page load. */
  go: (url: string) => void
}

type ConnectPage = {
  /** The page's raw query string (`location.search`). */
  search: string
  /** Whether the page is inside another page's frame. */
  framed: boolean
}

export type ConnectRuntime = {
  getSnapshot: () => ConnectState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: ConnectIntent) => void
  /**
   * The page is showing: on the first attach, hands the request to the
   * server. Returns the matching detach. Attaching again (a remount) resumes
   * where it was and sends nothing twice.
   */
  attach: (page: ConnectPage) => () => void
}

function failureReason(error: unknown): "not-configured" | "unreachable" {
  return error instanceof FileHostNotConfiguredError
    ? "not-configured"
    : "unreachable"
}

export function createConnect(ports: ConnectPorts): ConnectRuntime {
  let state = initialState
  let attached = 0
  const listeners = new Set<() => void>()

  const dispatch = (event: ConnectEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: ConnectEffect): void {
    const { client } = ports
    switch (effect.type) {
      case "open": {
        if (client === undefined) return
        client.open(effect.params).then(
          (opened) =>
            dispatch(
              opened.kind === "pending"
                ? { type: "opened", approval: opened.approval }
                : { type: "refused", refusal: opened }
            ),
          (error: unknown) =>
            dispatch({ type: "open-failed", reason: failureReason(error) })
        )
        return
      }
      case "learn-session": {
        ports.hasSession().then(
          (signedIn) => dispatch({ type: "session-learned", signedIn }),
          // Nothing learned: approving will ask for the passkey.
          () => undefined
        )
        return
      }
      case "sign-in": {
        ports.signIn().then(
          () => dispatch({ type: "signed-in" }),
          (error: unknown) =>
            dispatch({
              type: "sign-in-failed",
              notice: ports.describeSignInError(error),
            })
        )
        return
      }
      case "answer": {
        if (client === undefined) return
        client.answer(effect.request, effect.answer).then(
          (redirectTo) => dispatch({ type: "answered", redirectTo }),
          (error: unknown) => dispatch(answerFailed(error))
        )
        return
      }
      case "go": {
        if (attached > 0) ports.go(effect.to)
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch,
    attach(page): () => void {
      attached += 1
      dispatch({
        type: "arrived",
        params: readAuthorizationParams(page.search),
        framed: page.framed,
        hasServer: ports.client !== undefined,
      })
      return () => {
        attached -= 1
      }
    },
  }
}

function answerFailed(error: unknown): ConnectEvent {
  if (error instanceof FileHostResponseError && error.status === 404) {
    return {
      type: "answer-failed",
      reason: "expired",
      notice: "This request expired or was already answered.",
    }
  }
  if (error instanceof FileHostResponseError && error.status === 401) {
    return {
      type: "answer-failed",
      reason: "signed-out",
      notice: "Your session ended. Allow again to sign in with your passkey.",
    }
  }
  return {
    type: "answer-failed",
    reason: "failed",
    notice:
      error instanceof FileHostResponseError
        ? "The server couldn't record your answer. Try again in a moment."
        : "The server can't be reached right now. Try again in a moment.",
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled connect effect: ${JSON.stringify(value)}`)
}
