export type ExtensionMessage =
  | { type: "GET_TAB_FILTER_STATE" }
  | { type: "SET_FILTERED_TABS"; ids: Array<number> }
  | { type: "TOGGLE_FILTER" }
  | { type: "CYCLE_TAB_STATE" }

