import type { FilterConfig } from "./config"
import type { LegacyStyle } from "./popup"

export type ExtensionMessage =
  | { type: "GET_TAB_FILTER_STATE" }
  | { type: "SET_FILTERED_TABS"; ids: Array<number> }
  | { type: "TOGGLE_FILTER"; enabled: boolean; config: FilterConfig }
  | { type: "CYCLE_TAB_STATE" }
  | { type: "SET_LEGACY_STYLE"; style: LegacyStyle }
  // SF-CUT3 (#1489): content -> background, for the requesting frame only.
  // `swatchId` on removal too: `removeCSS` needs the byte-identical CSS the
  // insertion used, and the background keeps no per-tab state to recover it.
  | { type: "ENSURE_ENFORCEMENT"; swatchId: string }
  | { type: "REMOVE_ENFORCEMENT"; swatchId: string }

/** Background -> content, answering ENSURE_ENFORCEMENT. */
export type EnsureEnforcementResponse = { applied: boolean }
/** Background -> content, answering REMOVE_ENFORCEMENT. */
export type RemoveEnforcementResponse = { removed: boolean }
