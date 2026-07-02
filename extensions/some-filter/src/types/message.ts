import type { LegacyStyle } from "./popup"

export type ExtensionMessage =
  | { type: "GET_TAB_FILTER_STATE" }
  | { type: "SET_FILTERED_TABS"; ids: Array<number> }
  | { type: "TOGGLE_FILTER" }
  | { type: "CYCLE_TAB_STATE" }
  | { type: "SET_LEGACY_STYLE"; style: LegacyStyle }
