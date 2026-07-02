import { isLegacyStyle } from "@filter/lib/legacy-presets"
import type { ExtensionMessage } from "@filter/types/message"

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
