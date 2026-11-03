/**
 * @vitest-environment node
 *
 * Everything My data says is in the person's terms (CLAUDE.md, "State in
 * the person's terms"): none of it names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { KINDS } from "@/lib/my-data/model"
import { RECORD_KINDS } from "@/lib/my-data/record"
import {
  homeLine,
  itemLine,
  itemName,
  KEPT_FOR_GOOD,
  keptLine,
  keptNote,
  KIND_NAMES,
  kindLead,
  kindLine,
  MY_DATA,
  unreadLine,
  WHERE_WORDS,
} from "@/lib/my-data/words"

/** Every string in `value`, however deep. */
function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function") return []
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const AT = "2026-10-20T09:00:00.000Z"

describe("My data's words", () => {
  it("name every kind of recording home keeps", () => {
    expect(Object.keys(KIND_NAMES).sort()).toEqual([...KINDS].sort())
  })

  it("name every kind of record kept for good, in its order", () => {
    expect(Object.keys(KEPT_FOR_GOOD)).toEqual([...RECORD_KINDS])
  })

  it("never name the machinery", () => {
    const said = [
      ...strings(MY_DATA),
      ...strings(KIND_NAMES),
      ...strings(WHERE_WORDS),
      ...Object.values(KEPT_FOR_GOOD),
      keptLine({ count: 12, since: AT }),
      keptLine(undefined),
      ...(["older", "unreachable"] as const)
        .map((kind) => keptNote({ kind }))
        .filter((line): line is string => line !== null),
      ...(["reading", "unpaired", "unreachable", "older", "read"] as const)
        .map(homeLine)
        .filter((line): line is string => line !== null),
      MY_DATA.kind.play(itemName(AT)),
      MY_DATA.kind.stop(itemName(AT)),
      MY_DATA.kind.newest(5, 8),
      ...[unreadLine(["studio"]), unreadLine(["studio", "soundbite"])].filter(
        (line): line is string => line !== null
      ),
      kindLine(4, AT, true),
      kindLead(4, 2_048, AT),
      itemLine(AT, 2_048),
    ]
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("say where home's numbers are missing, and say nothing once they're in", () => {
    expect(homeLine("read")).toBeNull()
    expect(homeLine("unpaired")).toContain("isn't paired")
  })
})
