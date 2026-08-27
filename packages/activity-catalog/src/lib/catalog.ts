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

const interview: ActivityDefinition = {
  id: "interview",
  name: "Interview Prep",
  description: "Practice answering mock interview questions on a timer.",
  icon: "mic",
  registryKey: "interview",
  // Shares the "topik" template's sidebar layout rather than a dedicated tree.
  layoutTree: "topik",
  fields: [
    {
      kind: "select",
      key: "level",
      label: "Level",
      options: [
        { value: "junior", label: "Junior" },
        { value: "mid", label: "Mid" },
        { value: "senior", label: "Senior" },
      ],
      defaultValue: "mid",
    },
    {
      kind: "select",
      key: "category",
      label: "Category",
      options: [
        { value: "technical", label: "Technical" },
        { value: "behavioral", label: "Behavioral" },
        { value: "system-design", label: "System Design" },
      ],
      defaultValue: "technical",
    },
    {
      kind: "duration",
      key: "durationMinutes",
      label: "Session length",
      minMinutes: 10,
      maxMinutes: 45,
      stepMinutes: 5,
      defaultMinutes: 20,
    },
  ],
  audio: {
    channels: ["speech"],
    blurb: "Reads questions aloud",
  },
  maturity: "early",
  defaultConfig: { level: "mid", category: "technical", durationMinutes: 20 },
  // Config, not content. Selecting the questions here meant importing the
  // question bank, and importing anything from `@some-ui/interview` for a
  // value puts that package in this app's eager bundle - undoing the lazy
  // import the content registry exists for. The applet owns its own bank
  // and does the selection (see `selectInterviewQuestions`).
  toSceneProps: (config) => ({
    level: config.level,
    category: config.category,
  }),
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
  interview,
  leetype,
}

export const ACTIVITY_IDS: ReadonlyArray<ActivityId> = [
  "honeycomb",
  "topik",
  "interview",
  "leetype",
]

export function getActivity(id: ActivityId): ActivityDefinition {
  return ACTIVITY_CATALOG[id]
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
