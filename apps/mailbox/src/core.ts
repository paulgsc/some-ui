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
 * - MB2: `ROLES` is the one place a token is mapped to what it may do, and
 *   `FOLDERS`' `backfill` and `also` the only kinds a folder takes beyond its
 *   own.
 * - MB3: no token reaches the repo or a log.
 * - MB4: the Cloudflare account has no payment method (account state, not
 *   reviewable).
 * - MB5: an item never changes, and leaves `item` only into `archived`, or,
 *   for home's index, once a newer index of its routine is live (`store.ts`,
 *   `migrations/`).
 * - MB6: a ring carries only a folder name (`ringMessage`, the one thing the
 *   bell sends; `bell.ts`).
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
  "rust-round",
  "interview",
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
  return `${extra} is not part of ${/^[aeiou]/.test(what) ? "an" : "a"} ${what}`
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
    return "of must be reflection, jobs, scene, studio, rust-round or interview"
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
 * The keys of a `some-ui.episode-note/1` body: a note the owner left at a
 * moment of one of a feed's episodes (paulgsc/some-ui#2745, SFEED6), as home
 * keeps it. Any other is refused.
 */
const FEEDBACK_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "note",
  "feed",
  "episode",
  "atMs",
  "categories",
  "take",
  "writtenAt",
])
const FEEDS: ReadonlySet<unknown> = new Set(["call", "playoff-delta"])
/**
 * SFEED decision 7's set, in its order, final by decision 10 (#2670), as the
 * phone's `NoteSchema` holds it (some-ui#2747).
 */
const CATEGORIES: ReadonlyArray<string> = [
  "shallow",
  "technical",
  "missedIntuition",
  "unsupported",
  "tooLong",
  "tooShort",
  "textClipped",
  "slideShakes",
  "overlap",
  "hardToRead",
  "pacing",
  "voice",
  "musicLoud",
  "subtitlesOff",
]
const NO_AUDIO_FEEDBACK =
  "a note carries no audio: a spoken one goes as its take's transcript"
const NO_DRIVE_FEEDBACK = "a note names no Drive file"

/** Picked from the fixed set, at least one, each once, in its order. */
function isPicked(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  let before = -1
  return value.every((category) => {
    const place =
      typeof category === "string" ? CATEGORIES.indexOf(category) : -1
    const next = place > before
    before = place
    return next
  })
}

/**
 * README, "What a put must satisfy": a note on an episode is which episode,
 * the moment, what it is about, the take that says it if one does, and when
 * it was written, and nothing else.
 */
function feedbackRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    FEEDBACK_KEYS,
    NO_AUDIO_FEEDBACK,
    NO_DRIVE_FEEDBACK,
    "note"
  )
  if (shape !== null) return shape
  if (typeof body.note !== "string") return "note must be the note's id"
  if (name !== `feedback-${body.note}.json`) {
    return "the name must carry the note's id"
  }
  if (!FEEDS.has(body.feed)) return "feed must be call or playoff-delta"
  if (typeof body.episode !== "string" || !NOTE_REF.test(body.episode)) {
    return "episode must name the episode"
  }
  const { atMs } = body
  if (typeof atMs !== "number" || !Number.isSafeInteger(atMs) || atMs < 0) {
    return "atMs must be the moment, in whole milliseconds from the start"
  }
  if (!isPicked(body.categories)) {
    return "categories must be the fixed set's, each once, in its order"
  }
  if (
    body.take !== null &&
    (typeof body.take !== "string" || !NOTE_ID.test(body.take))
  ) {
    return "take must be the spoken note's take id, or null"
  }
  if (!isInstant(body.writtenAt)) return "writtenAt must be when it was written"
  return null
}

/**
 * The keys of a `some-ui.take-pickup/1` body: a Studio take the owner moved
 * to ready for pickup, as home files it for the routine (CONVEYOR3,
 * paulgsc/some-ui#2875). Its labels go; the move's comment stays home
 * (owner, 2026-11-13). Any other key is refused.
 */
