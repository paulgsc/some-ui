import type {
  SearchBarRenderType,
  SearchContext,
  SearchContextMenu,
  SearchbarToggleContextMenu,
} from "@searchbar/types/searchbar"
import type { QueryStateOptions } from "some-ui-utils"

const searchMenu: SearchContextMenu = {
  defaultValue: "navigation",
  menu: ["blog", "navigation", "events", "updates"],
}

export const defaultSearchContextMenuConfig: QueryStateOptions<SearchContext> =
  {
    ...searchMenu,
    options: {
      clearOnDefault: true,
    },
  }

export const searchbarToggle: SearchbarToggleContextMenu = {
  defaultValue: "fragment",
  menu: ["fragment", "searchbar"],
}

export const defaultSearchToggleContextConfig: QueryStateOptions<SearchBarRenderType> =
  {
    ...searchbarToggle,
    options: {
      clearOnDefault: true,
    },
  }
