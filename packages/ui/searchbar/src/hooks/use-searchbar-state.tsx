import { searchContextSchema } from "@searchbar/types/searchbar"
import { useStringQueryState, type QueryStateOptions } from "some-ui-utils"

// Assuming you have a schema
type QueryStateReturnType = ReturnType<typeof useStringQueryState>

type UseSearchBarStateReturn = {
  context: string // Assuming the context is a string, adjust if it's a different type
  setContext: QueryStateReturnType[1]
  menuItems: Array<string> // Assuming the menu items are strings
}

export const useSearchBarState = (
  config: QueryStateOptions
): UseSearchBarStateReturn => {
  const [urlContext, setUrlContext] = useStringQueryState("t", config)
  const contextFromParam = searchContextSchema.safeParse(urlContext).data
  const defaultContext = contextFromParam ?? config.defaultValue

  return {
    context: defaultContext,
    setContext: setUrlContext,
    menuItems: config.menu,
  }
}
