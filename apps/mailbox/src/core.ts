/**
 * The mailbox's whole request-to-answer logic, with no I/O of its own: the
 * clock, the logger and storage come in as `Deps`, so it runs unchanged in
 * Node tests against an in-memory `Store`.
 *
 * The invariants this file governs (full text: README.md, "Gray-area
 * invariants"):
 *
 * - MB1: an item never changes, and leaves `item` only into `archived`
 *   (`store.ts`, `migrations/`).
 * - MB2: `ROLES` is the one place a token is mapped to what it may do.
 * - MB3: no token reaches the repo or a log.
 * - MB4: the Cloudflare account has no payment method (account state, not
 *   reviewable).
 */

import type { Folder, Role, Store } from "./store"

/** Most bytes one item may hold. Real files are under 20 KB; D1's row cap is 2 MB. */
export const MAX_BODY_BYTES = 1_048_576
const LIST_LIMIT_DEFAULT = 50
export const LIST_LIMIT_MAX = 50

/**
 * The youngest an item may be archived at, counted from when it went live.
 * Home's own policy waits longer; this floor holds even if the archive token
 * leaks, and keeps an item just put back from going straight home again.
 */
export const ARCHIVE_MIN_AGE_DAYS = 30
const DAY_MS = 86_400_000

const SHA256_HEX = /^[0-9a-f]{64}$/

type FolderRules = {
  readonly folder: Folder
  /** Voice notes match none, on purpose. */
  readonly name: RegExp
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
  {
    // The routine's answer to a study reflection (`<date>_<session>_<id>`),
    // `-2` and on for a second reflection under one name.
    folder: "scene",
    name: /^scene-\d{4}-\d{2}-\d{2}_[a-z0-9-]{1,40}_[0-9A-Za-z-]{1,8}(-\d+)?\.json$/,
    schema: "some-ui.routine-scene/1",
  },
  {
    // The routine's answer to a drama prompt, named as the prompt is.
    folder: "drama",
    name: /^drama-\d{8}T\d{9}Z\.json$/,
    schema: "some-ui.routine-drama/1",
  },
]

/** The Worker secrets. An unset or empty one never authenticates anyone. */
type Tokens = {
  readonly routine: string | undefined
  readonly home: string | undefined
  readonly archive: string | undefined
}

type Grant = {
  readonly role: Role
  readonly token: (tokens: Tokens) => string | undefined
  /** List and read live items. */
  readonly get: ReadonlyArray<Folder>
  /** Put new items. */
  readonly put: ReadonlyArray<Folder>
  /** List archived items and ask for one back. */
  readonly ask: ReadonlyArray<Folder>
  /** Archive items, put archived ones back, and list the asks. */
  readonly move: ReadonlyArray<Folder>
}

const ALL: ReadonlyArray<Folder> = [
  "brief",
  "decisions",
  "scout",
  "scene",
  "drama",
]

/** MB2. Another role (the phone's, say) is the owner's call, not a code change. */
const ROLES: ReadonlyArray<Grant> = [
  {
    role: "routine",
    token: (tokens) => tokens.routine,
    get: ALL,
    put: ["brief", "scene", "drama"],
    ask: ALL,
    move: [],
  },
  {
    role: "home",
    token: (tokens) => tokens.home,
    get: ["brief", "scene", "drama"],
    put: ["decisions", "scout"],
    ask: [],
    move: [],
  },
  {
    role: "archive",
    token: (tokens) => tokens.archive,
    get: ALL,
    put: [],
    ask: [],
    move: ALL,
  },
]

export type Deps = {
  readonly tokens: Tokens
  readonly store: Store
  readonly now: () => Date
  /** Told of a storage failure. */
  readonly report: (error: unknown) => void
}

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

async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

/**
 * Compares two digests without stopping at the first difference. Tokens are
 * hashed first, so what is compared is always 32 bytes, whatever the token's
 * length. (`crypto.subtle.timingSafeEqual` is Workers-only, so it is not used.)
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
  // One secret set for two roles would hand one the other's rights.
  const set = ROLES.map((grant) => grant.token(tokens)).filter(
    (token) => token !== undefined && token !== ""
  )
  if (new Set(set).size !== set.length) return null
  const wanted = await sha256(presented)
  let found: Grant | null = null
  for (const grant of ROLES) {
    const token = grant.token(tokens)
    if (token === undefined || token === "") continue
    // Every role is compared, so the time does not say which one matched.
    const matches = sameDigest(wanted, await sha256(token))
    if (matches && found === null) found = grant
  }
  return found
}

type Collection = "items" | "archived" | "wanted"

type Route = {
  readonly rules: FolderRules
  readonly collection: Collection
  /** `null` for a listing. */
  readonly name: string | null
  readonly methods: ReadonlyArray<string>
}

