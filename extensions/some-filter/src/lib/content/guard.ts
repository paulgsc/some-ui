import { isLegacyStyle } from "@filter/lib/legacy-presets"
import type { FilterConfig } from "@filter/types/config"
import type { ExtensionMessage } from "@filter/types/message"
import type { GetTabFilterStateResponse } from "@filter/types/tab"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  if (!isRecord(msg)) return false
  if (typeof msg.type !== "string") return false

  if (msg.type === "SET_FILTERED_TABS") {
    return Array.isArray(msg.ids) && msg.ids.every((n) => typeof n === "number")
  }

  if (msg.type === "SET_LEGACY_STYLE") {
    return isLegacyStyle(msg.style)
  }

  return (
    msg.type === "GET_TAB_FILTER_STATE" ||
    msg.type === "TOGGLE_FILTER" ||
    msg.type === "CYCLE_TAB_STATE"
  )
}

function isFilterConfig(value: unknown): value is FilterConfig {
  if (!isRecord(value)) return false

  return (
    (value.invert === undefined || typeof value.invert === "number") &&
    (value.hueRotate === undefined || typeof value.hueRotate === "number") &&
    (value.sepia === undefined || typeof value.sepia === "number") &&
    (value.brightness === undefined || typeof value.brightness === "number") &&
    (value.contrast === undefined || typeof value.contrast === "number")
  )
}

export function isGetTabFilterStateResponse(
  value: unknown
): value is GetTabFilterStateResponse {
  if (!isRecord(value)) return false

  return (
    typeof value.enabled === "boolean" &&
    isFilterConfig(value.config) &&
    (value.tabState === undefined ||
      value.tabState === "auto" ||
      value.tabState === "legacy" ||
      value.tabState === "off")
  )
}