const PICKUP_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "note",
  "ref",
  "heard",
  "labels",
  "readyAt",
  "seq",
])
/** The keys of a `some-ui.take-picked/1` body: the routine's answer to one pickup. */
const PICKED_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "note",
  "seq",
  "issue",
])
/** Home's bounds on a take's labels (`conveyor::MAX_LABELS`, `MAX_LABEL_CHARS` in paulgsc/server). */
const LABELS_MAX = 8
const LABEL_CHARS_MAX = 32
// eslint-disable-next-line no-control-regex -- the point is to find control characters
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/**
 * Space at either end, as Rust's `str::trim` takes it (Unicode White_Space,
 * which leaves out U+FEFF, unlike JavaScript's `trim`): home trims a label so.
 */
const EDGE_SPACE = /^\p{White_Space}|\p{White_Space}$/u
/** `<owner>/<repo>#<n>`, as home's `conveyor::is_issue` reads it. */
const ISSUE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}#[1-9]\d{0,8}$/
const NO_AUDIO_TAKE = "a take carries no audio: home keeps the audio"
const NO_DRIVE_TAKE = "a take names no Drive file: home keeps the audio"

/** A move's number on home: a whole number from 1. */
function isMoveSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
}

/** Labels as home keeps them: at most 8, each 1 to 32 printable characters with no space at either end. */
function isLabels(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > LABELS_MAX) return false
  return value.every(
    (label) =>
      typeof label === "string" &&
      label !== "" &&
      !EDGE_SPACE.test(label) &&
      [...label].length <= LABEL_CHARS_MAX &&
      !CONTROL.test(label)
  )
}

/** The note and move a pickup or its answer is named for: `<folder>-<note>-<seq>.json`. */
function moveNameRefusal(
  body: Readonly<Record<string, unknown>>,
  name: string,
  folder: string
): string | null {
  if (typeof body.note !== "string" || !NOTE_ID.test(body.note)) {
    return "note must be the take's id"
  }
  if (!isMoveSeq(body.seq)) {
    return "seq must be the ready-for-pickup move's number"
  }
  if (name !== `${folder}-${body.note}-${String(body.seq)}.json`) {
    return "the name must carry the take's id and the move's number"
  }
  return null
}

/**
 * README, "What a put must satisfy": a take ready for pickup is its id, what
 * it belongs to, what home heard, its labels, when it was moved and that
 * move's number, and nothing else: no audio, and no comment.
 */
function pickupRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    PICKUP_KEYS,
    NO_AUDIO_TAKE,
    NO_DRIVE_TAKE,
    "take ready for pickup"
  )
  if (shape !== null) return shape
  const named = moveNameRefusal(body, name, "pickup")
  if (named !== null) return named
  if (typeof body.ref !== "string" || !NOTE_REF.test(body.ref)) {
    return "ref must name the shot the take belongs to"
  }
  if (typeof body.heard !== "string" || body.heard.trim() === "") {
    return "heard must be what home heard in the take"
  }
  if (!isLabels(body.labels)) {
    return "labels must be the take's, at most 8, each 1 to 32 printable characters with no space at either end"
  }
  if (!isInstant(body.readyAt)) {
    return "readyAt must be when the take was moved to ready for pickup"
  }
  return null
}

/**
 * README, "What a put must satisfy": the routine's answer to a pickup is the
 * take, the move it answers and the issue it filed, and nothing else.
 */
function pickedRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    PICKED_KEYS,
    NO_AUDIO_TAKE,
    NO_DRIVE_TAKE,
    "take picked up"
  )
  if (shape !== null) return shape
  const named = moveNameRefusal(body, name, "picked")
  if (named !== null) return named
  if (typeof body.issue !== "string" || !ISSUE.test(body.issue)) {
    return "issue must be the issue it was filed as, <owner>/<repo>#<n>"
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

/** The keys of a `some-ui.drive-takes/1` body; any other is refused. */
const DRIVE_TAKES_KEYS: ReadonlySet<string> = new Set(["schema", "at", "takes"])
/** The keys of each take a `some-ui.drive-takes/1` body lists. */
const DRIVE_TAKE_KEYS: ReadonlySet<string> = new Set(["sha256"])
/** Most takes one list names: far above the Build Journal's, and under MAX_BODY_BYTES at ~78 B each. */
const DRIVE_TAKES_MAX = 10_000
const NO_AUDIO_TAKES =
  "a list of takes carries no audio: Drive and home keep it"
const NO_DRIVE_TAKES = "a list of takes names no Drive file or link"

/** `at` as a list's name carries it: `YYYYMMDDTHHMMSSZ`, in UTC. */
function stampOf(at: string): string {
  return `${new Date(at).toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`
}

/**
 * README, "What a put must satisfy": the build-journal session's word on
 * which Studio takes Drive holds (paulgsc/some-ui#2401, route a), as the
 * SHA-256 of each recording it found in the takes folder, and when it
 * looked. Nothing else: no audio, no Drive link, name or id.
 */
function driveTakesRefusal(
  body: Readonly<Record<string, unknown>>,
  text: string,
  name: string
): string | null {
  const shape = shapeRefusal(
    body,
    text,
    DRIVE_TAKES_KEYS,
    NO_AUDIO_TAKES,
    NO_DRIVE_TAKES,
    "list of takes"
  )
  if (shape !== null) return shape
  if (!isInstant(body.at)) return "at must be when Drive's takes were listed"
  if (name !== `drive-takes-${stampOf(String(body.at))}.json`) {
    return "the name must carry when Drive's takes were listed, in UTC"
  }
  const { takes } = body
  if (!Array.isArray(takes)) return "takes must be a list"
  if (takes.length > DRIVE_TAKES_MAX) {
    return `takes may name at most ${DRIVE_TAKES_MAX}`
  }
  const seen = new Set<string>()
  for (const take of takes) {
    if (!isRecord(take)) return "each take must be an object"
    const extra = Object.keys(take).find((key) => !DRIVE_TAKE_KEYS.has(key))
    if (extra !== undefined) {
      if (AUDIO_KEY.test(extra)) return NO_AUDIO_TAKES
      if (DRIVE_KEY.test(extra)) return NO_DRIVE_TAKES
      return `${extra} is not part of a take: only its sha256`
    }
    if (typeof take.sha256 !== "string" || !SHA256_HEX.test(take.sha256)) {
      return "sha256 must be the recording's SHA-256, in lower-case hex"
    }
    if (seen.has(take.sha256)) return "each take is named once"
    seen.add(take.sha256)
  }
  // `JSON.parse` keeps a key given twice by its last value, so a first one
  // (a Drive id, say) would be kept here unread. Every key and value this
  // shape takes is quote-free (checked above), so each is two of the text's
  // `"`: the text as sent holds more only where a key is given twice.
  if (quotes(text) !== quotes(JSON.stringify(body))) {
    return "each key is given once"
  }
  return null
}

/** How many `"` `text` holds. */
function quotes(text: string): number {
  return text.split('"').length - 1
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
/** The keys of a `some-ui.routine-index/1` body for the weekly call's routine; any other is refused. */
const CALL_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "routine",
  "asOf",
  "held",
])
/** The keys of each week the call index lists; any other is refused. */
const HELD_WEEK_KEYS: ReadonlySet<string> = new Set(["from", "to", "sha256"])
/** The keys of a `some-ui.routine-index/1` body for a weekly routine (Rust Rounds, the interview week); any other is refused. */
const WEEKLY_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "routine",
  "asOf",
  "weeks",
])
/** Most characters of one pasted error, as home keeps it (paulgsc/server `rust_round_repo::sent::PASTE_MAX_CHARS`). */
const PASTE_MAX_CHARS = 20_000
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