/** Each collection's methods, for a listing and for one name. */
const METHODS: Record<
  Collection,
  {
    readonly listing: ReadonlyArray<string>
    readonly one: ReadonlyArray<string>
  }
> = {
  items: { listing: ["GET"], one: ["GET", "PUT", "DELETE"] },
  archived: { listing: ["GET"], one: [] },
  wanted: { listing: ["GET"], one: ["PUT"] },
}

function isCollection(text: string | undefined): text is Collection {
  return text === "items" || text === "archived" || text === "wanted"
}

/** `/v1/:folder/:collection` and `/v1/:folder/:collection/:name`; anything else is no route. */
function routeOf(pathname: string): Route | null {
  const [lead, version, folder, collection, name, ...rest] = pathname.split("/")
  if (lead !== "" || version !== "v1" || !isCollection(collection)) {
    return null
  }
  if (rest.length > 0 || name === "") return null
  const rules = FOLDERS.find((candidate) => candidate.folder === folder)
  if (rules === undefined) return null
  const methods =
    name === undefined ? METHODS[collection].listing : METHODS[collection].one
  if (methods.length === 0) return null
  return { rules, collection, name: name ?? null, methods }
}

/** For a switch that has handled every case the types allow. */
function unreachable(value: never): never {
  throw new Error(`unhandled case: ${String(value)}`)
}

function wholeNumber(text: string | null, fallback: number): number | null {
  if (text === null) return fallback
  if (!/^\d{1,15}$/.test(text)) return null
  return Number(text)
}

type Page = { readonly after: number; readonly limit: number }

function pageOf(url: URL): Page | Response {
  const after = wholeNumber(url.searchParams.get("after"), 0)
  const limit = wholeNumber(url.searchParams.get("limit"), LIST_LIMIT_DEFAULT)
  if (after === null) return refuse(422, "after must be a whole number")
  if (limit === null || limit < 1 || limit > LIST_LIMIT_MAX) {
    return refuse(
      422,
      `limit must be a whole number from 1 to ${LIST_LIMIT_MAX}`
    )
  }
  return { after, limit }
}

async function list(
  url: URL,
  collection: Collection,
  folder: Folder,
  store: Store
): Promise<Response> {
  const page = pageOf(url)
  if (page instanceof Response) return page
  const { after, limit } = page
  switch (collection) {
    case "items": {
      return answer(200, { items: await store.list(folder, after, limit) })
    }
    case "archived": {
      return answer(200, {
        items: await store.listArchived(folder, after, limit),
      })
    }
    case "wanted": {
      return answer(200, { items: await store.listWanted(folder, limit) })
    }
    default: {
      return unreachable(collection)
    }
  }
}

