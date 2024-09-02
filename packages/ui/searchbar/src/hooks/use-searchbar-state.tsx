import {
  type UseSearchBarStateProps,
  type UseSearchBarStateReturn,
} from "@searchbar/types/searchbar"
import { useStringQueryState } from "some-ui-utils"

export const useSearchBarState = <T extends string>({
  config,
  param,
}: UseSearchBarStateProps<T>): UseSearchBarStateReturn<T> => {
  const [urlContext, setUrlContext] = useStringQueryState(param, config)
  const defaultContext = urlContext ?? config.defaultValue

  return {
    context: defaultContext,
    setContext: setUrlContext,
    menuItems: config.menu,
  }
}
