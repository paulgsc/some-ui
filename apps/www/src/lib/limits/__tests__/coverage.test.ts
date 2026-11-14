/**
 * No limit in code without a row on a Settings page (SM2, #2121): every
 * bound the scan below finds is a source of a row in `LIMIT_ROWS`, or is
 * listed in `NOT_SHOWN` with why; and every source and listing names a bound
 * the scan still finds, so neither list outlives the code.
 *
 * The scan reads the stores' code (`apps/www/src/lib` and each
 * `packages/ui/<pkg>/src/lib`) for the three shapes a bound takes there:
 *
 * - the limit a `boundedList(key, limit, …)` is given;
 * - the `maxBytes` an audio shelf (`savingShelf`, `blobShelf`) is given,
 *   unless it is uncapped (`Number.POSITIVE_INFINITY`);
 * - a constant named as a bound: `MAX_…`, or ending `_LIMIT`, `_KEPT`,
 *   `_CAP`, `_BUDGET`, `_DAYS`, `_TTL_MS`, `_MAX` or `_MAX_BYTES`.
 *
 * What it cannot see: a bound written as a bare number, or under a name of
 * another shape, in a store that keeps its own list. No test can tell a
 * number that bounds what is kept from any other number, so that stays
 * review's: name a new bound in one of the shapes above.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { LIMIT_ROWS } from "@/lib/limits"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..")

const ONE_ITEM = "A bound on one item's size, not on how much is kept."
const TIME = "A time, pace or window in use, not a bound on what is kept."
const NOT_A_BOUND = "A name the scan matches that bounds nothing."
const DESK =
  "Each desk's room for audio: as many full-length takes as its cap, which the desk's own row shows."

/** Bounds no Settings page shows, each with why. */
const NOT_SHOWN: Readonly<Record<string, string>> = {
  "apps/www/src/lib/takes-desk/index.ts#max": DESK,
  "apps/www/src/lib/takes-desk/index.ts#maxBytes(options.limits)": DESK,
  "packages/ui/soundbites/src/lib/policy.ts#SOUNDBITE_LIMIT":
    "Soundbites: its own screen shows how many of six are kept, beside the recorder, and which one the next replaces.",
  "packages/ui/soundbites/src/lib/policy.ts#SOUNDBITES_MAX_BYTES":
    "Soundbites' room for audio: six full minutes, which its count of six shows on its own screen.",
  "packages/ui/soundbites/src/lib/policy.ts#JOURNAL_TAKES_MAX_BYTES":
    "Studio's takes: its own screen shows the time used against its budget.",
  "apps/www/src/lib/voice-home/model.ts#ASIDE_ANSWERED_MAX":
    "Which set-aside notes home has answered: forgetting one costs one more ask of home, never a mark.",
  "apps/www/src/lib/voice-home/model.ts#ASIDE_OWED_MAX":
    "Marks owed home that a note was set aside, once the note has left the phone: what it drops is SM3's (#2122), not a record the person keeps.",
  "apps/www/src/lib/device-backend/handlers/account/index.ts#MAX_LEASES_PER_SUBJECT":
    "On the phone, its own presence record, which no one reaches; home's is SM4 (#2123).",
  "packages/ui/soundbites/src/lib/policy.ts#SOUNDBITE_TAKE_MAX_BYTES": ONE_ITEM,
  "apps/www/src/lib/leetype-takes/index.ts#MAX_MS": ONE_ITEM,
  "apps/www/src/lib/idea-takes/index.ts#MAX_MS": ONE_ITEM,
  "apps/www/src/lib/library-takes/index.ts#MAX_MS": ONE_ITEM,
  "apps/www/src/lib/session-reflection/policy.ts#REFLECTION_TEXT_MAX": ONE_ITEM,
  "apps/www/src/lib/file-host-config/client.ts#DETAIL_LIMIT": ONE_ITEM,
  "packages/ui/aph/src/lib/draft.ts#MAX_DIGITS": ONE_ITEM,
  "packages/ui/auth/src/lib/schemas.ts#MAX_PASSWORD_LENGTH": ONE_ITEM,
  "packages/ui/burn-ins/src/lib/captions/timing.ts#MAX_ROWS": ONE_ITEM,
  "packages/ui/interview-week/src/lib/faults/read.ts#READ_WORDS_MAX": ONE_ITEM,
  "packages/ui/interview-week/src/lib/faults/words.ts#WORDS_MAX": ONE_ITEM,
  "packages/ui/interview-week/src/lib/week/index.ts#SLUG_MAX": ONE_ITEM,
  "packages/ui/interview-week/src/lib/week/index.ts#QUESTIONS_MAX": ONE_ITEM,
  "packages/ui/interview-week/src/lib/week/index.ts#CARDS_MAX": ONE_ITEM,
  "packages/ui/game-week/src/lib/bite.ts#MAX_LINE_CHARS": ONE_ITEM,
  "packages/ui/leetype/src/lib/leetype/exercises/totality.ts#MAX_OBLIGATIONS_PER_ROUTE":
    ONE_ITEM,
  "packages/ui/leetype/src/lib/leetype/exercises/corpus-lint.ts#MAX_PRESENTABLE_DIFFS":
    ONE_ITEM,
  "packages/ui/playoff-delta/src/lib/narration.ts#SAID_MAX": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/lint/index.ts#LINE_WIDTH_CAP": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/lint/index.ts#PROGRAM_LINE_CAP": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/formats/index.ts#MAX_ID_CHARS": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/formats/week.ts#SPEAK_TO_MAX": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/formats/week.ts#TICKETS_MAX": ONE_ITEM,
  "packages/ui/rust-rounds/src/lib/week-play/paste.ts#PASTE_MAX": ONE_ITEM,
  "packages/ui/soundbites/src/lib/idea/model.ts#TITLE_MAX": ONE_ITEM,
  "packages/ui/soundbites/src/lib/idea/model.ts#TYPED_MAX": ONE_ITEM,
  "packages/ui/soundbites/src/lib/library/model.ts#SEARCH_MAX": ONE_ITEM,
  "packages/ui/topik/src/lib/topik/core/last-drama/index.ts#NEXT_MAX": ONE_ITEM,
  "packages/ui/topik/src/lib/topik/core/last-drama/index.ts#HOOK_MAX": ONE_ITEM,
  "packages/ui/topik/src/lib/topik/core/morph-diff/index.ts#MAX_DIFF_LENGTH":
    ONE_ITEM,
  "packages/ui/topik/src/lib/topik/read-aloud/lens/items/index.ts#MAX_PROBES":
    ONE_ITEM,
  "apps/www/src/lib/pull-refresh/model.ts#MAX_PX": TIME,
  "apps/www/src/lib/tenant/transfer-lock/index.ts#LEASE_TTL_MS": TIME,
  "apps/www/src/lib/jobs/model.ts#NO_REPLY_DAYS": TIME,
  "apps/www/src/lib/loc-report/collect.ts#WINDOW_DAYS": TIME,
  "packages/ui/aph/src/lib/model.ts#BACKFILL_DAYS": TIME,
  "packages/ui/topik/src/lib/topik/core/portion/index.ts#DUE_DAYS": TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/timing/index.ts#MAX_TURN_MS":
    TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/timing/index.ts#MAX_SPEECH_MS":
    TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/timing/index.ts#MAX_ECHO_MS":
    TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/timing/index.ts#MAX_SCREEN_MS":
    TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/timing/index.ts#PACE_MAX": TIME,
  "packages/ui/topik/src/lib/topik/read-aloud/set-machine/index.ts#MAX_RETURNS":
    TIME,
  "apps/www/src/lib/jobs/runtime.ts#DRAFT_NOT_KEPT": NOT_A_BOUND,
  "apps/www/src/lib/jobs/runtime.ts#NOT_KEPT": NOT_A_BOUND,
  "apps/www/src/lib/home-link/kept-model.ts#INITIAL_KEPT": NOT_A_BOUND,
  "packages/ui/game-week/src/lib/bite.ts#MAX_OFFSET_MS":
    "The clock offset a bite carries home, within what home takes: a range on one field, not a bound on what is kept.",
  "apps/www/src/lib/studio-index/words.ts#FEED_KEPT": NOT_A_BOUND,
  "packages/ui/rust-rounds/src/lib/home/index.ts#NOT_KEPT": NOT_A_BOUND,
  "packages/ui/rust-rounds/src/lib/weeks/index.ts#NOT_KEPT": NOT_A_BOUND,
  "packages/ui/soundbites/src/lib/studio/words.ts#NOTHING_KEPT": NOT_A_BOUND,
  "packages/ui/leetype/src/lib/leetype/authored-rounds/index.ts#COUNT_AT_LEAST_MAX":
    NOT_A_BOUND,
}

