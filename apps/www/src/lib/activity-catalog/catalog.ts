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
      ],
      defaultValue: "completion",
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
  defaultConfig: { mode: "completion", durationMinutes: 10 },
  toSceneProps: (config) => ({ mode: config.mode }),
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
  defaultConfig: { level: "beginner", durationMinutes: 15 },
  toSceneProps: (config) => ({ path: `topiks/${config.level}.json` }),
}

const interview: ActivityDefinition = {
  id: "interview",
  name: "Interview Prep",
  description: "Practice answering mock interview questions on a timer.",
  icon: "mic",
  registryKey: "interview",
  // Matches the existing SCENE_LAYOUT_MAP precedent, which puts "interview"
  // on the same sidebar layout as "topik" rather than a dedicated tree.
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
  defaultConfig: { level: "mid", category: "technical", durationMinutes: 20 },
  toSceneProps: (config) => ({
    questionFilter: { level: config.level, category: config.category },
  }),
}

const leetype: ActivityDefinition = {
  id: "leetype",
  name: "LeetType",
  description: "Type out real code solutions against the clock.",
  icon: "keyboard",
  registryKey: "leetype",
  layoutTree: "study",
  fields: [
    {
      kind: "select",
      key: "language",
      label: "Language",
      options: [
        { value: "typescript", label: "TypeScript" },
        { value: "rust", label: "Rust" },
        { value: "cpp", label: "C++" },
        { value: "c", label: "C" },
      ],
      defaultValue: "typescript",
    },
    {
      kind: "select",
      key: "difficulty",
      label: "Difficulty",
      options: [
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" },
      ],
      defaultValue: "easy",
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
  defaultConfig: {
    language: "typescript",
    difficulty: "easy",
    durationMinutes: 10,
  },
  toSceneProps: (config) => ({
    language: config.language,
    difficulty: config.difficulty,
  }),
}

/** The full catalog of end-user-facing activities, keyed by ActivityId. */
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
