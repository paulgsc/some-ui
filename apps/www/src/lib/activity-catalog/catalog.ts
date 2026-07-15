import { interviewQuestions } from "@some-ui/interview"
import type { Question } from "@some-ui/interview"

import type { ActivityDefinition, ActivityId } from "./types"

/**
 * Falls back to a looser match (category only, then the full bank) so a
 * level+category combination with no exact matches in the mock question
 * bank still produces something playable, rather than an empty session.
 */
function filterInterviewQuestions(
  level: unknown,
  category: unknown
): Array<Question> {
  const byLevelAndCategory = interviewQuestions.filter(
    (q) => q.level === level && q.category === category
  )
  if (byLevelAndCategory.length > 0) return byLevelAndCategory

  const byCategory = interviewQuestions.filter((q) => q.category === category)
  if (byCategory.length > 0) return byCategory

  return interviewQuestions
}

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
    interviewQuestions: filterInterviewQuestions(config.level, config.category),
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
