import { useQueryState } from "nuqs"

import { searchContextSchema, type SearchContextMenu } from "@/types/searchbar"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SearchMenu: SearchContextMenu = {
  default: "navigation",
  menu: ["blog", "navigation", "events", "updates"],
}

const SearchBarContextMenu = () => {
  const [urlContext, setUrlContext] = useQueryState("search")

  const contextFromParam = searchContextSchema.safeParse(urlContext).data
  const defaulContext = contextFromParam ?? SearchMenu.default

  return (
    <Select
      onValueChange={(value) => setUrlContext(value)}
      defaultValue={defaulContext}
    >
      <SelectTrigger className="bg-primary-foreground h-full max-w-32 rounded-none rounded-r-full capitalize outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder={defaulContext} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup defaultValue={defaulContext}>
          {SearchMenu.menu.map((menu) => (
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
