import {
  searchContextSchema,
  type UseSearchBarStateProps,
  type UseSearchBarStateReturn,
} from "@searchbar/types/searchbar"
import { useStringQueryState } from "some-ui-utils"

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
