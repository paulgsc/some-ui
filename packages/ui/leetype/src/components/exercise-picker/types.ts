/**
 * Which way a caller-supplied usage count reads on a tile — never computed
 * here. Which exercises are "starved" or "popular" is a fact about how a
 * whole population of players has used the corpus over time, which lives in
 * apps/www's own session history, not in this package's static seed corpus.
 * This module only renders the classification it is handed.
 */
export type ExercisePickerBadgeTone = "starved" | "popular"

/** One caller-supplied usage signal for one exercise tile. */
export type ExercisePickerBadge = {
  tone: ExercisePickerBadgeTone
  /** However the caller counts usage — sessions played, last-N-days plays, whatever their own history tracks. */
  count: number
}

/** One exercise, exactly as far as a picker needs to know about it. */
export type ExercisePickerItem = {
  id: string
  title: string
  /** Omitted for an exercise the caller has no opinion about. */
  badge?: ExercisePickerBadge
}

export type ExercisePickerProps = {
  /** Every exercise the learner may choose. Order is the caller's — this component does not sort or shuffle it. */
  items: ReadonlyArray<ExercisePickerItem>
  onSelect: (id: string) => void
  className?: string
}
