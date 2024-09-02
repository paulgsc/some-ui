import { searchContextSchema } from "@searchbar/types/searchbar"
import { useStringQueryState, type QueryStateOptions } from "some-ui-utils"

type QueryStateReturnType = ReturnType<typeof useStringQueryState>

type UseSearchBarStateReturn = {
  context: string
  setContext: QueryStateReturnType[1]
  menuItems: Array<string>
}

type UseSearchBarStateProps<T extends string> = {
  config: QueryStateOptions
  param: T
}
export const useSearchBarState = <T extends string>({
  config,
  param,
}: UseSearchBarStateProps<T>): UseSearchBarStateReturn => {
  const [urlContext, setUrlContext] = useStringQueryState(param, config)
  const contextFromParam = searchContextSchema.safeParse(urlContext).data
  const defaultContext = contextFromParam ?? config.defaultValue

  return {
    context: defaultContext,
    setContext: setUrlContext,
    menuItems: config.menu,
  }
}
