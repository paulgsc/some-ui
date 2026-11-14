// The calls record (ST37, #2637; CLAUDE.md, "Two kinds of pull request"):
// `docs/calls/<ID>.json`, one file per gray-area call an agent or the owner
// made, with whose authority it rests on, why it was gray, the options and how
// to undo it. A later session finds a call by the paths it governs; the weekly
// call reads the week's new ones (`packages/video-render/src/call-facts.ts`).
// One file per call, so two pull requests that each add one never touch the
// same file (#2976).
//
// What this module holds, as pure functions over the files' text (reading
// them from the tree or a commit is `calls-record.ts`):
//
// - **Files.** Every file in the folder is `C<n>.json`, holding one entry
//   whose id is that name; the record is the entries in id order.
// - **Shape.** Every entry has each field, in its type; ids are `C<n>`,
//   unique; days are `YYYY-MM-DD`; `by` is `claude` or `owner`; `agreed` is
//   only on a Claude call, and never before the day it was made; `options`
//   and `gray` may be left out only of the owner's own call, where they are
//   the owner's to give, then or later; `moves` names another call in the
//   record (in the legacy array, one listed before it).
// - **Append-only against the base branch.** A call the base holds, in
//   either layout, is still here with every field unchanged, except that a Claude call may gain the
//   day the owner agreed to it, and the owner's own call its options and why
//   it was gray. A later change to what a call chose is not an
//   edit here: it is a story, a new entry that names the one it moves.
//
// Whether a call is gray at all, and whether an entry says it truly, is
// review's. `scripts/check-calls.ts` runs this in pr.yml's `guards` job and
// root `pnpm lint`.

/** The folder that holds the record, one `<ID>.json` per call. */
export const CALLS_DIR = "docs/calls"
/**
 * The record's one-array file until #2976: a commit from before then holds
 * it, and is read as it was.
 */
export const LEGACY_CALLS_FILE = "docs/calls.json"
/** The legacy file's schema. A file in the folder is the bare entry. */
export const CALLS_SCHEMA = "some-ui.calls/1"

/** Whose authority a call rests on. */
type CallBy = "claude" | "owner"

export type Call = {
  readonly id: string
  /** The day it was made. */
  readonly made: string
  readonly by: CallBy
  /** For a Claude call, the day the owner said they agreed. */
  readonly agreed?: string
  /**
   * The paths it governs: this repo's (bare or `some-ui:<path>`), or
   * `server:<path>` and `testing:<path>` for paulgsc/server's and paulgsc/testing's.
   */
  readonly paths: ReadonlyArray<string>
  /** What was chosen. */
  readonly chose: string
  /**
   * Every option it chose between, the one taken included. Only the
   * owner's call may leave them out.
   */
  readonly options?: ReadonlyArray<string>
  /** Why no check, convention or earlier decision settled it; as `options`. */
  readonly gray?: string
  readonly undo: string
  /** The issues and pull requests it was made in: `#2623`, `server#731`, `testing#6`. */
  readonly refs: ReadonlyArray<string>
  /** The earlier call this one moves, if any. */
  readonly moves?: string
}

export type CallsFinding =
  | { readonly kind: "unreadable"; readonly why: string }
  | {
      readonly kind: "unreadableFile"
      readonly name: string
      readonly why: string
    }
  | { readonly kind: "stray"; readonly name: string }
  | { readonly kind: "misnamed"; readonly name: string; readonly id: string }
  | { readonly kind: "legacyBeside" }
  | { readonly kind: "badEntry"; readonly at: string; readonly why: string }
  | { readonly kind: "duplicateId"; readonly id: string }
  | { readonly kind: "dropped"; readonly id: string }
  | { readonly kind: "rewritten"; readonly id: string; readonly field: string }

const ID = /^C[1-9]\d*$/
const FILE_NAME = /^C[1-9]\d*\.json$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const REF = /^(?:server|testing)?#[1-9]\d*$/
const FIELDS = new Set([
  "id",
  "made",
  "by",
  "agreed",
  "paths",
  "chose",
  "options",
  "gray",
  "undo",
  "refs",
  "moves",
])

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== ""

const isTexts = (value: unknown, least: number): value is Array<string> =>
  Array.isArray(value) && value.length >= least && value.every(isText)

const isDay = (value: unknown): value is string =>
  typeof value === "string" &&
  DAY.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)

