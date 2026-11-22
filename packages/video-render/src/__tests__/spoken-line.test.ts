/** @vitest-environment node */
import { spokenLineOf, spokenPartOfLine } from "@video-render/spoken-line"
import { describe, expect, it } from "vitest"

describe("a spoken card's take line (W5, C807)", () => {
  it("names the card and part, in two parts on ':' so home keeps it as a take with no scene", () => {
    const line = spokenLineOf("scabc12", 3)
    expect(line).toBe("spoken:scabc12.3")
    expect(spokenPartOfLine(line)).toEqual({ card: "scabc12", part: 3 })
    expect(spokenPartOfLine("library")).toBeNull()
    expect(spokenPartOfLine("spoken:a:b")).toBeNull()
    expect(spokenPartOfLine("ep04:s3:2")).toBeNull()
  })
})
