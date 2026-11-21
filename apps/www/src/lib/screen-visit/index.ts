/**
 * A screen's visit (ENGAGE ENG3, #2536): the layout holds one for all its
 * views, so a view's offer is taken on the same visit that offered it, and
 * the views read it here. aph's layout holds one (ENG9, #2542), and so does
 * Jobs' Today (WALK5, C861).
 */
import { createContext, useContext } from "react"
import type { Visit } from "@some-ui/engagement"

export const ScreenVisitContext = createContext<Visit | undefined>(undefined)

/** The visit of the screen this view is in; undefined outside one. */
export const useScreenVisit = (): Visit | undefined =>
  useContext(ScreenVisitContext)
