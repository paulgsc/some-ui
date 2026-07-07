import type { EventType } from "@input/types/timeline-events"
import { describe, expect, it } from "vitest"
import {
  generateUID,
  getEventRequirements,
  validateAndParseJson,
} from "./event-helpers"

describe("getEventRequirements", () => {
  const table: Array<
    [
      EventType,
      {
        needsUID: boolean
        needsContext: boolean
        needsTimestamp: boolean
        needsPayload: boolean
        needsFinalPayload: boolean
      },
    ]
  > = [
    [
      "StartChapter",
      {
        needsUID: true,
        needsContext: true,
        needsTimestamp: true,
        needsPayload: true,
        needsFinalPayload: false,
      },
    ],
    [
      "EndChapter",
      {
        needsUID: true,
        needsContext: false,
        needsTimestamp: true,
        needsPayload: false,
        needsFinalPayload: true,
      },
    ],
    [
      "UpdatePayload",
      {
        needsUID: true,
        needsContext: false,
        needsTimestamp: false,
        needsPayload: true,
        needsFinalPayload: false,
      },
    ],
    [
      "UpdateContext",
      {
        needsUID: true,
        needsContext: true,
        needsTimestamp: false,
        needsPayload: false,
        needsFinalPayload: false,
      },
    ],
    [
      "RemoveChapter",
      {
        needsUID: true,
        needsContext: false,
        needsTimestamp: false,
        needsPayload: false,
        needsFinalPayload: false,
      },
    ],
    [
      "ExtendChapter",
      {
        needsUID: true,
        needsContext: false,
        needsTimestamp: true,
        needsPayload: false,
        needsFinalPayload: false,
      },
    ],
    [
      "CompleteChapter",
      {
        needsUID: true,
        needsContext: false,
        needsTimestamp: true,
        needsPayload: true,
        needsFinalPayload: false,
      },
    ],
    [
      "ClearAll",
      {
        needsUID: false,
        needsContext: false,
        needsTimestamp: false,
        needsPayload: false,
        needsFinalPayload: false,
      },
    ],
  ]

  it.each(table)("%s", (eventType, expected) => {
    expect(getEventRequirements(eventType)).toEqual(expected)
  })
})

describe("generateUID", () => {
  it("matches the chapter_<timestamp>_<suffix> shape", () => {
    expect(generateUID()).toMatch(/^chapter_\d+_[0-9a-z]{0,9}$/)
  })

  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateUID()))
    expect(ids.size).toBe(200)
  })
})

describe("validateAndParseJson", () => {
  it("parses valid JSON", () => {
    expect(validateAndParseJson('{"a":1,"b":[2,3]}')).toEqual({
      a: 1,
      b: [2, 3],
    })
  })

  it("throws a descriptive error for invalid JSON", () => {
    expect(() => {
      validateAndParseJson("{not valid")
    }).toThrow(/^Invalid JSON: /)
  })

  it("attaches the original parse error as `cause`", () => {
    try {
      validateAndParseJson("{not valid")
      expect.unreachable()
    } catch (e) {
      if (!(e instanceof Error)) throw e
      expect(e.cause).toBeInstanceOf(SyntaxError)
    }
  })
})
