/** Operate: what gets published, on the home network's web (`lan`). */
import type { Pipeline } from "@engagement/lib/registry"

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
      // Its panes (`lib/panes.ts`), as a stored lesson has them.
      places: [
        { id: "lesson", name: "The lesson" },
        { id: "details", name: "Its details" },
        { id: "preview", name: "Its preview" },
        { id: "check", name: "Its check" },
      ],
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
      places: [
        { id: "prompt", name: "Its prompt" },
        { id: "lesson", name: "The lesson" },
        { id: "details", name: "Its details" },
        { id: "preview", name: "Its preview" },
        { id: "check", name: "Its check" },
      ],
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
