import { useState } from "react"
import type { UseSearchBarStateReturn } from "@searchbar/types"
import type { QueryStateOptions } from "some-ui-utils"

// Fallback hook for Storybook
export const useFallbackState = <T extends string>(
  config: QueryStateOptions<T>
): UseSearchBarStateReturn<T> => {
  const [context, setContext] = useState(config.defaultValue)
  const menuItems = config.menu

  return {
    context,
    setContext,
    menuItems,
  }
}
