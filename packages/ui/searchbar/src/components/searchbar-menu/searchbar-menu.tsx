import type { FC } from "react"
import { defaultConfig } from "@searchbar/components/data"
import { useSearchBarState } from "@searchbar/hooks"
import type { QueryStateOptions } from "some-ui-utils"

import SelectMenu from "./select-menu"

type SearchBarContextMenuProps = {
  config?: QueryStateOptions
  param: string
}
const SearchBarContextMenu: FC<SearchBarContextMenuProps> = ({
  param,
  config,
}): JSX.Element => {
  const { context, setContext, menuItems } = useSearchBarState({
    config: { ...defaultConfig, ...config },
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
