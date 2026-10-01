/**
 * The composer's concerns, one pane each - the lesson CRM's shape
 * (`@some-ui/lesson-crm`, `lib/panes`): the same panes are laid out two ways,
 * a bottom tab bar on a phone and the four-step wizard on a wide screen, and
 * both walk one state, so turning a phone over (or resizing a window across
 * the breakpoint) leaves the person where they were.
 *
 * A phone has one more pane than the wizard has steps. Step 1 holds two
 * concerns - what exists to add, and what has been added - which a wide
 * screen can show side by side and a phone cannot: on a phone they are two
 * tabs, and the second one wears a count so a tap on the first is confirmed
 * without leaving it.
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
