import type { FilterConfig } from "./config"

export type TabState = "auto" | "legacy" | "off"

export type GetTabFilterStateResponse = {
  enabled: boolean
  config: FilterConfig
  tabState?: TabState
}