/**
 * The weekly call's index (paulgsc/some-ui#2635, ST36): when home last took a
 * week, and every week it holds, each named once by its days and the SHA-256
 * of the bytes home keeps. The routine lets a week leave `paulgsc/testing`
 * only once this lists it, so the Worker holds each week to its shape.
 */
const callShape: IndexShape = (body) => {
  if (!isInstant(body.asOf)) return "asOf must be when home last took a week"
  const list = shapeOf([], ["held"], body)
  if (list !== null) return list
  const held: unknown = body.held
  const seen = new Set<string>()
  for (const week of Array.isArray(held) ? held.values() : []) {
    if (
      !isRecord(week) ||
      Object.keys(week).some((key) => !HELD_WEEK_KEYS.has(key)) ||
      [...HELD_WEEK_KEYS].some((key) => !(key in week))
    ) {
      return "each held week is its from, to and sha256"
    }
    if (
      !isCalendarDay(week.from) ||
      !isCalendarDay(week.to) ||
      week.to < week.from
    ) {
      return "each held week runs from a day to a day no earlier"
    }
    if (typeof week.sha256 !== "string" || !SHA256_HEX.test(week.sha256)) {
      return "each held week's sha256 is 64 lower-case hex characters"
    }
    if (seen.has(week.from)) return "each held week is named once"
    seen.add(week.from)
  }
  return null
}

/** The pasted errors' texts in a Rust Rounds index, each as `JSON.parse` kept it. */
function pastedTexts(body: Readonly<Record<string, unknown>>): Array<string> {
  const weeks: unknown = body.weeks
  return (Array.isArray(weeks) ? weeks : []).flatMap((week: unknown) => {
    const pastes: unknown = isRecord(week) ? week.pastes : undefined
    return (Array.isArray(pastes) ? pastes : []).flatMap((paste: unknown) =>
      isRecord(paste) && typeof paste.text === "string" ? [paste.text] : []
    )
  })
}

/** `lists` said as a sentence names them: "a and b", "a, b and c". */
const listed = (lists: ReadonlyArray<string>): string =>
  lists.length < 2
    ? lists.join("")
    : `${lists.slice(0, -1).join(", ")} and ${lists.at(-1) ?? ""}`

/**
 * What a weekly routine's index (Rust Rounds', the interview week's) holds
 * of each week, as home's record of it: a final week, named once by its id,
 * whose `lists` are lists. Why not, or `null`.
 */
function finalWeeksRefusal(
  body: Readonly<Record<string, unknown>>,
  lists: ReadonlyArray<string>
): string | null {
  const asOf = asOfRefusal(body)
  if (asOf !== null) return asOf
  const list = shapeOf([], ["weeks"], body)
  if (list !== null) return list
  const weeks: unknown = body.weeks
  const seen = new Set<string>()
  for (const week of Array.isArray(weeks) ? weeks.values() : []) {
    if (!isRecord(week)) return "each week must be an object"
    if (typeof week.week !== "string" || !WEEK_ID.test(week.week)) {
      return "each week's week must be its id, like 2026-w46"
    }
    if (seen.has(week.week)) return "each week is named once"
    seen.add(week.week)
    if (week.closed !== true) return "each week must be past its deadline"
    if (
      week.sent !== null &&
      !(isRecord(week.sent) && week.sent.draft === false)
    ) {
      return "each week's send must be its final, or null"
    }
    if (!lists.every((key) => Array.isArray(week[key]))) {
      return `each week's ${listed(lists)} must be lists`
    }
  }
  return null
}

/**
 * The interview week's index (IW4, paulgsc/some-ui#2935): every final week
 * among the newest home holds, each as home's record of it (paulgsc/server
 * `GET /interview-weeks/:id/record`), so the essay routine (IW6) writes from
 * the final record, never a draft. It holds no text the owner typed, so the
 * whole body is scanned for audio and Drive links.
 */
