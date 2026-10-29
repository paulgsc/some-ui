import { isRecord, readJson } from "@some-ui/core-utils"

export const readJsonObject = readJson(
  (value): Record<string, unknown> | null => {
    return isRecord(value) ? value : null
  }
)