async function read(
  rules: FolderRules,
  name: string,
  store: Store
): Promise<Response> {
  if (!rules.name.test(name)) return refuse(404, "not_found")
  const item = await store.get(rules.folder, name)
  if (item === null) {
    const archived = await store.archivedOf(rules.folder, name)
    if (archived === null) return refuse(404, "not_found")
    return answer(410, { error: "archived", archivedAt: archived.archivedAt })
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type Body = { readonly bytes: Uint8Array; readonly sha256: string }

/** The body of a put, checked as every put is, or the refusal. */
async function bodyOf(
  request: Request,
  rules: FolderRules,
  name: string
): Promise<Body | Response> {
  if (!rules.name.test(name)) {
    return refuse(422, "the name does not fit this folder")
  }
  if (!isJsonType(request.headers.get("content-type"))) {
    return refuse(422, "the content type must be application/json")
  }
  // The declared length refuses before a byte is read; the capped read below
  // covers a body that declares nothing or lies.
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
  return { bytes, sha256: hex(await sha256(bytes)) }
}

async function write(
  request: Request,
  rules: FolderRules,
  name: string,
  role: Role,
  deps: Deps
): Promise<Response> {
  // The archive role puts nothing new (ROLES); `serve` routes its puts to `restore`.
  if (role === "archive") return refuse(403, "forbidden")
  const body = await bodyOf(request, rules, name)
  if (body instanceof Response) return body
  const result = await deps.store.put(rules.folder, name, {
    ...body,
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

/** Home puts an archived item's own bytes back; any other bytes are refused. */
async function restore(
  request: Request,
  rules: FolderRules,
  name: string,
  deps: Deps
): Promise<Response> {
  const body = await bodyOf(request, rules, name)
  if (body instanceof Response) return body
  const result = await deps.store.restore(
    rules.folder,
    name,
    body.bytes,
    body.sha256,
    deps.now().toISOString()
  )
  switch (result.change) {
    case "restored":
    case "unchanged": {
      return answer(result.change === "restored" ? 201 : 200, {
        change: result.change,
        seq: result.seq,
      })
    }
    case "not_archived": {
      return refuse(404, "not_found")
    }
    case "mismatch": {
      return refuse(409, "conflict")
    }
    default: {
      return unreachable(result)
    }
  }
}

/** `If-Match: "<sha256>"`: archiving names the bytes it means to drop. */
function matchOf(request: Request): string | null {
  const tag = request.headers.get("if-match")?.trim()
  const sha = tag?.match(/^"([^"]*)"$/)?.at(1)
  return sha !== undefined && SHA256_HEX.test(sha) ? sha : null
}

async function archive(
  request: Request,
  rules: FolderRules,
  name: string,
  deps: Deps
): Promise<Response> {
  if (!rules.name.test(name)) return refuse(404, "not_found")
  const sha = matchOf(request)
  if (sha === null) {
    return refuse(428, 'If-Match must name the item\'s sha256, as "<hex>"')
  }
  const now = deps.now()
  const result = await deps.store.archive(
    rules.folder,
    name,
    sha,
    now.toISOString(),
    new Date(now.getTime() - ARCHIVE_MIN_AGE_DAYS * DAY_MS).toISOString()
  )
  switch (result.change) {
    case "archived":
    case "unchanged": {
      return answer(200, { change: result.change })
    }
    case "absent": {
      return refuse(404, "not_found")
    }
    case "mismatch": {
      return refuse(412, "mismatch")
    }
    case "too_young": {
      return refuse(
        422,
        `an item is archived only after ${ARCHIVE_MIN_AGE_DAYS} days live`
      )
    }
    default: {
      return unreachable(result.change)
    }
  }
}

/** The routine asks home to put an archived item back. */
async function ask(
  rules: FolderRules,
  name: string,
  deps: Deps
): Promise<Response> {
  if (!rules.name.test(name)) return refuse(404, "not_found")
  const result = await deps.store.ask(
    rules.folder,
    name,
    deps.now().toISOString()
  )
  switch (result.change) {
    case "asked": {
      return answer(202, { change: result.change })
    }
    case "unchanged":
    case "live": {
      return answer(200, { change: result.change })
    }
    case "not_archived": {
      return refuse(404, "not_found")
    }
    default: {
      return unreachable(result.change)
    }
  }
}

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
  const { rules, collection, name } = route
  const { folder } = rules
  const may = (rights: ReadonlyArray<Folder>): boolean =>
    rights.includes(folder)
  if (name === null) {
    // Every listing is a GET (`METHODS`).
    const rights = { items: grant.get, archived: grant.ask, wanted: grant.move }
    if (!may(rights[collection])) return refuse(403, "forbidden")
    return list(url, collection, folder, deps.store)
  }
  if (collection === "wanted") {
    // A PUT, the only method on one ask.
    if (!may(grant.ask)) return refuse(403, "forbidden")
    return ask(rules, name, deps)
  }
  if (request.method === "GET") {
    if (!may(grant.get)) return refuse(403, "forbidden")
    return read(rules, name, deps.store)
  }
  if (request.method === "DELETE") {
    if (!may(grant.move)) return refuse(403, "forbidden")
    return archive(request, rules, name, deps)
  }
  // The route allows only GET, PUT and DELETE on an item: this is a PUT. A
  // role that moves puts back; one that puts adds.
  if (may(grant.move)) return restore(request, rules, name, deps)
  if (!may(grant.put)) return refuse(403, "forbidden")
  return write(request, rules, name, grant.role, deps)
}

/** A missing or wrong token is answered before the store is touched: no D1 quota for strangers. */
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
    deps.report(error)
    return refuse(503, "unavailable")
  }
}