const interviewShape: IndexShape = (body) =>
  finalWeeksRefusal(body, ["questions", "cards", "unanswered", "unread"])

/**
 * The Rust Rounds index (RR18, paulgsc/some-ui#2693): every final week among
 * the newest home holds, each as home's record of it
 * (paulgsc/server `GET /rust-weeks/:id/record`), so the Monday routine writes
 * each essay from the final record, never a draft. A pasted error is the
 * owner's own text, and a linker's symbol can run past 256 base64-like
 * characters, so the scan for encoded bytes leaves each paste's text out
 * (`rustScanned`); a paste is still held to no `data:` URI, no Drive link and
 * home's own length.
 */
const rustShape: IndexShape = (body) => {
  const weeks = finalWeeksRefusal(body, ["tickets", "pastes"])
  if (weeks !== null) return weeks
  for (const text of pastedTexts(body)) {
    // Home counts characters, not UTF-16 units (`chars().count()`).
    if ([...text].length > PASTE_MAX_CHARS) {
      return `a pasted error is at most ${PASTE_MAX_CHARS} characters`
    }
    if (DATA_URI.test(text)) return NO_AUDIO_INDEX
    if (DRIVE_LINK.test(text)) return NO_DRIVE_INDEX
  }
  return null
}

/**
 * The text the scan for audio reads in a Rust Rounds index: the body as sent,
 * less each pasted error's text where it stands as a `"text"` value, written
 * as `JSON.stringify` writes it with no space after the key, as home writes it.
 * The same string under any other key stays in and is scanned, and so does a
 * text written any other way.
 */
const rustScanned = (
  body: Readonly<Record<string, unknown>>,
  text: string
): string =>
  pastedTexts(body).reduce(
    (rest, paste) =>
      rest.replaceAll(`"text":${JSON.stringify(paste)}`, '"text":""'),
    text
  )

/** The routines home computes an index for (README, "What a put must satisfy"), each with its keys and shape. */
const INDEX_ROUTINES: ReadonlyMap<
  unknown,
  {
    readonly keys: ReadonlySet<string>
    readonly shape: IndexShape
    /** The text the scan for audio and Drive reads; the body as sent when absent. */
    readonly scanned?: (
      body: Readonly<Record<string, unknown>>,
      text: string
    ) => string
  }