// eslint-disable-next-line one-owner/no-local-primitive -- build tooling sits below core-utils in the build graph (#2112), and check:calls runs with no install
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Why `entry` is not a call, or null when it is one. */
function whyNotCall(entry: unknown): string | null {
  if (!isRecord(entry)) return "is not an object"
  const extra = Object.keys(entry).find((key) => !FIELDS.has(key))
  if (extra !== undefined) return `has a field no call has: ${extra}`
  const {
    id,
    made,
    by,
    agreed,
    paths,
    chose,
    options,
    gray,
    undo,
    refs,
    moves,
  } = entry
  if (typeof id !== "string" || !ID.test(id)) return "needs an id such as C12"
  if (!isDay(made)) return "needs `made`, a day (YYYY-MM-DD)"
  if (by !== "claude" && by !== "owner") return "needs `by`: claude or owner"
  if (agreed !== undefined) {
    if (by !== "claude")
      return "has `agreed`, which only a Claude call can have"
    if (!isDay(agreed)) return "has an `agreed` that is not a day"
    if (agreed < made) return "was agreed before it was made"
  }
  if (!isTexts(paths, 1)) return "needs `paths`, at least one"
  if (!isText(chose)) return "needs `chose`, in words"
  const owners = by === "owner"
  if (!(gray === undefined && owners) && !isText(gray))
    return "needs `gray`, in words"
  if (!isText(undo)) return "needs `undo`, in words"
  if (!(options === undefined && owners) && !isTexts(options, 2))
    return "needs `options`, at least two"
  if (!isTexts(refs, 1) || !refs.every((ref) => REF.test(ref)))
    return "needs `refs`, each `#<n>`, `server#<n>` or `testing#<n>`"
  if (moves !== undefined && (typeof moves !== "string" || !ID.test(moves)))
    return "has a `moves` that is not a call's id"
  return null
}

/**
 * Whether `entry` is a call. A reader gets the entry itself, not a copy, so
 * it sees the fields in the file's order.
 */
const isCall = (entry: unknown): entry is Call => whyNotCall(entry) === null

export type CallsRead =
  | { readonly calls: ReadonlyArray<Call>; readonly findings: [] }
  | { readonly calls: null; readonly findings: Array<CallsFinding> }

/** The calls `entries` hold, in the order given, or why they hold none. */
function checkEntries(
  entries: ReadonlyArray<unknown>,
  findings: Array<CallsFinding>,
  layout: "array" | "folder"
): CallsRead {
  const calls: Array<Call> = []
  const seen = new Set<string>()
  // In the folder, ids are picked by pull requests in parallel, so a call may
  // move one with a higher id that merged first: it need only be in the record.
  const all = new Set(
    layout === "folder"
      ? entries.flatMap((e) =>
          isRecord(e) && typeof e.id === "string" ? [e.id] : []
        )
      : []
  )
  entries.forEach((entry, i) => {
    if (!isCall(entry)) {
      const at =
        isRecord(entry) && typeof entry.id === "string"
          ? entry.id
          : `entry ${i + 1}`
      findings.push({ kind: "badEntry", at, why: whyNotCall(entry) ?? "" })
      return
    }
    const call = entry
    if (layout === "array" && call.moves !== undefined && !seen.has(call.moves))
      findings.push({
        kind: "badEntry",
        at: call.id,
        why: `moves ${call.moves}, which is not listed before it`,
      })
    if (
      layout === "folder" &&
      call.moves !== undefined &&
      (call.moves === call.id || !all.has(call.moves))
    )
      findings.push({
        kind: "badEntry",
        at: call.id,
        why: `moves ${call.moves}, which is not another call in the record`,
      })
    if (seen.has(call.id)) findings.push({ kind: "duplicateId", id: call.id })
    seen.add(call.id)
    calls.push(call)
  })
  if (findings.length > 0) return { calls: null, findings }
  return { calls, findings: [] }
}

/** The calls `LEGACY_CALLS_FILE`'s `text` holds, in its order, or why it holds none. */
export function readCallsArray(text: string): CallsRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    return { calls: null, findings: [{ kind: "unreadable", why }] }
  }
  if (
    !isRecord(parsed) ||
    parsed.schema !== CALLS_SCHEMA ||
    !Array.isArray(parsed.calls)
  ) {
    return {
      calls: null,
      findings: [
        {
          kind: "unreadable",
          why: `it is not \`{"schema": "${CALLS_SCHEMA}", "calls": [...]}\``,
        },
      ],
    }
  }
  const entries: Array<unknown> = parsed.calls
  return checkEntries(entries, [], "array")
}

