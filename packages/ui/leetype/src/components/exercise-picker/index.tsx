import type { FC } from "react"

import { ExercisePickerDesktop } from "./desktop"
import type { ExercisePickerProps } from "./types"

// `ExercisePickerItem` stays reachable from `./types` rather than re-exported
// here: `Leetype` builds the item list itself (see its own doc comment) and
// nothing outside this directory constructs one directly, so re-exporting it
// would be public surface with no caller. The other two are what a host
// computing `exerciseBadges` or rendering this component directly needs.
export type { ExercisePickerBadge, ExercisePickerProps } from "./types"

/**
 * Choose what to practice, instead of a shuffled bag choosing for you:
 * choosing your own target keeps a learner coming back better than corpus
 * coverage does, and is the only way to go straight at a weak concept.
 *
 * # Where the "starved/popular" badge comes from, and where it doesn't
 *
 * This component renders whichever `ExercisePickerItem.badge` its caller
 * supplies; it has no opinion about what counts as starved or popular and
 * computes nothing itself. That classification is a fact about how a whole
 * population of players has used the corpus over time — session history
 * this package's static seed corpus does not have — so it belongs to
 * whichever host actually tracks play counts (`apps/www`), not here.
 * `badge` is optional per item precisely so a host with no such data yet
 * can render a plain, badge-free picker.
 *
 * # Wide windows only
 *
 * `Leetype` shows the picker only on its typing surface; a phone plays
 * rounds instead, which choose their own artifact. So the picker is laid out
 * for a pointer (a multi-column grid, hover states) and has no thumb layout.
 */
export const ExercisePicker: FC<ExercisePickerProps> = (props) => (
  <ExercisePickerDesktop {...props} />
)
