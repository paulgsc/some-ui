/**
 * The composer's concerns, one pane each (the lesson CRM's `lib/panes`
 * shape): a bottom tab bar on a phone, the four-step wizard on a wide screen,
 * both walking one state, so crossing the breakpoint keeps the person's
 * place. Step 1's two concerns (what to add, what was added) are two tabs on
 * a phone; the second wears a count.
 */

export type ComposerStep = 1 | 2 | 3 | 4

export type ComposerPane =
  | "browse"
  | "added"
  | "configure"
  | "arrange"
  | "review"

export const STEP_ORDER: ReadonlyArray<ComposerStep> = [1, 2, 3, 4]

export const STEP_LABELS: Record<ComposerStep, string> = {
  1: "Choose activities",
  2: "Configure",
  3: "Arrange",
  4: "Review",
}

/** Tab order on a phone. */
export const PANE_ORDER: ReadonlyArray<ComposerPane> = [
  "browse",
  "added",
  "configure",
  "arrange",
  "review",
]

export const PANE_LABELS: Record<ComposerPane, string> = {
  browse: "Browse",
  added: "Added",
  configure: "Configure",
  arrange: "Arrange",
  review: "Review",
}

/** The wizard step a pane belongs to: both halves of step 1 are step 1. */
export const PANE_STEP: Record<ComposerPane, ComposerStep> = {
  browse: 1,
  added: 1,
  configure: 2,
  arrange: 3,
  review: 4,
}

/** Where a step lands: step 1 opens on what there is to add. */
export const STEP_PANE: Record<ComposerStep, ComposerPane> = {
  1: "browse",
  2: "configure",
  3: "arrange",
  4: "review",
}
