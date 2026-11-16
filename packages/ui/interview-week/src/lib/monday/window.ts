/**
 * The days the Monday routine reads, and how far back its checkout must
 * reach for them (#3056). `render call-facts` reads the epics that moved in
 * the week that ended, yesterday back `FACTS_DAYS` days, and reads the
 * history from a commit before that week's first day, so a checkout fetched
 * back only a week has none and reads the wrong week. ROUTINE.md's "Before
 * you start" fetches `FETCH_DAYS` back, which its test holds past the window.
 */
import { addDays } from "@some-ui/core-utils"

export const FACTS_DAYS = 7

export const FETCH_DAYS = 14

/** The facts' window for a run on `today`: the seven days that ended yesterday. */
export const factsWindow = (
  today: string
): { readonly from: string; readonly to: string } => ({
  from: addDays(today, -FACTS_DAYS),
  to: addDays(today, -1),
})
