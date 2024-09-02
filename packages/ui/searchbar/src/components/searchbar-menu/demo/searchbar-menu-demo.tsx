import { type FC } from "react"
import { defaultSearchContextMenuConfig } from "@searchbar/components/data"
import { SelectMenu } from "@searchbar/components/searchbar-menu/select-menu"
import { useFallbackState } from "@searchbar/hooks/storybook"
import type { SearchContext } from "@searchbar/types/searchbar"
import type { QueryStateOptions } from "some-ui-utils"

type SearchBarContextMenuProps = {
  config?: QueryStateOptions<SearchContext>
  param?: string
  placeholder?: string
}

const SearchBarContextMenuDemo: FC<SearchBarContextMenuProps> = ({
  config,
  placeholder,
}) => {
  // Use fallback hook if in Storybook,
  const { context, setContext, menuItems } = useFallbackState({
    ...defaultSearchContextMenuConfig,
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

export default SearchBarContextMenuDemo
