/**
 * The mailbox's whole request-to-answer logic, with no I/O of its own: the
 * clock, the logger and storage come in as `Deps`, so it runs unchanged in
 * Node tests against an in-memory `Store`.
 *
 * The invariants this file governs (full text: README.md, "Gray-area
 * invariants"):
 *
 * - MB1 (retired): an item never changes, and leaves `item` only into
 *   `archived`; MB5 carries it, with home's index's exception.
 * - MB2: `ROLES` is the one place a token is mapped to what it may do.
 * - MB3: no token reaches the repo or a log.
 * - MB4: the Cloudflare account has no payment method (account state, not
 *   reviewable).
 * - MB5: an item never changes, and leaves `item` only into `archived`, or,
 *   for home's index, once a newer index of its routine is live (`store.ts`,
 *   `migrations/`).
 */

import type { Folder, Role, Store } from "./store"

/** Most bytes one item may hold, far above any real file (README, "What a put must satisfy"); D1's row cap is 2 MB. */
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

/** The keys of a `some-ui.voice-transcript/1` body; any other is refused. */
const TRANSCRIPT_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "note",
  "of",
  "ref",
  "at",
  "text",
  "language",
  "model",
  "heardAt",
  "words",
])
/** The keys of one heard word in a transcript's `words`; any other is refused. */
const WORD_KEYS: ReadonlySet<string> = new Set([
  "text",
  "startMs",
  "endMs",
  "p",
  "language",
])
/** More words than a note can hold: ten minutes at twenty a second. */
const WORDS_MAX = 12_000
const NO_AUDIO = "a transcript carries no audio: home keeps the audio"
const NO_DRIVE = "a transcript names no Drive file: home keeps the audio"
const AUDIO_KEY = /audio|sound|wav|webm|ogg|opus|m4a|mp3|base64|bytes|blob/i
const DRIVE_KEY = /drive|file_?id/i
const DATA_URI = /\bdata:[\w.+-]+\/[\w.+-]+[;,]/i
const DRIVE_LINK = /drive\.google\.com|docs\.google\.com\/(uc|open|file)/i
/**
 * Encoded bytes, not speech: a run in base64's alphabet longer than any id
 * a transcript holds (a `ref` is at most 200), once line breaks are gone.
 */
const ENCODED_RUN = /[A-Za-z0-9+/=_-]{256,}/
/** home's note ids and refs (`voice_repo::is_name` in paulgsc/server). */
const NOTE_ID = /^[A-Za-z0-9_.:-]{1,64}$/
const NOTE_REF = /^[A-Za-z0-9_.:-]{1,200}$/
/** Whisper's language code, as `en` or `ko`. */
const LANGUAGE = /^[a-z]{2,3}$/
const NOTE_OF: ReadonlySet<unknown> = new Set([
  "reflection",
  "jobs",
  "scene",
  "studio",
])
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

function isInstant(value: unknown): boolean {
  return (
    typeof value === "string" &&
    INSTANT.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A `YYYY-MM-DD` that names a day on the calendar: `Date.parse` takes
 * `2026-02-30` as 2 March, so the parts are checked to come back unchanged.
 */
function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string") return false
  const [, y, m, d] = (DAY.exec(value) ?? []).map(Number)
  if (y === undefined || m === undefined || d === undefined) return false
  const date = new Date(0)
  date.setUTCFullYear(y, m - 1, d)
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/**
 * Audio or a Drive link in a body's text as sent, so a key given twice,
 * whose first value `JSON.parse` drops, is read too: `noAudio` or `noDrive`,
 * or `null` for neither.
 */
function carriesRefusal(
  text: string,
  noAudio: string,
  noDrive: string
): string | null {
  const flat = text.replace(/\\[nr]|[\r\n]/g, "").replaceAll("\\/", "/")
  if (DATA_URI.test(text) || ENCODED_RUN.test(flat)) return noAudio
  if (DRIVE_LINK.test(text)) return noDrive
  return null
}

/**
 * The start every lane's shape check shares: audio or a Drive link anywhere
 * in the text as sent, then a key outside `keys`, refused as audio, as Drive
 * or as `not part of a <what>`. `null` when neither.
 */
function shapeRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  keys: ReadonlySet<string>,
  noAudio: string,
  noDrive: string,
  what: string
): string | null {
  const carried = carriesRefusal(text, noAudio, noDrive)
  if (carried !== null) return carried
  const extra = Object.keys(body).find((key) => !keys.has(key))
  if (extra === undefined) return null
  if (AUDIO_KEY.test(extra)) return noAudio
  if (DRIVE_KEY.test(extra)) return noDrive
  return `${extra} is not part of a ${what}`
}

/**
 * README, "What a put must satisfy": a transcript is text, and only its own
 * keys.
 */
function transcriptRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    TRANSCRIPT_KEYS,
    NO_AUDIO,
    NO_DRIVE,
    "transcript"
  )
  if (shape !== null) return shape
  if (typeof body.note !== "string" || !NOTE_ID.test(body.note)) {
    return "note must be the note's id"
  }
  const prefix = `transcript-${body.note}-`
  if (
    !name.startsWith(prefix) ||
    !/^[1-9]\d{0,18}\.json$/.test(name.slice(prefix.length))
  ) {
    return "the name must carry the note's id"
  }
  if (!NOTE_OF.has(body.of))
    return "of must be reflection, jobs, scene or studio"
  if (typeof body.ref !== "string" || !NOTE_REF.test(body.ref)) {
    return "ref must name what the note belongs to"
  }
  if (!isInstant(body.at)) return "at must be when the note was recorded"
  if (typeof body.text !== "string" || body.text.trim() === "") {
    return "text must be what home heard"
  }
  if (typeof body.language !== "string" || !LANGUAGE.test(body.language)) {
    return "language must be the language heard, as en or ko"
  }
  if (
    typeof body.model !== "string" ||
    body.model.trim() === "" ||
    body.model.length > 100
  ) {
    return "model must name the model that heard it"
  }
  if (!isInstant(body.heardAt)) return "heardAt must be when home heard it"
  if (body.words !== undefined) return wordsRefusal(body.words)
  return null
}