/** A file in the record's folder: its name, and its text (null if not a file). */
export type CallFile = { readonly name: string; readonly text: string | null }

const idNumber = (name: string): number =>
  Number(/^C(\d+)/.exec(name)?.[1] ?? Number.NaN)

/**
 * The calls the folder's `files` hold, in id order, or why they hold none:
 * every file is `C<n>.json`, holding one entry whose id is its name.
 */
export function readCallFiles(files: ReadonlyArray<CallFile>): CallsRead {
  const findings: Array<CallsFinding> = []
  const entries: Array<{ readonly n: number; readonly entry: unknown }> = []
  for (const { name, text } of files) {
    if (text === null || !FILE_NAME.test(name)) {
      findings.push({ kind: "stray", name })
      continue
    }
    let entry: unknown
    try {
      entry = JSON.parse(text)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      findings.push({ kind: "unreadableFile", name, why })
      continue
    }
    const id = isRecord(entry) ? entry.id : undefined
    if (typeof id === "string" && `${id}.json` !== name)
      findings.push({ kind: "misnamed", name, id })
    entries.push({ n: idNumber(name), entry })
  }
  entries.sort((a, b) => a.n - b.n)
  return checkEntries(
    entries.map(({ entry }) => entry),
    findings,
    "folder"
  )
}

/** The path of the file that holds call `id`. */
export const callPath = (id: string): string => `${CALLS_DIR}/${id}.json`

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Whether `call` may gain `field` later: a Claude call the day the owner
 * agreed, the owner's own call the options and why it was gray.
 */
const gains = (call: Call, field: string): boolean =>
  call.by === "claude"
    ? field === "agreed"
    : field === "options" || field === "gray"

/** A call's fields by name, for comparing them one by one. */
const fieldsOf = (call: Call): ReadonlyMap<string, unknown> =>
  new Map(Object.entries(call))

/**
 * Findings for `head` against the base branch's `base`: an entry dropped, or
 * a field of one changed, other than a Claude call gaining `agreed`.
 */
export function ratchetCalls(
  base: ReadonlyArray<Call>,
  head: ReadonlyArray<Call>
): Array<CallsFinding> {
  const now = new Map(head.map((call) => [call.id, call]))
  const findings: Array<CallsFinding> = []
  for (const before of base) {
    const after = now.get(before.id)
    if (after === undefined) {
      findings.push({ kind: "dropped", id: before.id })
      continue
    }
    const was = fieldsOf(before)
    const is = fieldsOf(after)
    for (const field of FIELDS) {
      if (gains(before, field) && !was.has(field)) continue
      if (!same(was.get(field), is.get(field)))
        findings.push({ kind: "rewritten", id: before.id, field })
    }
  }
  return findings
}

/** One human-readable line per finding, naming the fix. */
export function describeCallsFinding(finding: CallsFinding): string {
  switch (finding.kind) {
    case "unreadable": {
      return `${LEGACY_CALLS_FILE} cannot be read: ${finding.why}.`
    }
    case "unreadableFile": {
      return `${CALLS_DIR}/${finding.name} cannot be read: ${finding.why}.`
    }
    case "stray": {
      return `${CALLS_DIR}/${finding.name} is not a call's file. The folder holds only \`C<n>.json\`, one call each.`
    }
    case "misnamed": {
      return `${CALLS_DIR}/${finding.name} holds ${finding.id}. Name the file ${finding.id}.json.`
    }
    case "legacyBeside": {
      return `${LEGACY_CALLS_FILE} is back beside ${CALLS_DIR}/. The record is one file per call now (#2976): move its new entries to ${CALLS_DIR}/<ID>.json and delete it.`
    }
    case "badEntry": {
      return `${finding.at} ${finding.why}.`
    }
    case "duplicateId": {
      return `${finding.id} is used twice. Give the newer call the next free id.`
    }
    case "dropped": {
      return `${callPath(finding.id)} is gone. A call is never removed: a change to it is a new call that \`moves\` it.`
    }
    case "rewritten": {
      return `${callPath(finding.id)}'s \`${finding.field}\` changed. A call's file never changes, except a Claude call gaining \`agreed\` and the owner's own call its \`options\` and \`gray\`: a change to it is a new call that \`moves\` it.`
    }
    default: {
      const unhandled: never = finding
      throw new Error(`Unhandled calls finding: ${String(unhandled)}`)
    }
  }
}
