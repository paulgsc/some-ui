import { isLegacyStyle } from "@filter/lib/legacy-presets"
import type { FilterConfig } from "@filter/types/config"
import type { ExtensionMessage } from "@filter/types/message"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
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

export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  if (!isRecord(msg)) return false
  if (typeof msg.type !== "string") return false

  if (msg.type === "SET_FILTERED_TABS") {
    return Array.isArray(msg.ids) && msg.ids.every((n) => typeof n === "number")
  }

  if (msg.type === "SET_LEGACY_STYLE") {
    return isLegacyStyle(msg.style)
  }

  if (msg.type === "TOGGLE_FILTER") {
    return typeof msg.enabled === "boolean" && isFilterConfig(msg.config)
  }

  if (msg.type === "ENSURE_ENFORCEMENT" || msg.type === "REMOVE_ENFORCEMENT") {
    return typeof msg.swatchId === "string" && msg.swatchId.length > 0
  }

  return msg.type === "GET_TAB_FILTER_STATE" || msg.type === "CYCLE_TAB_STATE"
}
