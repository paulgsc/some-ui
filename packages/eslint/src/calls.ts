// The calls record (ST37, #2637; CLAUDE.md, "Two kinds of pull request"):
// `docs/calls.json`, one entry per gray-area call an agent or the owner made,
// with whose authority it rests on, why it was gray, the options and how to
// undo it. A later session finds a call by the paths it governs; the weekly
// call reads the week's new ones (`packages/video-render/src/call-facts.ts`).
//
// What this module holds, as pure functions over the file's text:
//
// - **Shape.** Every entry has each field, in its type; ids are `C<n>`,
//   unique; days are `YYYY-MM-DD`; `by` is `claude` or `owner`; `agreed` is
//   only on a Claude call, and never before the day it was made; `options`
//   and `gray` may be left out only of the owner's own call, where they are
//   the owner's to give, then or later; `moves` names a call listed before it.
// - **Append-only against the base branch.** An entry the base holds is still
//   here with every field unchanged, except that a Claude call may gain the
//   day the owner agreed to it, and the owner's own call its options and why
//   it was gray. A later change to what a call chose is not an
//   edit here: it is a story, a new entry that names the one it moves.
//
// Whether a call is gray at all, and whether an entry says it truly, is
// review's. `scripts/check-calls.ts` runs this in pr.yml's `guards` job and
// root `pnpm lint`.

export const CALLS_SCHEMA = "some-ui.calls/1"
export const CALLS_FILE = "docs/calls.json"

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
  | { readonly kind: "badEntry"; readonly at: string; readonly why: string }
  | { readonly kind: "duplicateId"; readonly id: string }
  | { readonly kind: "dropped"; readonly id: string }
  | { readonly kind: "rewritten"; readonly id: string; readonly field: string }

const ID = /^C[1-9]\d*$/
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

/** `entry` as a call, or why it is not one. */
function callOf(entry: unknown): Call | string {
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
  return {
    id,
    made,
    by,
    ...(agreed === undefined ? {} : { agreed }),
    paths,
    chose,
    ...(options === undefined ? {} : { options }),
    ...(gray === undefined ? {} : { gray }),
    undo,
    refs,
    ...(moves === undefined ? {} : { moves }),
  }
}

/** The calls `text` holds, or why it holds none. */
export function readCalls(
  text: string
):
  | { readonly calls: ReadonlyArray<Call>; readonly findings: [] }
  | { readonly calls: null; readonly findings: Array<CallsFinding> } {
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
  const findings: Array<CallsFinding> = []
  const calls: Array<Call> = []
  const seen = new Set<string>()
  entries.forEach((entry, i) => {
    const call = callOf(entry)
    if (typeof call === "string") {
      const at =
        isRecord(entry) && typeof entry.id === "string"
          ? entry.id
          : `entry ${i + 1}`
      findings.push({ kind: "badEntry", at, why: call })
      return
    }
    if (call.moves !== undefined && !seen.has(call.moves))
      findings.push({
        kind: "badEntry",
        at: call.id,
        why: `moves ${call.moves}, which is not listed before it`,
      })
    if (seen.has(call.id)) findings.push({ kind: "duplicateId", id: call.id })
    seen.add(call.id)
    calls.push(call)
  })
  if (findings.length > 0) return { calls: null, findings }
  return { calls, findings: [] }
}

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
      return `${CALLS_FILE} cannot be read: ${finding.why}.`
    }
    case "badEntry": {
      return `${finding.at} ${finding.why}.`
    }
    case "duplicateId": {
      return `${finding.id} is used twice. Give the newer call the next free id.`
    }
    case "dropped": {
      return `${finding.id} is gone. A call is never removed: a change to it is a new call that \`moves\` it.`
    }
    case "rewritten": {
      return `${finding.id}'s \`${finding.field}\` changed. A call is never edited, except a Claude call gaining \`agreed\`: a change to it is a new call that \`moves\` it.`
    }
    default: {
      const unhandled: never = finding
      throw new Error(`Unhandled calls finding: ${String(unhandled)}`)
    }
  }
}
