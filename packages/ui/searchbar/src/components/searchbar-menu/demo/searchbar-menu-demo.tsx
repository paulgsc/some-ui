import { useState, type FC } from "react"
import { defaultConfig } from "@searchbar/components/data"
import { SelectMenu } from "@searchbar/components/searchbar-menu/select-menu"
import type { UseSearchBarStateReturn } from "@searchbar/types/searchbar"
import type { QueryStateOptions } from "some-ui-utils"

type SearchBarContextMenuProps = {
  config?: QueryStateOptions
  param?: string
  placeholder?: string
}

const SearchBarContextMenuDemo: FC<SearchBarContextMenuProps> = ({
  config,
  placeholder,
}) => {
  // Use fallback hook if in Storybook,
  const { context, setContext, menuItems } = useFallbackState({
    ...defaultConfig,
    ...config,
  })

  return (
    <SelectMenu
      context={context}
      menuItems={menuItems}
      setContext={setContext}
      placeholder={placeholder}
    />
  )
}

// Fallback hook for Storybook
const useFallbackState = (
  config: QueryStateOptions
): UseSearchBarStateReturn => {
  const [context, setContext] = useState(config.defaultValue)
  const menuItems = config.menu

  return {
    context,
    setContext,
    menuItems,
  }
}

export default SearchBarContextMenuDemo
