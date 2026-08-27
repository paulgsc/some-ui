/**
 * One caller-supplied usage signal for one exercise tile. Which exercises
 * are "starved" or "popular" is a fact about how a whole population of
 * players has used the corpus over time, which lives in apps/www's own
 * session history, not in this package's static seed corpus — this module
 * only renders the classification it is handed.
 *
 * `tone` is inlined rather than its own named export: `knip` flags a
 * standalone `ExercisePickerBadgeTone` as unused the moment nothing imports
 * it by name, which is true today (only this field's own type position uses
 * it) and would stay true until a real caller needs the bare union — add it
 * back then, not speculatively now.
 */
export type ExercisePickerBadge = {
  tone: "starved" | "popular"
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
