import type { FC } from "react"
import { defaultSearchContextMenuConfig } from "@searchbar/components/data"
import { useSearchBarState } from "@searchbar/hooks"
import type { SearchContext } from "@searchbar/types"
import type { QueryStateOptions } from "some-ui-utils"

import { SelectMenu } from "./select-menu"

type SearchBarContextMenuProps = {
  config?: QueryStateOptions<SearchContext>
  param: string
}
const SearchBarContextMenu: FC<SearchBarContextMenuProps> = ({
  param,
  config,
}): JSX.Element => {
  const { context, setContext, menuItems } = useSearchBarState({
    config: { ...defaultSearchContextMenuConfig, ...config },
    param: param,
  })
  return (
    <SelectMenu
      context={context}
      menuItems={menuItems}
      setContext={setContext}
    />
  )
}

export default SearchBarContextMenu
