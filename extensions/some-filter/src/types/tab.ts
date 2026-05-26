import type { FilterConfig } from "./config"

export type TabState = "auto" | "legacy" | "off"

export type GetTabFilterStateResponse = {
  enabled: boolean
  config: FilterConfig
  tabState?: TabState
}

export type ContentCommand =
  | {
      type: "TOGGLE_FILTER"
      enabled: boolean
      config: FilterConfig
    }
  | {
      type: "CYCLE_TAB_STATE"
    }