/** README, "What a put must satisfy": a transcript's `words`. */
function wordsRefusal(words: unknown): string | null {
  const why = "words must be each word heard, with its time and how sure"
  if (!Array.isArray(words) || words.length > WORDS_MAX) return why
  for (const word of words) {
    if (!isRecord(word)) return why
    if (Object.keys(word).some((key) => !WORD_KEYS.has(key))) return why
    const { text, startMs, endMs, p } = word
    if (typeof text !== "string" || text.trim() === "") return why
    if (
      typeof startMs !== "number" ||
      typeof endMs !== "number" ||
      !Number.isInteger(startMs) ||
      !Number.isInteger(endMs) ||
      startMs < 0 ||
      endMs < startMs
    )
      return why
    if (p !== undefined && (typeof p !== "number" || !(p >= 0 && p <= 1)))
      return why
    const { language } = word
    if (
      language !== undefined &&
      (typeof language !== "string" || !LANGUAGE.test(language))
    )
      return why
  }
  return null
}

/**
 * The keys of a `some-ui.reflection/1` body: only what the reflections
 * routine reads of a written reflection (paulgsc/some-ui#2174, D2). Any
 * other is refused.
 */
const REFLECTION_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "reflection",
  "session",
  "at",
  "text",
])
const NO_AUDIO_REFLECTION =
  "a reflection carries no audio: a spoken one goes as its transcript"
const NO_DRIVE_REFLECTION = "a reflection names no Drive file"

/**
 * README, "What a put must satisfy": a written reflection is its text, the
 * session it is about and when it was written, and nothing else.
 */
function reflectionRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    REFLECTION_KEYS,
    NO_AUDIO_REFLECTION,
    NO_DRIVE_REFLECTION,
    "reflection"
  )
  if (shape !== null) return shape
  if (typeof body.reflection !== "string") {
    return "reflection must be the reflection's id"
  }
  if (name !== `reflection-${body.reflection}.json`) {
    return "the name must carry the reflection's id"
  }
  if (typeof body.session !== "string" || !NOTE_REF.test(body.session)) {
    return "session must name the session it is about"
  }
  if (!isInstant(body.at)) return "at must be when it was written"
  if (typeof body.text !== "string" || body.text.trim() === "") {
    return "text must be what was written"
  }
  return null
}

/**
 * The keys of a `some-ui.drama-prompt/1` body: only what the reflections
 * routine reads of the next scene's prompt (paulgsc/some-ui#2174, D2). Any
 * other is refused.
 */
const PROMPT_KEYS: ReadonlySet<string> = new Set(["schema", "prompt", "text"])
const NO_AUDIO_PROMPT =
  "a prompt carries no audio: its scene notes go as their transcripts"
const NO_DRIVE_PROMPT = "a prompt names no Drive file"

/**
 * README, "What a put must satisfy": the next scene's prompt is its stamp
 * and its markdown, and nothing else.
 */
function promptRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    PROMPT_KEYS,
    NO_AUDIO_PROMPT,
    NO_DRIVE_PROMPT,
    "prompt"
  )
  if (shape !== null) return shape
  if (typeof body.prompt !== "string") {
    return "prompt must be the prompt's stamp"
  }
  if (name !== `${body.prompt}.prompt.json`) {
    return "the name must carry the prompt's stamp"
  }
  if (typeof body.text !== "string" || body.text.trim() === "") {
    return "text must be the prompt"
  }
  return null
}

/** The keys of a `some-ui.routine-index/1` body for the jobs routine; any other is refused. */
const JOBS_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "routine",
  "day",
  "validThrough",
  "asOf",
  "from",
  "skipped",
  "queue",
  "new",
  "notes",
  "picked",
])
/** The keys of a `some-ui.routine-index/1` body for the reflections routine; any other is refused. */
const REFLECTIONS_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "routine",
  "asOf",
  "validUntil",
  "skipped",
  "answered",
  "words",
  "recent",
  "unopened",
  "reflections",
  "prompts",
])
const NO_AUDIO_INDEX = "an index carries no audio: home keeps the audio"
const NO_DRIVE_INDEX = "an index names no Drive file"

/** One routine's index shape past its keys: why it is refused, or `null`. */
type IndexShape = (body: Readonly<Record<string, unknown>>) => string | null

function shapeOf(
  objects: ReadonlyArray<string>,
  lists: ReadonlyArray<string>,
  body: Readonly<Record<string, unknown>>
): string | null {
  for (const key of objects) {
    if (!isRecord(body[key])) return `${key} must be an object`
  }
  for (const key of lists) {
    if (!Array.isArray(body[key])) return `${key} must be a list`
  }
  return null
}

const asOfRefusal = (body: Readonly<Record<string, unknown>>): string | null =>
  body.asOf !== null && !isInstant(body.asOf)
    ? "asOf must be when home last took in what the index counts"
    : null

/** The jobs index: a day, the last day its queue holds, and its parts. */
const jobsShape: IndexShape = (body) => {
  if (!isCalendarDay(body.day)) return "day must be the day the index is for"
  if (
    body.validThrough !== null &&
    (!isCalendarDay(body.validThrough) || body.validThrough < body.day)
  ) {
    return "validThrough must be a day from day on, or null"
  }
  return (
    asOfRefusal(body) ??
    shapeOf(["from", "queue", "new"], ["skipped", "notes", "picked"], body)
  )
}

/**
 * The reflections index: the moment it next changes, after `asOf`, and its
 * parts.
 */
const reflectionsShape: IndexShape = (body) => {
  const asOf = asOfRefusal(body)
  if (asOf !== null) return asOf
  if (
    body.validUntil !== null &&
    (!isInstant(body.validUntil) ||
      body.asOf === null ||
      Date.parse(String(body.validUntil)) <= Date.parse(String(body.asOf)))
  ) {
    return "validUntil must be a moment after asOf, or null"
  }
  return shapeOf(
    ["answered", "unopened"],
    ["skipped", "words", "recent", "reflections", "prompts"],
    body
  )
}

/** The routines home computes an index for (README, "What a put must satisfy"), each with its keys and shape. */
const INDEX_ROUTINES: ReadonlyMap<
  unknown,
  { readonly keys: ReadonlySet<string>; readonly shape: IndexShape }
> = new Map([
  ["jobs", { keys: JOBS_INDEX_KEYS, shape: jobsShape }],
  ["reflections", { keys: REFLECTIONS_INDEX_KEYS, shape: reflectionsShape }],
])

/**
 * README, "What a put must satisfy": an index is home's bookkeeping for one
 * routine, that routine's own keys only, and text.
 */
function indexRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const routine = INDEX_ROUTINES.get(body.routine)
  if (routine === undefined) {
    return `routine must be ${[...INDEX_ROUTINES.keys()].join(" or ")}`
  }
  const what = `${String(body.routine)} index`
  const shape = shapeRefusal(
    body,
    text,
    routine.keys,
    NO_AUDIO_INDEX,
    NO_DRIVE_INDEX,
    what
  )
  if (shape !== null) return shape
  if (!name.startsWith(`index-${String(body.routine)}-`)) {
    return "the name must carry the body's routine"
  }
  const missing = [...routine.keys].find((key) => !(key in body))
  if (missing !== undefined) return `the ${what} carries ${missing}`
  return routine.shape(body)
}

