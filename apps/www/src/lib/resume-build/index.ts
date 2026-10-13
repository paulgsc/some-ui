/**
 * Builds a résumé with contact details (PII) on the home network's render
 * service (`packages/ui/resume/scripts/serve.mjs`, reached through the
 * same-origin `/api/resume/` proxy, with `@some-ui/resume`'s client), for the
 * LAN résumé builder page.
 *
 * The PII lives in the page's form and in the one request that carries it;
 * nothing here stores, logs or reports it. The PDF comes back as an object URL
 * the runtime owns: it is revoked when a newer build replaces it or the page
 * goes away.
 *
 * R1 (docs/monorepo-boundaries.md): `step` is the state, the runtime owns the
 * request and the URL and drops a render a newer one superseded, and the
 * component only reads the snapshot and calls `build`.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ResumeRenderOutcome, ResumeRenderRequest } from "@some-ui/resume"
import { renderResume } from "@some-ui/resume"

export type ResumeBuildRequest = ResumeRenderRequest
export type RenderOutcome = ResumeRenderOutcome

export type RenderPort = (
  request: ResumeBuildRequest,
  signal: AbortSignal
) => Promise<RenderOutcome>

/** The home network's service, through this origin's `/api/resume/` proxy. */
export const serviceRender: RenderPort = (request, signal) =>
  renderResume("/api/resume/render", request, signal)

type ResumeBuildState =
  | { readonly status: "idle" }
  | { readonly status: "rendering" }
  | {
      readonly status: "ready"
      readonly url: string
      readonly filename: string
    }
  | { readonly status: "refused"; readonly message: string }

type ResumeBuildEvent =
  | { readonly type: "started" }
  | {
      readonly type: "rendered"
      readonly url: string
      readonly filename: string
    }
  | { readonly type: "refused"; readonly message: string }

export function step(
  _state: ResumeBuildState,
  event: ResumeBuildEvent
): ResumeBuildState {
  switch (event.type) {
    case "started": {
      return { status: "rendering" }
    }
    case "rendered": {
      return { status: "ready", url: event.url, filename: event.filename }
    }
    case "refused": {
      return { status: "refused", message: event.message }
    }
    default: {
      return assertNever(event)
    }
  }
}

export type ObjectUrls = {
  readonly create: (blob: Blob) => string
  readonly revoke: (url: string) => void
}

export type ResumeBuildRuntime = {
  readonly getSnapshot: () => ResumeBuildState
  readonly subscribe: (listener: () => void) => () => void
  /** Starts a render, superseding any in flight. Never rejects. */
  readonly build: (request: ResumeBuildRequest) => void
  readonly dispose: () => void
}

export function createResumeBuild(ports: {
  readonly render: RenderPort
  readonly urls: ObjectUrls
}): ResumeBuildRuntime {
  let state: ResumeBuildState = { status: "idle" }
  let inFlight: AbortController | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: ResumeBuildEvent): void => {
    if (state.status === "ready") ports.urls.revoke(state.url)
    state = step(state, event)
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    build: (request): void => {
      inFlight?.abort()
      const controller = new AbortController()
      inFlight = controller
      dispatch({ type: "started" })
      void ports.render(request, controller.signal).then(
        (outcome): void => {
          if (inFlight !== controller) return
          inFlight = null
          dispatch(
            outcome.kind === "pdf"
              ? {
                  type: "rendered",
                  url: ports.urls.create(outcome.pdf),
                  filename: outcome.filename,
                }
              : { type: "refused", message: outcome.message }
          )
        },
        (): void => {
          if (inFlight !== controller) return
          inFlight = null
          dispatch({ type: "refused", message: "The résumé failed to render." })
        }
      )
    },
    dispose: (): void => {
      inFlight?.abort()
      inFlight = null
      if (state.status === "ready") ports.urls.revoke(state.url)
      state = { status: "idle" }
      listeners.clear()
    },
  }
}
