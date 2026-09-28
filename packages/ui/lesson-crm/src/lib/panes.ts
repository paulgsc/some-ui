/**
 * The CRM's concerns, one pane each. `docs/ui-fit` rule 1: heterogeneous
 * sections are tabs, and each pane fits on its own - so no pane grows with
 * what another holds, and a long pasted lesson scrolls inside its own box.
 *
 * The same panes are laid out two ways: a bottom tab bar on a phone, a step
 * rail on a wide screen (the session composer's shape), with the lesson list
 * as a rail beside it there.
 */

import { assertNever } from "@some-ui/intent-kit"

export type Pane =
  | "lessons"
  | "prompt"
  | "lesson"
  | "details"
  | "preview"
  | "check"

export const PANE_LABELS: Record<Pane, string> = {
  lessons: "Lessons",
  prompt: "Ask",
  lesson: "Lesson",
  details: "Details",
  preview: "Preview",
  check: "Check",
}

/** Which lesson the editor holds: none yet, a new one, or a stored one. */
export type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "stored"; key: string }

/**
 * The editor's panes, in order. A stored lesson is edited, not generated,
 * so it has no prompt. Check is last: it is where a lesson is judged and
 * saved, the composer's Review.
 */
export function editorPanes(editing: Editing): Array<Pane> {
  switch (editing.kind) {
    case "none": {
      return []
    }
    case "new": {
      return ["prompt", "lesson", "details", "preview", "check"]
    }
    case "stored": {
      return ["lesson", "details", "preview", "check"]
    }
    default: {
      return assertNever(editing)
    }
  }
}

/** Where opening a lesson lands: a new one starts at the prompt, a stored one at its verdict. */
export function landingPane(editing: Editing): Pane {
  return editing.kind === "new"
    ? "prompt"
    : editing.kind === "stored"
      ? "check"
      : "lessons"
}
