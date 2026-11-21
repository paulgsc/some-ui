import { formatTimecode } from "@common/utils/timecode"
import { describe, expect, it } from "vitest"

describe("formatTimecode", () => {
  it("reads m:ss, flooring to the whole second", () => {
    expect(formatTimecode(0)).toBe("0:00")
    expect(formatTimecode(59_600)).toBe("0:59")
    expect(formatTimecode(61_000)).toBe("1:01")
    expect(formatTimecode(3_725_000)).toBe("62:05")
  })
})
