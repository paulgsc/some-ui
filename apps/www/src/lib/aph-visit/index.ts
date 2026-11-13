/**
 * aph's visit (ENGAGE ENG9, #2542): the layout holds one for all four views,
 * so a view pressed on the strip is taken on the same visit that offered it.
 * The views read it here.
 */
import { createContext, useContext } from "react"
import type { Visit } from "@some-ui/engagement"

export const AphVisitContext = createContext<Visit | undefined>(undefined)

/** The visit of the aph screen this view is in; undefined outside one. */
export const useAphVisit = (): Visit | undefined => useContext(AphVisitContext)
