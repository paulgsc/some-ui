/**
 * The mailbox's whole request-to-answer logic, with no I/O of its own: the
 * clock, the logger and storage come in as `Deps`, so it runs unchanged in
 * Node tests against an in-memory `Store`.
 *
 * The invariants this file governs (full text: README.md, "Gray-area
 * invariants"):
 *
 * - MB1: an item is never updated or deleted (`store.ts`, `migrations/`).
 * - MB2: `ROLES` is the one place a token is mapped to what it may do.
 * - MB3: no token reaches the repo or a log.
 * - MB4: the Cloudflare account has no payment method (account state, not
 *   reviewable).
 */

import type { Folder, ItemMeta, Role, Store } from "./store"

/** Most bytes one item may hold. Real files are under 20 KB; D1's row cap is 2 MB. */
export const MAX_BODY_BYTES = 1_048_576
const LIST_LIMIT_DEFAULT = 50
export const LIST_LIMIT_MAX = 50

type FolderRules = {
  readonly folder: Folder
  /** Anchored: a name outside it is refused. Voice notes match none, on purpose. */
  readonly name: RegExp
  /** The top-level `schema` a body must carry. */
  readonly schema: string
}

const FOLDERS: ReadonlyArray<FolderRules> = [
  {
    folder: "brief",
    name: /^digest-\d{4}-\d{2}-\d{2}\.json$/,
    schema: "some-ui.job-digest/1",
  },
  {
    folder: "decisions",
    name: /^decisions-\d{4}-\d{2}-\d{2}(-\d+)?\.json$/,
    schema: "some-ui.job-decisions/1",
  },
  {
    folder: "scout",
    name: /^scouts-\d{8}T\d{6}\.json$/,
    schema: "some-ui.job-scouts/1",
  },
]

/** The Worker secrets. An unset or empty one never authenticates anyone. */
type Tokens = {
  readonly routine: string | undefined
  readonly home: string | undefined
}

type Grant = {
  readonly role: Role
  readonly token: (tokens: Tokens) => string | undefined
  readonly get: ReadonlyArray<Folder>
  readonly put: ReadonlyArray<Folder>
}

/** MB2. A third role (the phone's, D3) is the owner's call, not a code change. */
const ROLES: ReadonlyArray<Grant> = [
  {
    role: "routine",
    token: (tokens) => tokens.routine,
    get: ["brief", "decisions", "scout"],
    put: ["brief"],
  },
  {
    role: "home",
    token: (tokens) => tokens.home,
    get: ["brief"],
    put: ["decisions", "scout"],
  },
]

export type Deps = {
  readonly tokens: Tokens
  readonly store: Store
  readonly now: () => Date
  /** Told of a storage failure. Never given the request (MB3). */
  readonly report: (error: unknown) => void
}

// ── Answers ──────────────────────────────────────────────────────────────

function answer(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  })
}

function refuse(
  status: number,
  error: string,
  headers: Record<string, string> = {}
): Response {
  return answer(status, { error }, headers)
}

// ── Tokens ───────────────────────────────────────────────────────────────

async function digest(text: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return new Uint8Array(hash)
}

/**
 * Compares two digests without stopping at the first difference. Tokens are
 * hashed first, so what is compared is always 32 bytes: its length says
 * nothing about a token's, and an attacker cannot steer a byte of it.
 * (`crypto.subtle.timingSafeEqual` is Workers-only, so it is not used.)
 */
function sameDigest(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (const [index, byte] of a.entries()) {
    difference |= byte ^ (b.at(index) ?? 0)
  }
  return difference === 0
}

async function authenticate(
  header: string | null,
  tokens: Tokens
): Promise<Grant | null> {
  const presented = header?.match(/^bearer (\S+)$/i)?.at(1)
  if (presented === undefined) return null
  // One secret set twice would hand the home token the routine's rights.
  if (tokens.routine !== undefined && tokens.routine === tokens.home) {
    return null
  }
  const wanted = await digest(presented)
  let found: Grant | null = null
  for (const grant of ROLES) {
    const token = grant.token(tokens)
    if (token === undefined || token === "") continue
    // Every role is compared, so the time does not say which one matched.
    const matches = sameDigest(wanted, await digest(token))
    if (matches && found === null) found = grant
  }
  return found
}

// ── Routes ───────────────────────────────────────────────────────────────

type Route = {
  readonly rules: FolderRules
  /** `null` for a folder's listing. */
  readonly name: string | null
  readonly methods: ReadonlyArray<string>
}

/** `/v1/:folder/items` and `/v1/:folder/items/:name`; anything else is no route. */
function routeOf(pathname: string): Route | null {
  const [lead, version, folder, items, name, ...rest] = pathname.split("/")
  if (lead !== "" || version !== "v1" || items !== "items") return null
  if (rest.length > 0 || name === "") return null
  const rules = FOLDERS.find((candidate) => candidate.folder === folder)
  if (rules === undefined) return null
  return name === undefined
    ? { rules, name: null, methods: ["GET"] }
    : { rules, name, methods: ["GET", "PUT"] }
}

