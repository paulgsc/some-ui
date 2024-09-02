import type { FC } from "react"
import type {
  SearchContext,
  UseSearchBarStateReturn,
} from "@searchbar/types/searchbar"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"

type SelectMenuProps = {
  placeholder?: string
} & UseSearchBarStateReturn<SearchContext>

const SelectMenu: FC<SelectMenuProps> = ({
  placeholder,
  context,
  setContext,
  menuItems,
}) => {
  return (
    <Select
      onValueChange={(value) => {
        void setContext(value as SearchContext)
      }}
      defaultValue={context}
    >
      <SelectTrigger className="h-full max-w-32 rounded-none rounded-r-full bg-primary-foreground capitalize outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder={placeholder} />
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

export default SelectMenu
