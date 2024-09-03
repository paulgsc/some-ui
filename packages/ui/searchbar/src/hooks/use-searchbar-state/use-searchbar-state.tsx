import { useState } from "react"
import {
  type UseSearchBarStateProps,
  type UseSearchBarStateReturn,
} from "@searchbar/types/searchbar"
import { useStringQueryState } from "some-ui-utils"

const useSearchBarState = <T extends string>({
  config,
  param,
}: UseSearchBarStateProps<T>): UseSearchBarStateReturn<T> => {
  const [urlContext, setUrlContext] = useStringQueryState(param ?? "", config)
  const defaultContext = urlContext ?? config.defaultValue

  return {
    context: defaultContext,
    setContext: setUrlContext,
    menuItems: config.menu,
  }
}

const useFallbackState = <T extends string>({
  config,
}: UseSearchBarStateProps<T>): UseSearchBarStateReturn<T> => {
  const [context, setContext] = useState(config.defaultValue)
  const menuItems = config.menu

  return {
    context,
    setContext,
    menuItems,
  }
}

const useSearchbarUrlState = import.meta.env.STORYBOOK
  ? useFallbackState
  : useSearchBarState

export { useSearchBarState, useSearchbarUrlState }
