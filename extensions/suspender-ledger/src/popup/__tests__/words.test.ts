// Copyright (c) 2026 paulgsc — MIT License

import { READ_FAILED, SECTION_FAILED } from "@suspender/popup/words"
import { describe, expect, it } from "vitest"

/** Machinery that must not reach the popup's words ("State in the person's terms"). */
const MACHINERY =
  /\b(storage|session|query|tabs?\.|commands|api|error|exception|reject|undefined|null|promise)\b/i

describe("the popup's trouble words", () => {
  it.each([...Object.entries(READ_FAILED), ...Object.entries(SECTION_FAILED)])(
    "%s says what is missing, in the person's terms",
    (_, words) => {
      expect(words).not.toMatch(MACHINERY)
    }
  )
})
