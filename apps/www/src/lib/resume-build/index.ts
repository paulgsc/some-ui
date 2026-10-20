/**
 * Builds a résumé with contact details (PII) on the home network's render
 * service (`packages/ui/resume/scripts/serve.mjs`, reached through the
 * same-origin `/api/resume/` proxy, with `@some-ui/resume`'s client), for the
 * LAN résumé builder page.
 *
 * The PII lives only in the page's form and the one request that carries
 * it. The PDF is an object URL the runtime owns, revoked when a newer build
 * replaces it or the page goes away.
 *
 * R1 (docs/monorepo-boundaries.md): `step` is the state, the runtime owns the
 * request and the URL and drops a render a newer one superseded, and the
 * component only reads the snapshot and calls `build`.
 */
import { assertNever } from "@some-ui/core-utils"
import { IdSchema } from "@some-ui/job-desk"
import type { ResumeRenderOutcome, ResumeRenderRequest } from "@some-ui/resume"
import { PII_TEMPLATES, renderResume } from "@some-ui/resume"

import { isResumeComposition } from "@/lib/resume-options"

/**
 * What a link may preselect: the phone's Jobs wing opens this page with the
 * composition and layout a pick recommends, and the pick's id. Anything
 * unknown or malformed is dropped, so a stale link still opens the page.
 */
export type BuilderSearch = {
  readonly variant?: string
  readonly template?: string
  readonly pick?: string
}

export function parseBuilderSearch(
  search: Record<string, unknown>
): BuilderSearch {
  // A pick's or a scout's id, as job-desk writes it.
  const id = IdSchema.safeParse(search.pick)
  const pick = id.success ? id.data : undefined
  return {
    variant: isResumeComposition(search.variant) ? search.variant : undefined,
    template: PII_TEMPLATES.find((t) => t === search.template),
    pick,
  }
}

/**
 * The name a pick's PDF downloads as, the one Drive's `some-ui jobs/
 * Recommended resume/` keeps (README — Drive SOP).
 */
export function pickFileName(
  pick: string,
  request: Pick<ResumeRenderRequest, "variant" | "template">
): string {
  return `resume-${pick}-${request.variant}-${request.template}.pdf`
}

export type RenderPort = (
  request: ResumeRenderRequest,
  signal: AbortSignal
) => Promise<ResumeRenderOutcome>

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

function step(
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
  /**
   * Starts a render, superseding any in flight. Never rejects. `filename`,
   * when given, replaces the name the service gave the PDF.
   */
  readonly build: (request: ResumeRenderRequest, filename?: string) => void
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
    build: (request, filename): void => {
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
                  filename: filename ?? outcome.filename,
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
