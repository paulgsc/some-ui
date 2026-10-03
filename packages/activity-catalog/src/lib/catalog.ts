import type { ActivityDefinition, ActivityId } from "./types"

const honeycomb: ActivityDefinition = {
  id: "honeycomb",
  name: "Hangul Honeycomb",
  description:
    "Type the falling Hangul characters before they escape the hive.",
  icon: "hexagon",
  registryKey: "hangul",
  layoutTree: "study",
  fields: [
    {
      kind: "select",
      key: "mode",
      label: "Mode",
      options: [
        { value: "completion", label: "Completion (clear the board)" },
        { value: "endless", label: "Endless (survive as long as you can)" },
        {
          value: "vocabulary",
          label: "Vocabulary (master the word list)",
        },
        {
          value: "vocabulary-endless",
          label: "Vocabulary Endless (words, no end)",
        },
      ],
      defaultValue: "completion",
    },
    {
      kind: "select",
      key: "difficulty",
      label: "Difficulty",
      options: [
        { value: "relaxed", label: "Relaxed - more time per letter" },
        { value: "standard", label: "Standard" },
        { value: "challenging", label: "Challenging - fast-paced" },
      ],
      defaultValue: "standard",
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
    channels: ["effects"],
    blurb: "Uses game sound effects",
  },
  defaultConfig: {
    mode: "completion",
    difficulty: "standard",
    durationMinutes: 10,
  },
  // difficulty is passed through as the friendly label the player picked
  // ("relaxed"/"standard"/"challenging"), not resolved into GameConfig
  // fields here - HangulHexGrid (@some-ui/honeycomb) owns what each preset
  // actually means, so this app never needs to know its shape.
  toSceneProps: (config) => ({
    mode: config.mode,
    difficulty: config.difficulty,
  }),
}

const topik: ActivityDefinition = {
  id: "topik",
  name: "TOPIK Study",
  description:
    "Work through Korean study material with a guided chat and quiz.",
  icon: "book-open",
  registryKey: "topik",
  layoutTree: "topik",
  fields: [
    {
      kind: "select",
      key: "level",
      label: "Level",
      options: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
      ],
      defaultValue: "beginner",
    },
    {
      kind: "duration",
      key: "durationMinutes",
      label: "Session length",
      minMinutes: 10,
      maxMinutes: 45,
      stepMinutes: 5,
      defaultMinutes: 15,
    },
  ],
  audio: {
    channels: ["speech"],
    blurb: "Uses Korean pronunciation",
  },
  maturity: "preview",
  defaultConfig: { level: "beginner", durationMinutes: 15 },
  toSceneProps: (config) => ({ path: `topiks/${String(config.level)}.json` }),
}

const leetype: ActivityDefinition = {
  id: "leetype",
  name: "LeetType",
  // Modality-neutral on purpose. The old wording — "by typing the smallest
  // code that shows it" — described the large-screen surface and was simply
  // false on a phone, where the activity asks the player to read a change and
  // say what it does instead (`@some-ui/leetype`'s LTY-MOBILE). What both
  // surfaces have in common is the competency, which is what a description on
  // a launch card should have been naming all along; how it is probed is the
  // `input` disclosure's job, below.
  description:
    "Prove one competency at a time against the smallest code that shows it.",
  icon: "keyboard",
  registryKey: "leetype",
  input: {
    modalities: ["keyboard", "touch"],
    blurb: "Typing on a keyboard; reading and tapping on a phone",
    switchesOnSmallScreens: true,
  },
  layoutTree: "study",
  fields: [
    {
      kind: "duration",
      key: "durationMinutes",
      label: "Session length",
      minMinutes: 5,
      maxMinutes: 60,
      stepMinutes: 5,
      defaultMinutes: 10,
    },
  ],
  defaultConfig: { durationMinutes: 10 },
  toSceneProps: (config) => ({
    sessionDurationMs:
      (typeof config.durationMinutes === "number"
        ? config.durationMinutes
        : 10) * 60_000,
  }),
}

/**
 * The full catalog of end-user-facing activities, keyed by ActivityId.
 *
 * ## Adding one? The invariant to know about (#852)
 *
 * **No surface in this repo may render the whole catalogue.** Not the
 * dashboard's quick launch, not the composer's picker. Both are bounded
 * viewports, and `overflow-y-auto` is banned by lint precisely because it is
 * the repair everyone reaches for.
 *
 * The launcher shows `k` *recommended* activities (`rankActivities`, `k` from
 * the breakpoint) with the rest reachable by search; the composer's picker
 * pages the catalogue with `useFittedPage`. Both are driven off this list, so
 * adding an entry here needs no layout change - that is the whole point, and
 * `catalogue-size.test.ts` is the tripwire that tells you if it stops being
 * true.
 *
 * If you find yourself wanting to render all of them "just for now", the
 * answer is one of: page it, rank it, or search it.
 */
export const ACTIVITY_CATALOG: Record<ActivityId, ActivityDefinition> = {
  honeycomb,
  topik,
  leetype,
}

export const ACTIVITY_IDS: ReadonlyArray<ActivityId> = [
  "honeycomb",
  "topik",
  "leetype",
]

export function getActivity(id: ActivityId): ActivityDefinition {
  return ACTIVITY_CATALOG[id]
}

/**
 * Narrows an id read back from storage. A stored session outlives the
 * catalogue it was composed from: an activity can be retired while sessions
 * that used it still sit in localStorage, the phone's database or the
 * server, so a stored id is a string until this says otherwise.
 */
export function isActivityId(value: unknown): value is ActivityId {
  return typeof value === "string" && ACTIVITY_IDS.some((id) => id === value)
}

/** {@link getActivity} for a stored id: `undefined` once it is retired. */
export function findActivity(id: string): ActivityDefinition | undefined {
  return isActivityId(id) ? ACTIVITY_CATALOG[id] : undefined
}

/**
 * Looks up an activity by the registry_key its scenes render - robust
 * against a scene having been renamed (scene_name is not a reliable way
 * back to the activity that produced it, but registry_key always is).
 */
export function getActivityByRegistryKey(
  registryKey: string
): ActivityDefinition | undefined {
  return Object.values(ACTIVITY_CATALOG).find(
    (activity) => activity.registryKey === registryKey
  )
}
