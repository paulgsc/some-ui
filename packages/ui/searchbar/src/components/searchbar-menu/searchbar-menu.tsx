import type { FC } from "react"
import { defaultConfig } from "@searchbar/components/data"
import { useSearchBarState } from "@searchbar/hooks"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"
import type { QueryStateOptions } from "some-ui-utils"

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
    <Select
      onValueChange={(value) => {
        void setContext(value)
      }}
      defaultValue={context}
    >
      <SelectTrigger className="h-full max-w-32 rounded-none rounded-r-full bg-primary-foreground capitalize outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder={"foo"} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup defaultValue={context}>
          {menuItems.map((menu) => (
            <SelectItem
              key={menu}
              value={menu}
              className="shrink-0 text-sm tracking-tight"
            >
              {menu}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export default SearchBarContextMenu