function wholeNumber(text: string | null, fallback: number): number | null {
  if (text === null) return fallback
  if (!/^\d{1,15}$/.test(text)) return null
  return Number(text)
}

async function list(
  url: URL,
  rules: FolderRules,
  store: Store
): Promise<Response> {
  const after = wholeNumber(url.searchParams.get("after"), 0)
  const limit = wholeNumber(url.searchParams.get("limit"), LIST_LIMIT_DEFAULT)
  if (after === null) return refuse(422, "after must be a whole number")
  if (limit === null || limit < 1 || limit > LIST_LIMIT_MAX) {
    return refuse(
      422,
      `limit must be a whole number from 1 to ${LIST_LIMIT_MAX}`
    )
  }
  const items = await store.list(rules.folder, after, limit)
  return answer(200, { items: items.map(describe) })
}

/** Exactly these fields, whatever else a store returns (never a body). */
function describe(item: ItemMeta): ItemMeta {
  const { seq, name, size, sha256, contentType, putAt } = item
  return { seq, name, size, sha256, contentType, putAt }
}

async function read(
  rules: FolderRules,
  name: string,
  store: Store
): Promise<Response> {
  const item = rules.name.test(name)
    ? await store.get(rules.folder, name)
    : null
  if (item === null) return refuse(404, "not_found")
  return new Response(item.bytes, {
    status: 200,
    headers: {
      "content-type": item.contentType,
      etag: `"${item.sha256}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })
}

// ── Writing ──────────────────────────────────────────────────────────────

function isJsonType(contentType: string | null): boolean {
  const mediaType = contentType?.split(";").at(0)?.trim().toLowerCase()
  return mediaType === "application/json"
}

/** The body's bytes, or `null` as soon as it is past `cap`. */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  cap: number
): Promise<Uint8Array | null> {
  if (body === null) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function parseJson(
  bytes: Uint8Array
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    // A byte-order mark stays in the text, where JSON.parse refuses it: the
    // stored bytes are exactly what was sent.
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes)
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function write(
  request: Request,
  rules: FolderRules,
  name: string,
  role: Role,
  deps: Deps
): Promise<Response> {
  if (!rules.name.test(name)) {
    return refuse(422, "the name does not fit this folder")
  }
  if (!isJsonType(request.headers.get("content-type"))) {
    return refuse(422, "the content type must be application/json")
  }
  // The declared length refuses a big body before a byte of it is read; the
  // capped read below covers a body that declares nothing or lies.
  const declared = request.headers.get("content-length")
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return refuse(413, "too_big")
  }
  let bytes: Uint8Array | null
  try {
    bytes = await readCapped(request.body, MAX_BODY_BYTES)
  } catch {
    return refuse(422, "the body could not be read")
  }
  if (bytes === null) return refuse(413, "too_big")

  const parsed = parseJson(bytes)
  if (!parsed.ok) return refuse(422, "the body is not JSON")
  if (!isRecord(parsed.value) || parsed.value.schema !== rules.schema) {
    return refuse(422, `the body's schema must be ${rules.schema}`)
  }

  const result = await deps.store.put(rules.folder, name, {
    bytes,
    sha256: await sha256Hex(bytes),
    contentType: "application/json",
    putBy: role,
    putAt: deps.now().toISOString(),
  })
  if (result.change === "conflict") return refuse(409, "conflict")
  return answer(result.change === "added" ? 201 : 200, {
    change: result.change,
    seq: result.seq,
  })
}

// ── Entry ────────────────────────────────────────────────────────────────

async function serve(
  request: Request,
  grant: Grant,
  deps: Deps
): Promise<Response> {
  const url = new URL(request.url)
  const route = routeOf(url.pathname)
  if (route === null) return refuse(404, "not_found")
  if (!route.methods.includes(request.method)) {
    return refuse(405, "method_not_allowed", {
      allow: route.methods.join(", "),
    })
  }
  const { rules, name } = route
  if (request.method === "GET") {
    if (!grant.get.includes(rules.folder)) return refuse(403, "forbidden")
    return name === null
      ? list(url, rules, deps.store)
      : read(rules, name, deps.store)
  }
  // The route allows only GET and PUT, and a listing only GET: this is a PUT.
  if (name === null || !grant.put.includes(rules.folder)) {
    return refuse(403, "forbidden")
  }
  return write(request, rules, name, grant.role, deps)
}

/**
 * Every request needs a token, and a missing or wrong one is answered before
 * the store is touched, so someone without a token cannot spend D1 quota.
 */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const grant = await authenticate(
    request.headers.get("authorization"),
    deps.tokens
  )
  if (grant === null) {
    return refuse(401, "unauthorized", { "www-authenticate": "Bearer" })
  }
  try {
    return await serve(request, grant, deps)
  } catch (error) {
    // D1 over its daily limit fails every query until 00:00 UTC.
    deps.report(error)
    return refuse(503, "unavailable")
  }
}
