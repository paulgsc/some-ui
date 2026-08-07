/**
 * @module contract
 *
 * The vocabulary for writing down a boundary handshake.
 *
 * A `Contract` is one statement of the form "when I send *this*, I expect
 * *that* back". It is deliberately not derived from either side: not generated
 * from the Rust types, and not inferred from the client's call sites. Both of
 * those would make the check circular — a generated expectation agrees with
 * the thing it was generated from by construction, which is precisely the
 * property you do not want in an oracle.
 *
 * So contracts are written by hand, and they encode what the *client* believes.
 * The runner's job is to find out whether the server agrees.
 */

import type { z } from "zod"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/**
 * What to do about fields the server sends that the contract does not declare.
 *
 * `report` is the default and the interesting one. zod strips unknown keys
 * silently, so a server that grows a field is invisible to ordinary schema
 * validation — the client keeps passing while drifting further from the truth.
 * Reporting surfaces the growth without failing the run.
 *
 * `reject` treats an undeclared field as a failure. Use it on endpoints where
 * the payload shape is the contract (a stable public response), not on ones
 * that are expected to accrete fields.
 */
export type UnknownFieldPolicy = "report" | "reject" | "ignore"

export type ContractRequest = {
  /**
   * Bindings for `:name` segments in the path template. Every placeholder must
   * get a value and every value must correspond to a placeholder — the runner
   * reports both directions, because a silently unbound `:id` produces a
   * request for the literal path `/mood_events/:id`, which the server answers
   * with a 404 that looks like a missing route rather than a client bug.
   */
  path?: Readonly<Record<string, string | number>>
  query?: Readonly<Record<string, string | number>>
  body?: unknown
  headers?: Readonly<Record<string, string>>
}

export type ContractExpectation<TResponse> = {
  /** Accepted status code(s). A response outside this set is a finding. */
  status: number | ReadonlyArray<number>
  /**
   * The shape the client believes it receives. Omit for endpoints where the
   * body is not JSON (audio streams, images) — the runner then checks only
   * transport and status.
   */
  schema?: z.ZodType<TResponse>
  /**
   * Which of the accepted statuses `schema` describes. Defaults to all of them,
   * which is right for single-status contracts and wrong the moment a contract
   * accepts both a success and a miss: a 404 body is an error envelope, and
   * checking it against the success schema would report a violation that says
   * nothing about the boundary.
   */
  schemaFor?: number | ReadonlyArray<number>
  /** Defaults to `report`. */
  unknownFields?: UnknownFieldPolicy
}

export type Contract<TResponse = unknown> = {
  /** Stable identifier, `module.operation`. Used to select and to report. */
  id: string
  /** Must match a `module` in the server's route inventory. */
  module: string
  method: HttpMethod
  /**
   * Path template as the server registers it — no `/api/v1` prefix, axum
   * `:name` parameter syntax. Kept in the server's own notation so drift
   * checking is a string comparison rather than a translation with its own
   * bugs.
   */
  path: string
  /** Whether the server nests this under `/api/v1`. Defaults to `true`. */
  versioned?: boolean
  /** One line on what handshake this pins down. Shown in reports. */
  summary: string
  request?: ContractRequest
  expect: ContractExpectation<TResponse>
  /**
   * Marks a contract that writes. Skipped unless `--include-mutations` is
   * passed, so the default run is safe to point at a server you care about.
   */
  mutates?: boolean
  /** Set to a reason to skip. The contract still appears in the report. */
  skip?: string
}

/**
 * Identity function that exists for inference: it pins `TResponse` to the
 * schema so `expect.schema` and the declared response type cannot drift apart
 * within a single contract.
 */
export function defineContract<TResponse>(
  contract: Contract<TResponse>
): Contract<TResponse> {
  return contract
}

export const API_V1_PREFIX = "/api/v1"

/** The path a client actually requests, prefix resolved. */
export function fullPath(
  contract: Pick<Contract, "path" | "versioned">
): string {
  return contract.versioned === false
    ? contract.path
    : `${API_V1_PREFIX}${contract.path}`
}

const PLACEHOLDER = /:([A-Za-z_][A-Za-z0-9_]*)/g

export type PathBinding = {
  /** Path with placeholders substituted, ready to request. */
  path: string
  /** Placeholders in the template that no binding was supplied for. */
  unbound: Array<string>
  /** Bindings supplied that match no placeholder in the template. */
  unused: Array<string>
}

/**
 * Substitutes `:name` segments.
 *
 * This is modelled as a first-class step rather than folded into URL
 * construction on purpose. In the client, `apiUrl()` returns a URL still
 * carrying its `:id` placeholder and substitution happens later inside
 * `createQueryHook`, which means the path a request actually uses is not
 * knowable where the endpoint is declared. A contract that captured a `URL`
 * would therefore only ever be able to describe parameterless routes. Keeping
 * template and bindings separate lets a contract describe a parameterised
 * route and lets the runner report a binding mistake as a binding mistake.
 */
export function bindPath(
  template: string,
  params: Readonly<Record<string, string | number>> = {}
): PathBinding {
  const seen = new Set<string>()

  const path = template.replace(PLACEHOLDER, (match, name: string) => {
    seen.add(name)
    const value = params[name]
    if (value === undefined) return match
    return encodeURIComponent(String(value))
  })

  const unbound = [...seen].filter((name) => params[name] === undefined)
  const unused = Object.keys(params).filter((name) => !seen.has(name))

  return { path, unbound, unused }
}

/** Builds the request URL, query string included. */
export function requestUrl(
  baseUrl: string,
  boundPath: string,
  query: Readonly<Record<string, string | number>> = {}
): URL {
  const url = new URL(boundPath, baseUrl)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.append(key, String(value))
  }
  return url
}

export function acceptedStatuses(contract: Contract): Array<number> {
  const { status } = contract.expect
  return typeof status === "number" ? [status] : [...status]
}

/** Statuses whose body the declared schema is expected to describe. */
export function schemaStatuses(contract: Contract): Array<number> {
  const { schemaFor } = contract.expect
  if (schemaFor === undefined) return acceptedStatuses(contract)
  return typeof schemaFor === "number" ? [schemaFor] : [...schemaFor]
}