> = new Map([
  ["jobs", { keys: JOBS_INDEX_KEYS, shape: jobsShape }],
  ["reflections", { keys: REFLECTIONS_INDEX_KEYS, shape: reflectionsShape }],
  ["call", { keys: CALL_INDEX_KEYS, shape: callShape }],
  ["rust", { keys: WEEKLY_INDEX_KEYS, shape: rustShape, scanned: rustScanned }],
  ["interview", { keys: WEEKLY_INDEX_KEYS, shape: interviewShape }],
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
    routine.scanned?.(body, text) ?? text,
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
 * README, "What a put must satisfy". The routine holds a week to the whole
 * format (`readWeek`, paulgsc/some-ui#2687) before it puts one; home reads
 * only what it records.
 */
function rustWeekRefusal(
  body: Readonly<Record<string, unknown>>,
  _text: string,
  name: string
): string | null {
  if (typeof body.id !== "string" || !WEEK_ID.test(body.id)) {
    return "id must be the week's, like 2026-w46"
  }
  return name === `rust-week-${body.id}.json`
    ? null
    : "the name must carry the week's id"
}

/** IW1's id for a question or card (paulgsc/some-ui#2935): a kebab slug, at most 64 characters. */
const TAKE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TAKE_ID_MAX = 64

/**
 * The ids of `list`'s objects, as home will hold a take's ref to them: each
 * a slug, once each, and never `reserved`. Why not, or `null`.
 */
function takeIdsRefusal(
  list: unknown,
  what: "question" | "card",
  reserved: string | null
): string | null {
  if (!Array.isArray(list)) return `${what}s must be a list`
  const seen = new Set<unknown>()
  for (const item of list.values()) {
    const id: unknown = isRecord(item) ? item.id : undefined
    if (
      typeof id !== "string" ||
      id.length > TAKE_ID_MAX ||
      !TAKE_ID.test(id)
    ) {
      return `each ${what}'s id must be a kebab slug of at most ${TAKE_ID_MAX} characters`
    }
    if (id === reserved) return `no ${what} may be named ${reserved}`
    if (seen.has(id)) return `each ${what}'s id is used once`
    seen.add(id)
  }
  return null
}

/**
 * README, "What a put must satisfy". A week of mock interview the interview
 * week's routine writes (IW4, paulgsc/some-ui#2935), named for its id. Home
 * takes an interview take only by IW1's refs, `<week>:<question>` and
 * `<week>:read:<card>`, so the Worker holds the ids those refs name; the
 * routine holds the rest of the format (`readWeek` in
 * `@some-ui/interview-week`) before it puts one.
 */
function interviewWeekRefusal(
  body: Readonly<Record<string, unknown>>,
  _text: string,
  name: string
): string | null {
  if (typeof body.id !== "string" || !WEEK_ID.test(body.id)) {
    return "id must be the week's, like 2026-w47"
  }
  if (name !== `interview-week-${body.id}.json`) {
    return "the name must carry the week's id"
  }
  return (
    takeIdsRefusal(body.questions, "question", "read") ??
    takeIdsRefusal(body.cards, "card", null)
  )
}

/**
 * A Rust Rounds essay's script, named for the week it answers, and `-r2` on
 * for a correction (`some-ui.rust-essay/1`'s `week.id`, `EssaySchema` in
 * `@some-ui/video-render`).
 */
function rustEssayRefusal(
  body: Readonly<Record<string, unknown>>,
  _text: string,
  name: string
): string | null {
  const week = isRecord(body.week) ? body.week.id : undefined
  if (typeof week !== "string" || !WEEK_ID.test(week)) {
    return "week.id must be the week's, like 2026-w46"
  }
  return name.replace(/(-r\d+)?\.json$/, "") === `rust-essay-${week}`
    ? null
    : "the name must carry the week's id"
}

/** `WEEK_ID` in `packages/ui/rust-rounds/src/lib/formats/week.ts`, which this Worker cannot import. */
const WEEK_ID = /^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/

/**
 * MB2's backfill (owner, 2026-10-31, paulgsc/server#509, widened 2026-11-01,
 * paulgsc/some-ui#2393) takes a Jobs file only Drive holds only under a name
 * for a day from `FIRST_SHARED` up to, not including, `DRIVE_ONLY_ENDED`, so
 * the files it can take are a closed set. `FIRST_SHARED` is the day the phone
 * could first share one: paulgsc/some-ui#1884 (the Jobs wing,
 * `decisionsFileName` and `scoutsFileName`) landed on 2026-10-17 at 21:06 in
 * America/Los_Angeles, and the phone names a file for its own day.
 * `DRIVE_ONLY_ENDED` is the first day the phone files every Jobs file home:
 * the APK carrying HF2 (paulgsc/some-ui#2394), built and installed by then,
 * stops sharing one that names a voice note to Drive alone.
 * `@some-ui/job-desk`'s `home-index.ts` holds the same day for the routine,
 * which cannot import this Worker.
 */
const FIRST_SHARED = "2026-10-17"
const DRIVE_ONLY_ENDED = "2026-11-04"

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
   * for a day from `FIRST_SHARED` to before `DRIVE_ONLY_ENDED`.
   */
  readonly backfill?: ReadonlyArray<FolderRules>
  /**
   * MB2: the other kinds of file this folder takes, each under its own
   * name, schema and deeper check, so a reader that lists the folder anyway
   * finds them with no listing of its own (MI6).
   */
  readonly also?: ReadonlyArray<FolderRules>
}

/** The rules `name` is held to in `rules`' folder, or `null` for a name it does not take. */
function kindOf(rules: FolderRules, name: string): FolderRules | null {
  if (rules.name.test(name)) return rules
  const also = rules.also?.find((kind) => kind.name.test(name))
  if (also !== undefined) return also
  const day = sharedDay(name)
  if (day === null || day < FIRST_SHARED || day >= DRIVE_ONLY_ENDED) return null
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
    // The Jobs decisions and scouts files only Drive holds, put back once under
    // their Drive names so home counts them in its index (MB2, owner,
    // 2026-10-31, widened 2026-11-01, paulgsc/some-ui#2393).
    backfill: [DECISIONS, SCOUT],
    // The build-journal session's list of the Studio takes Drive holds, by
    // SHA-256, for home to match against the takes it holds (MB2, the
    // owner's route a, paulgsc/some-ui#2401).
    also: [
      {
        folder: "brief",
        name: /^drive-takes-\d{8}T\d{6}Z\.json$/,
        schema: "some-ui.drive-takes/1",
        refuses: driveTakesRefusal,
      },
      // A week of Rust Rounds the Monday routine writes, for home to keep
      // and record its programs (RR12, paulgsc/some-ui#2687).
      {
        folder: "brief",
        name: /^rust-week-\d{4}-w\d{2}\.json$/,
        schema: "some-ui.rust-week/1",
        refuses: rustWeekRefusal,
      },
      // A week of mock interview the interview week's routine writes, for
      // home to keep and serve to the phone (IW4, paulgsc/some-ui#2935).
      {
        folder: "brief",
        name: /^interview-week-\d{4}-w\d{2}\.json$/,
        schema: "some-ui.interview-week/1",
        refuses: interviewWeekRefusal,
      },
      // The script of the essay that answers a week, for home to keep and
      // render; `-r2` on is a correction (RR16, paulgsc/some-ui#2691; the
      // owner's answer on #2684: home and the mailbox only).
      {
        folder: "brief",
        name: /^rust-essay-\d{4}-w\d{2}(-r(?:[2-9]|[1-9]\d+))?\.json$/,
        schema: "some-ui.rust-essay/1",
        refuses: rustEssayRefusal,
      },
    ],
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
  {
    // A note on an episode, as home keeps it (SFEED6).
    folder: "feedback",
    name: /^feedback-[A-Za-z0-9_-]{1,64}\.json$/,
    schema: "some-ui.episode-note/1",
    refuses: feedbackRefusal,
  },
  {
    // A Studio take the owner moved to ready for pickup, as home files it,
    // named for the take's id and that move's number (CONVEYOR3).
    folder: "pickup",
    name: /^pickup-[A-Za-z0-9_.:-]{1,64}-[1-9]\d{0,18}\.json$/,
    schema: "some-ui.take-pickup/1",
    refuses: pickupRefusal,
  },
  {
    // The routine's answer to a pickup: the issue it filed the take as,
    // named as the pickup it answers is (CONVEYOR3).
    folder: "picked",
    name: /^picked-[A-Za-z0-9_.:-]{1,64}-[1-9]\d{0,18}\.json$/,
    schema: "some-ui.take-picked/1",
    refuses: pickedRefusal,
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
  /** Listen on the bell (`GET /v1/bell`) for its rings. */
  readonly listen: boolean
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
  "feedback",
  "pickup",
  "picked",
]

const ALL: ReadonlyArray<Folder> = [...RECORDS, "index"]

/** Every record but `reflection`, `prompt`, `feedback` and `pickup`, which the routine never asks back (README, "Who may do what"; MI6). */
const ASKED: ReadonlyArray<Folder> = RECORDS.filter(
  (folder) =>
    folder !== "reflection" &&
    folder !== "prompt" &&
    folder !== "feedback" &&
    folder !== "pickup"
)

/**
 * What home reads: the folders paulgsc/server's `mailbox::pass::READS` lists,
 * and `picked`, which home's half of CONVEYOR3 adds there once this is
 * deployed (paulgsc/some-ui#2875).
 * A file added to one rings the bell (`RINGS`).
 */
const HOME_READS: ReadonlyArray<Folder> = [
  "brief",
  "scene",
  "drama",
  "run",
  "leetype",
  "picked",
]

/** MB2. Another role (the phone's, say) is the owner's call, not a code change. */
const ROLES: ReadonlyArray<Grant> = [
  {
    role: "routine",
    token: (tokens) => tokens.routine,
    get: ALL,
    put: ["brief", "scene", "drama", "run", "leetype", "picked"],
    ask: ASKED,
    move: [],
    listen: false,
  },
  {
    role: "home",
    token: (tokens) => tokens.home,
    get: HOME_READS,
    put: [
      "decisions",
      "scout",
      "opened",
      "leetype-log",
      "transcript",
      "index",
      "reflection",
      "prompt",
      "feedback",
      "pickup",
    ],
    ask: [],
    move: [],
    listen: true,
  },
  {
    role: "archive",
    token: (tokens) => tokens.archive,
    get: ALL,
    put: [],
    ask: [],
    move: RECORDS,
    listen: false,
  },
]

/** The folders an added file rings the bell for (README, "The bell"). */
export const RINGS: ReadonlyArray<Folder> = HOME_READS

/**
 * The one message the bell sends (MB6): which folder to look in, never what
 * is in it. Home reads the rest through the listing, as its poll does.
 */
export function ringMessage(folder: Folder): string {
  return JSON.stringify({ ring: folder })
}

/** Every folder a ring may name: what home reads, and what the routine may ask back. */
export const RINGING: ReadonlySet<Folder> = new Set([...RINGS, ...ASKED])

/** Home's heartbeat on the bell, answered without waking it: it sends `PING` and gets `PONG`. */
export const PING = "ping"
export const PONG = "pong"
/** The close code an earlier listener gets when home connects again: one listener at a time. */
export const REPLACED = 4000

/** The Durable Object the Worker forwards to; `index.ts` binds it. */
type BellPort = {
  /** Takes home's upgrade request and answers it with the socket (`101`). */
  readonly listen: (request: Request) => Promise<Response>
  /**
   * Rings whoever listens, without the caller waiting: best effort, so a
   * put's answer never depends on it.
   */
  readonly ring: (folder: Folder) => void
}

export type Deps = {
  readonly tokens: Tokens
  readonly store: Store
  readonly now: () => Date
  /** Told of a storage failure, or a ring that could not be sent. */
  readonly report: (error: unknown) => void
  readonly bell: BellPort
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

/** Best effort: a ring that fails is reported, never answered. */
function ring(folder: Folder, deps: Deps): void {
  try {
    deps.bell.ring(folder)
  } catch (error) {
    deps.report(error)
  }
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
  if (result.change === "added" && RINGS.includes(rules.folder)) {
    ring(rules.folder, deps)
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
      ring(rules.folder, deps)
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

/** `GET /v1/bell` with `Upgrade: websocket`, for a role that may listen (MB2). */
function listen(
  request: Request,
  grant: Grant,
  deps: Deps
): Promise<Response> | Response {
  if (request.method !== "GET") {
    return refuse(405, "method_not_allowed", { allow: "GET" })
  }
  if (!grant.listen) return refuse(403, "forbidden")
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return refuse(426, "the bell is a WebSocket", { upgrade: "websocket" })
  }
  return deps.bell.listen(request)
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
    if (new URL(request.url).pathname === "/v1/bell") {
      return await listen(request, grant, deps)
    }
    return await serve(request, grant, deps)
  } catch (error) {
    deps.report(error)
    return refuse(503, "unavailable")
  }
}
