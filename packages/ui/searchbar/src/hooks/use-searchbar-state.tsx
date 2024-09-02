import { searchContextSchema } from "@searchbar/validation"
import { QueryStateOptions, useStringQueryState } from "some-ui-utils"

// Assuming you have a schema

export const useSearchBarState = (config: QueryStateOptions) => {
  const [urlContext, setUrlContext] = useStringQueryState("t", config)
  const contextFromParam = searchContextSchema.safeParse(urlContext).data
  const defaultContext = contextFromParam ?? config.default

  return {
    context: defaultContext,
    setContext: setUrlContext,
    menuItems: config.menu,
  }
}
