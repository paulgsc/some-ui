import type {
  ActivityDefinition,
  ActivityIconKey,
  ActivityId,
  ActivityMaturity,
  LayoutTreeId,
  TopikLevel,
} from "@activity-catalog/lib/types"

/**
 * A catalogue of arbitrary size, for asking what the launcher and the picker
 * do at N = 10, 20, 50 (#853).
 *
 * Why synthetic rather than "add some activities": the question this answers
 * is a layout question, and the real `ACTIVITY_CATALOG` is exactly four
 * entries because there are exactly four applets. Growing it to answer a
 * layout question would mean shipping fake applets. Growing a fixture costs
 * nothing and is the same shape.
 *
 * One fixture, not three: S2's ranking, S3's search and S4's paging are all
 * measured against this, so a change to what a catalogue entry looks like
 * shows up in every one of them at once.
 */

const ICONS: ReadonlyArray<ActivityIconKey> = [
  "hexagon",
  "book-open",
  "mic",
  "keyboard",
]

const LAYOUT_TREES: ReadonlyArray<LayoutTreeId> = [
  "study",
  "topik",
  "drama",
  "voice",
]

const LEVELS: ReadonlyArray<TopikLevel> = [
  "beginner",
  "intermediate",
  "advanced",
]

/**
 * Cycled rather than randomized. A fixture that varies run to run turns a
 * ranking test into a flake, and the point here is a catalogue with a
 * *spread* of maturities, not an unpredictable one.
 */
const MATURITIES: ReadonlyArray<ActivityMaturity> = [
  "ready",
  "ready",
  "preview",
  "early",
]

/**
 * Distinct enough that a query for one never matches another. The search
 * story asserts every activity is reachable by typing part of its name, and
 * that assertion is worthless against fifty entries called "Activity 1"
 * through "Activity 50", where "Activity 1" also prefixes 10 through 19.
 */
const SUBJECTS: ReadonlyArray<string> = [
  "Hangul",
  "Vocabulary",
  "Grammar",
  "Listening",
  "Reading",
  "Writing",
  "Pronunciation",
  "Idioms",
  "Numbers",
  "Honorifics",
  "Particles",
  "Conjugation",
  "Dictation",
  "Shadowing",
  "Flashcards",
  "Sentences",
  "Dialogue",
  "Storytelling",
  "Proverbs",
  "Handwriting",
  "Calligraphy",
  "Keyboarding",
  "Transcription",
  "Translation",
  "Interpretation",
]

const FORMATS: ReadonlyArray<string> = ["Drill", "Quiz", "Lab"]

/**
 * Names are `${subject} ${format}` - "Hangul Drill", "Vocabulary Quiz" - which
 * gives 75 unique, human-shaped, mutually distinguishable names before any
 * numbering is needed.
 */
function nameFor(index: number): string {
  const subject = SUBJECTS[index % SUBJECTS.length] ?? "Activity"
  const format = FORMATS[Math.floor(index / SUBJECTS.length) % FORMATS.length]
  return `${subject} ${format ?? "Session"}`
}

function pick<T>(source: ReadonlyArray<T>, index: number, fallback: T): T {
  return source[index % source.length] ?? fallback
}

/**
 * `ActivityId` is a closed union of the four real activities, and it is
 * closed on purpose: `getActivity` is total because of it, and the app leans
 * on that everywhere. A fixture cannot widen it without widening it for
 * production code too.
 *
 * So the one assertion this package contains is here, in a testing module,
 * behind a function whose name says what it is doing. `getActivity` is never
 * called with one of these - the ranking and search functions only ever read
 * `id` as an opaque key - and nothing outside `src/testing` may produce one.
 */
function syntheticId(index: number): ActivityId {
  const id = `synthetic-${index}`
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  return id as ActivityId
}

export type SyntheticCatalogueOptions = {
  /** Give every entry `maturity: "ready"`, when maturity would confound the test. */
  uniformMaturity?: boolean
}

/** One entry, addressable on its own for the tests that need a single odd activity. */
export function syntheticActivity(
  index: number,
  { uniformMaturity = false }: SyntheticCatalogueOptions = {}
): ActivityDefinition {
  const name = nameFor(index)
  const level = pick(LEVELS, index, "beginner")

  return {
    id: syntheticId(index),
    name,
    description: `Synthetic ${name.toLowerCase()} used to size the launcher.`,
    icon: pick(ICONS, index, "hexagon"),
    registryKey: `synthetic-${index}`,
    layoutTree: pick(LAYOUT_TREES, index, "study"),
    fields: [
      {
        kind: "select",
        key: "level",
        label: "Level",
        options: LEVELS.map((value) => ({
          value,
          label: value[0]!.toUpperCase() + value.slice(1),
        })),
        defaultValue: level,
      },
      {
        kind: "duration",
        key: "durationMinutes",
        label: "Session length",
        minMinutes: 5,
        maxMinutes: 30,
        stepMinutes: 5,
        defaultMinutes: 10,
      },
    ],
    audio: {
      channels: ["speech"],
      blurb: "Reads prompts aloud",
    },
    maturity: uniformMaturity ? "ready" : pick(MATURITIES, index, "ready"),
    defaultConfig: { level, durationMinutes: 10 },
    toSceneProps: (config) => ({ level: config.level }),
  }
}

/** `size` synthetic activities, stable across calls and across processes. */
export function syntheticCatalogue(
  size: number,
  options: SyntheticCatalogueOptions = {}
): Array<ActivityDefinition> {
  return Array.from({ length: Math.max(0, size) }, (_unused, index) =>
    syntheticActivity(index, options)
  )
}

/**
 * The sizes this epic characterizes the launcher at: today's happy path, and
 * three futures. Exported so the fit sweep, the ranking tests and the paging
 * tests all ask the same question of the same numbers.
 */
export const CHARACTERIZATION_SIZES: ReadonlyArray<number> = [4, 10, 20, 50]