/**
 * MB2's backfill (owner, 2026-10-31, paulgsc/server#509) takes a
 * pre-mailbox Jobs file only under a name for a day from `FIRST_SHARED`
 * up to, not including, `MAILBOX_OPENED`, so the files it can take are a
 * closed set. `FIRST_SHARED` is the day the phone could first share one:
 * paulgsc/some-ui#1884 (the Jobs wing, `decisionsFileName` and
 * `scoutsFileName`) landed on 2026-10-17 at 21:06 in America/Los_Angeles,
 * and the phone names a file for its own day. `MAILBOX_OPENED` is the day
 * the mailbox opened; `@some-ui/job-desk`'s `home-index.ts` holds the same
 * day for the routine, which cannot import this Worker.
 */
const FIRST_SHARED = "2026-10-17"
const MAILBOX_OPENED = "2026-10-23"

/**
 * The names of a Jobs decisions or scouts file exactly as the phone writes
 * them, with the day each is for: `decisions-<day>.json`, then
 * `decisions-<day>-<n>.json` from `-2` for a later share that day, two
 * digits at most (a share needs something new to say, so a day has a
 * handful), and `scouts-<YYYYMMDD>T<HHMMSS>.json` at a time on the clock.
 */
const SHARED_NAMES: ReadonlyArray<RegExp> = [
  /^decisions-(\d{4})-(\d{2})-(\d{2})(?:-(?:[2-9]|[1-9]\d))?\.json$/,
  /^scouts-(\d{4})(\d{2})(\d{2})T(?:[01]\d|2[0-3])[0-5]\d[0-5]\d\.json$/,
]

/** The calendar day a decisions or scouts file the phone wrote is for, or `null`. */
function sharedDay(name: string): string | null {
  for (const pattern of SHARED_NAMES) {
    const [, y, m, d] = pattern.exec(name) ?? []
    if (y === undefined) continue
    const day = `${y}-${m ?? ""}-${d ?? ""}`
    return isCalendarDay(day) ? day : null
  }
  return null
}

/** What a name in a folder must carry: its schema, and any deeper check. */
type FolderRules = {
  readonly folder: Folder
  /** Audio files match none, on purpose: the mailbox carries text. */
  readonly name: RegExp
  readonly schema: string
  /**
   * Checks deeper than the schema, for a folder whose shape the mailbox
   * itself must hold: why the body is refused, or `null`.
   */
  readonly refuses?: (
    body: Readonly<Record<string, unknown>>,
    text: string,
    name: string
  ) => string | null
  /**
   * MB2's backfill: the folders whose files this one also takes, under each
   * one's name and schema, once each, and only as `sharedDay` reads the name,
   * for a day from `FIRST_SHARED` to before `MAILBOX_OPENED`.
   */
  readonly backfill?: ReadonlyArray<FolderRules>
}

/** The rules `name` is held to in `rules`' folder, or `null` for a name it does not take. */
function kindOf(rules: FolderRules, name: string): FolderRules | null {
  if (rules.name.test(name)) return rules
  const day = sharedDay(name)
  if (day === null || day < FIRST_SHARED || day >= MAILBOX_OPENED) return null
  return rules.backfill?.find((kind) => kind.name.test(name)) ?? null
}

const DECISIONS: FolderRules = {
  folder: "decisions",
  name: /^decisions-\d{4}-\d{2}-\d{2}(-\d+)?\.json$/,
  schema: "some-ui.job-decisions/1",
}

const SCOUT: FolderRules = {
  folder: "scout",
  name: /^scouts-\d{8}T\d{6}\.json$/,
  schema: "some-ui.job-scouts/1",
}

