/**
 * `file_host`'s route table, in-process: a method and a path template
 * (`/shelf/:activity/:key`) map to a handler that answers a `Response`.
 *
 * Paths are written exactly as `routes.server.json` spells them, without the
 * `/api/v1` prefix, so a route here can be checked against the server's own
 * inventory by string equality (`__tests__/router.test.ts` does).
 *
 * A request no route matches answers a plain-text `404`, which is what
 * `file_host` answers for a path it does not serve (`metrics/http.rs`) - so
 * a client feature the device backend has not implemented fails the way it
 * would against a server too old to have it, not with a transport error.
 */
import type { SqlDriver } from "@/lib/device-backend/sql"

export type DeviceRequest = {
  method: string
  /** Path params, URI-decoded. */
  params: Record<string, string>
  query: URLSearchParams
  /** The raw request body; `""` when there was none. */
  body: string
}

export type DeviceContext = {
  db: SqlDriver
  /** Wall-clock milliseconds; a seam so tests can pin time. */
  now: () => number
}

export type DeviceHandler = (
  request: DeviceRequest,
  context: DeviceContext
) => Promise<Response>

export type DeviceRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  handler: DeviceHandler
}

/** The fixed messages `error.rs` pairs with each code. */
const MESSAGES: Partial<Record<string, string>> = {
  unauthorized: "authentication required",
  forbidden: "user may not perform that action",
  not_found: "request path not found",
  unprocessable_entity: "error in request body",
  max_record_limit_exceeded: "maximum record limit exceeded",
  feature_not_configured: "feature not configured on this deployment",
  operation_error: "internal server error",
}

/** Field -> problems, as `error.rs` reports them on a `422`. */
export type ErrorDetails = Record<string, Array<string>>

/**
 * `file_host`'s error envelope (`error.rs` `ErrorEnvelope`):
 * `{ "error": { "code", "message", "details"? } }`. `message` defaults to
 * the fixed text `error.rs` gives the code; `409 conflict` carries its own.
 */
export function errorResponse(
  status: number,
  code: string,
  options: { message?: string; details?: ErrorDetails } = {}
): Response {
  const message = options.message ?? MESSAGES[code] ?? "internal server error"
  return json(status, {
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  })
}

export const notFound = (): Response => errorResponse(404, "not_found")

export const unprocessable = (details: ErrorDetails): Response =>
  errorResponse(422, "unprocessable_entity", { details })

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

/** A stored JSON document, verbatim - the bytes are the contract. */
export function verbatim(body: string, etag?: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(etag === undefined ? {} : { etag: `"${etag}"` }),
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * axum's `Json` extractor rejects a body it cannot read with a plain-text
 * status and no envelope: `400` for a syntax error, `422` for a shape error.
 * `readJson` returns that rejection, or the parsed value.
 */
export function readJson(
  body: string
): { ok: true; value: unknown } | { ok: false; response: Response } {
  try {
    const value: unknown = JSON.parse(body)
    return { ok: true, value }
  } catch {
    return {
      ok: false,
      response: plainText(400, "Failed to parse the request body as JSON"),
    }
  }
}

export function plainText(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

/** Rejects a body whose shape a `Json<T>` extractor would not deserialize. */
export const shapeRejected = (reason: string): Response =>
  plainText(
    422,
    `Failed to deserialize the JSON body into the target type: ${reason}`
  )

type Compiled = DeviceRoute & { segments: Array<string> }

function split(path: string): Array<string> {
  return path.split("/").filter((segment) => segment !== "")
}

/**
 * Literal segments beat parameters, so `/sessions/status` is never read as
 * `/sessions/:id` - the same precedence axum's router gives them.
 */
function specificity(route: Compiled): Array<number> {
  return route.segments.map((segment) => (segment.startsWith(":") ? 0 : 1))
}

function moreSpecific(a: Compiled, b: Compiled): number {
  const sa = specificity(a)
  const sb = specificity(b)
  for (let index = 0; index < Math.max(sa.length, sb.length); index++) {
    const diff = (sb[index] ?? 0) - (sa[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export type DeviceRouter = {
  routes: ReadonlyArray<DeviceRoute>
  handle: (
    method: string,
    path: string,
    query: URLSearchParams,
    body: string,
    context: DeviceContext
  ) => Promise<Response>
}

export function createRouter(routes: ReadonlyArray<DeviceRoute>): DeviceRouter {
  const compiled: Array<Compiled> = routes
    .map((route) => ({ ...route, segments: split(route.path) }))
    .sort(moreSpecific)

  return {
    routes,
    handle: async (method, path, query, body, context): Promise<Response> => {
      const segments = split(path)
      let pathMatched = false
      for (const route of compiled) {
        if (route.segments.length !== segments.length) continue
        const params: Record<string, string> = {}
        const matches = route.segments.every((segment, index) => {
          const actual = segments[index] ?? ""
          if (segment.startsWith(":")) {
            params[segment.slice(1)] = decodeURIComponent(actual)
            return true
          }
          return segment === actual
        })
        if (!matches) continue
        pathMatched = true
        if (route.method !== method.toUpperCase()) continue
        return route.handler({ method, params, query, body }, context)
      }
      return pathMatched
        ? plainText(405, "method not allowed")
        : plainText(404, "not found")
    },
  }
}
