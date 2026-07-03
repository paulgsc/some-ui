import type { FilterConfig } from "./config"
import type { LegacyStyle } from "./popup"

export type ExtensionMessage =
  | { type: "GET_TAB_FILTER_STATE" }
  | { type: "SET_FILTERED_TABS"; ids: Array<number> }
  | { type: "TOGGLE_FILTER"; enabled: boolean; config: FilterConfig }
  | { type: "CYCLE_TAB_STATE" }
  | { type: "SET_LEGACY_STYLE"; style: LegacyStyle }