const FOLDERS: ReadonlyArray<FolderRules> = [
  {
    folder: "brief",
    name: /^digest-\d{4}-\d{2}-\d{2}\.json$/,
    schema: "some-ui.job-digest/1",
    // The Jobs decisions and scouts files from before the mailbox, which only
    // Drive holds, put back once under their Drive names so home counts them
    // in its index (MB2, owner, 2026-10-31).
    backfill: [DECISIONS, SCOUT],
  },
  DECISIONS,
  SCOUT,
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
  {
    // What one run of a routine did, named for the routine and when it
    // started (UTC): what it found, what it added, and what went wrong.
    folder: "run",
    name: /^run-[a-z]{1,20}-\d{8}T\d{6}Z\.json$/,
    schema: "some-ui.routine-run/1",
  },
  {
    // Which of the routine's lessons the phone has opened, names only, as
    // home filed them.
    folder: "opened",
    name: /^opened-\d{8}T\d{9}Z\.json$/,
    schema: "some-ui.routine-opened/1",
  },
  {
    // A LeetType session file, under the name the phone holds it by
    // (`t<thread>-<NN>-<slug>.json`, the Drive SOP's), wrapped with its schema.
    folder: "leetype",
    name: /^t\d{1,3}-\d{2}(-[a-z0-9]{1,30}){1,12}\.json$/,
    schema: "some-ui.leetype-session/1",
  },
  {
    // One finished LeetType session, as home holds it, named for the
    // phone's id for it; `.r<n>` and on if home holds more of it later.
    folder: "leetype-log",
    name: /^log-[A-Za-z0-9_-]{1,64}(\.r\d{1,4})?\.json$/,
    schema: "some-ui.leetype-log/1",
  },
  {
    // Home's bookkeeping for one routine, computed from what home holds after
    // a pass, named for the routine and when home filed it: a new name each
    // time it changes, so the newest is the greatest name.
    folder: "index",
    name: /^index-[a-z]{1,20}-\d{8}T\d{9}Z\.json$/,
    schema: "some-ui.routine-index/1",
    refuses: indexRefusal,
  },
  {
    // What home heard in one voice note, named for the note's id and home's
    // number for the transcript, so a better model's goes under a new name.
    folder: "transcript",
    name: /^transcript-[A-Za-z0-9_.:-]{1,64}-[1-9]\d{0,18}\.json$/,
    schema: "some-ui.voice-transcript/1",
    refuses: transcriptRefusal,
  },
  {
    // One written reflection, as home keeps it, named for the phone's id.
    folder: "reflection",
    name: /^reflection-[A-Za-z0-9_-]{1,64}\.json$/,
    schema: "some-ui.reflection/1",
    refuses: reflectionRefusal,
  },
  {
    // The next scene's prompt, as home keeps it, named for its stamp as the
    // drama that answers it is.
    folder: "prompt",
    name: /^drama-\d{8}T\d{9}Z\.prompt\.json$/,
    schema: "some-ui.drama-prompt/1",
    refuses: promptRefusal,
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

/**
 * Every folder that holds records: all but `index`. Home's index is a view it
 * recomputes from records it keeps, so the mailbox keeps only the latest and
 * nothing archives it or asks for an old one (owner, 2026-10-31,
 * paulgsc/server#509).
 */
const RECORDS: ReadonlyArray<Folder> = [
  "brief",
  "decisions",
  "scout",
  "scene",
  "drama",
  "run",
  "opened",
  "leetype",
  "leetype-log",
  "transcript",
  "reflection",
  "prompt",
]

const ALL: ReadonlyArray<Folder> = [...RECORDS, "index"]

/** Every record but `reflection` and `prompt`, which the routine never asks back (README, "Who may do what"; MI6). */
const ASKED: ReadonlyArray<Folder> = RECORDS.filter(
  (folder) => folder !== "reflection" && folder !== "prompt"
)

/** MB2. Another role (the phone's, say) is the owner's call, not a code change. */
const ROLES: ReadonlyArray<Grant> = [
  {
    role: "routine",
    token: (tokens) => tokens.routine,
    get: ALL,
    put: ["brief", "scene", "drama", "run", "leetype"],
    ask: ASKED,
    move: [],
  },
  {
    role: "home",
    token: (tokens) => tokens.home,
    get: ["brief", "scene", "drama", "run", "leetype"],
    put: [
      "decisions",
      "scout",
      "opened",
      "leetype-log",
      "transcript",
      "index",
      "reflection",
      "prompt",
    ],
    ask: [],
    move: [],
  },
  {
    role: "archive",
    token: (tokens) => tokens.archive,
    get: ALL,
    put: [],
    ask: [],
    move: RECORDS,
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
  if (kindOf(rules, name) === null) return refuse(404, "not_found")
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
):
  | { readonly ok: true; readonly value: unknown; readonly text: string }
  | { readonly ok: false } {
  try {
    // A byte-order mark stays in the text, where JSON.parse refuses it: the
    // stored bytes are exactly what was sent.
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes)
    return { ok: true, value: JSON.parse(text), text }
  } catch {
    return { ok: false }
  }
}

// eslint-disable-next-line one-owner/no-local-primitive -- the deployed Worker has no core-utils dependency (#2112)
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
  const kind = kindOf(rules, name)
  if (kind === null) {
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
  if (!isRecord(parsed.value) || parsed.value.schema !== kind.schema) {
    return refuse(422, `the body's schema must be ${kind.schema}`)
  }
  const refusal = kind.refuses?.(parsed.value, parsed.text, name) ?? null
  if (refusal !== null) return refuse(422, refusal)
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
  if (result.change === "superseded") {
    return refuse(409, "a newer index of this routine is held")
  }
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
  if (kindOf(rules, name) === null) return refuse(404, "not_found")
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
  if (kindOf(rules, name) === null) return refuse(404, "not_found")
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