const NAMED =
  /^(?:export )?const ((?:MAX_[A-Z0-9_]+)|(?:[A-Z][A-Z0-9_]*(?:_LIMIT|_KEPT|_CAP|_BUDGET|_DAYS|_TTL_MS|_MAX|_MAX_BYTES)))\b/gm
const LISTED = /\bboundedList\(\s*[^,]+?,\s*([\w.]+)/g
const SHELVED =
  /\b(?:savingShelf|blobShelf)\(\{[^}]*?maxBytes:\s*([\w.]+(?:\([^)]*\))?)/g

function sourceFiles(dir: string): Array<string> {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/(^|\/)(__tests__|node_modules)\//.test(file) &&
        !/\.test\.tsx?$/.test(file)
    )
    .map((file) => join(dir, file))
}

function scannedDirs(): Array<string> {
  const ui = join(ROOT, "packages/ui")
  return [
    join(ROOT, "apps/www/src/lib"),
    ...readdirSync(ui)
      .map((pkg) => join(ui, pkg, "src/lib"))
      .filter((dir) => {
        try {
          return readdirSync(dir).length > 0
        } catch {
          return false
        }
      }),
  ]
}

/** Every bound the scan finds, as `<path>#<name>`. */
function boundsInCode(): Set<string> {
  const found = new Set<string>()
  for (const file of scannedDirs().flatMap(sourceFiles)) {
    const text = readFileSync(file, "utf8")
    const path = relative(ROOT, file)
    for (const pattern of [NAMED, LISTED, SHELVED]) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1]
        if (name !== "Number.POSITIVE_INFINITY") {
          found.add(`${path}#${name}`)
        }
      }
    }
  }
  return found
}

describe("every limit in code has a row", () => {
  const found = boundsInCode()
  const shown = new Set(LIMIT_ROWS.flatMap((row) => row.sources))

  it("scans the stores", () => {
    expect(found.size).toBeGreaterThan(30)
    expect(found).toContain("apps/www/src/lib/session-stop/index.ts#STOP_LIMIT")
  })

  it("shows each bound it finds, or says why not", () => {
    const unlisted = [...found].filter(
      (key) => !shown.has(key) && !Object.hasOwn(NOT_SHOWN, key)
    )
    expect(unlisted).toEqual([])
  })

  it("lists no bound the code no longer has", () => {
    const gone = [...shown, ...Object.keys(NOT_SHOWN)].filter(
      (key) => !found.has(key)
    )
    expect(gone).toEqual([])
  })

  it("lists a bound once: shown or not", () => {
    expect([...shown].filter((key) => Object.hasOwn(NOT_SHOWN, key))).toEqual(
      []
    )
  })
})
