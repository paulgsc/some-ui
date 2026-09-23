import { isExtensionMessage } from "@filter/lib/background/guard"
import { describe, expect, it } from "vitest"

describe("background isExtensionMessage — enforcement requests (SF-CUT3, #1489)", () => {
  it.each(["ENSURE_ENFORCEMENT", "REMOVE_ENFORCEMENT"])(
    "accepts %s carrying a swatch id",
    (type) => {
      expect(isExtensionMessage({ type, swatchId: "default" })).toBe(true)
    }
  )

  it.each(["ENSURE_ENFORCEMENT", "REMOVE_ENFORCEMENT"])(
    "rejects %s without a usable swatch id — the background would build no CSS for it",
    (type) => {
      expect(isExtensionMessage({ type })).toBe(false)
      expect(isExtensionMessage({ type, swatchId: "" })).toBe(false)
      expect(isExtensionMessage({ type, swatchId: null })).toBe(false)
    }
  )
})
