import { SearchContextMenu } from "@searchbar/types/searchbar"
import { QueryStateOptions } from "some-ui-utils"

const SearchMenu: SearchContextMenu = {
  default: "navigation",
  menu: ["blog", "navigation", "events", "updates"],
}

export const config: QueryStateOptions = {
  ...SearchMenu,
  options: {
    clearOnDefault: true,
  },
}
