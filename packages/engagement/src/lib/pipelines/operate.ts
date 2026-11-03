/** Operate: what gets published, on the home network's web (`lan`). */
import type { Choice, Pipeline } from "@engagement/lib/registry"

/** A stored lesson's panes (`packages/ui/lesson-crm/src/lib/panes.ts`). */
const LESSON_PANES: ReadonlyArray<Choice> = [
  { id: "lesson", name: "The lesson" },
  { id: "details", name: "Its details" },
  { id: "preview", name: "Its preview" },
  { id: "check", name: "Its check" },
]

/** The lesson CRM (`packages/ui/lesson-crm`). */
const lessons: Pipeline = {
  id: "lessons",
  name: "Lessons",
  wing: "operate",
  domain: "lessons",
  affordances: [
    // A lesson on the list, opened to edit.
    {
      id: "lesson",
      surface: "web",
      name: "A lesson",
      routes: ["/lessons"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: LESSON_PANES,
    },
    // A new lesson, from its prompt.
    {
      id: "new-lesson",
      surface: "web",
      name: "A new lesson",
      routes: ["/lessons"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: [{ id: "prompt", name: "Its prompt" }, ...LESSON_PANES],
    },
  ],
}

/** The résumé build (`packages/ui/resume`), opened on the desktop or from a pick. */
const resume: Pipeline = {
  id: "resume",
  name: "Résumé",
  wing: "operate",
  domain: "resume",
  affordances: [
    {
      id: "build",
      surface: "web",
      name: "Build a résumé",
      routes: ["/resume-build"],
      offer: null,
      emits: ["taken"],
      touches: true,
    },
  ],
}

export const OPERATE: ReadonlyArray<Pipeline> = [lessons, resume]
