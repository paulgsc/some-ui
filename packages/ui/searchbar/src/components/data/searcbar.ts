import type { SearchContextMenu } from "@searchbar/types/searchbar"
import type { QueryStateOptions } from "some-ui-utils"

const SearchMenu: SearchContextMenu = {
  defaultValue: "navigation",
  menu: ["blog", "navigation", "events", "updates"],
}

export const defaultConfig: QueryStateOptions = {
  ...SearchMenu,
  options: {
    clearOnDefault: true,
  },
}
