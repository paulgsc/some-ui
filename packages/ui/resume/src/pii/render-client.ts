// The client half of scripts/serve.mjs: one POST with the request, the PDF or
// the service's reason back. In this package because apps/www/src makes no
// request outside its choke points (docs/learner-data-authority.md, LA1).
import type { Pii } from "./index"

export type ResumeRenderRequest = {
  readonly variant: string
  readonly template: string
  readonly pii: Pii
}

/** What a render came to. A refusal's message is the person's to read. */
export type ResumeRenderOutcome =
  | { readonly kind: "pdf"; readonly pdf: Blob; readonly filename: string }
  | { readonly kind: "refused"; readonly message: string }

const UNREACHABLE =
  "The résumé service is not reachable. It runs on the home network only: " +
  "start it with `docker compose up -d --build resume-render`."

/** The service's `{ error }`, or null for a body that is not one. */
async function reasonOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    return typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
      ? body.error
      : null
  } catch {
    return null
  }
}

/**
 * Renders on the service behind `endpoint` (apps/www's same-origin proxy).
 * Never rejects: an unreachable service, an abort included, is a refusal.
 */
export async function renderResume(
  endpoint: string,
  request: ResumeRenderRequest,
  signal: AbortSignal
): Promise<ResumeRenderOutcome> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
      cache: "no-store",
    })
  } catch {
    return { kind: "refused", message: UNREACHABLE }
  }
  if (response.ok) {
    return {
      kind: "pdf",
      pdf: await response.blob(),
      filename: `resume-${request.variant}-${request.template}.pdf`,
    }
  }
  // Anything but the service's own JSON is nginx's: a 502 when the service
  // is down, or a refusal of its own.
  const reason = await reasonOf(response)
  if (reason !== null) return { kind: "refused", message: reason }
  return {
    kind: "refused",
    message:
      response.status >= 502
        ? UNREACHABLE
        : `The résumé service answered ${response.status}.`,
  }
}
