import type { FC } from "react"
import { useIsMobile } from "some-ui-utils"

import { ExercisePickerDesktop } from "./desktop"
import { ExercisePickerMobile } from "./mobile"
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
 * # Desktop vs. mobile
 *
 * A component branch on `useIsMobile`, the same idiom `components/leetype`
 * itself uses and for a related reason: a picker built for a pointer (a
 * multi-column grid, hover states) and one built for a thumb (one column,
 * larger tap targets, the phone's single-vertical-scroll rule) are two
 * different layouts, not one layout narrowed by a media query.
 */
export const ExercisePicker: FC<ExercisePickerProps> = (props) => {
  const isMobile = useIsMobile()
  return isMobile ? (
    <ExercisePickerMobile {...props} />
  ) : (
    <ExercisePickerDesktop {...props} />
  )
}
