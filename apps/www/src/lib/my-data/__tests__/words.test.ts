/**
 * @vitest-environment node
 *
 * Everything My data says is in the person's terms (CLAUDE.md, "State in
 * the person's terms"): none of it names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { KINDS } from "@/lib/my-data/model"
import {
  CALL_DELETING,
  DELETABLE_NAMES,
  DELETING,
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
  receiptKind,
  receiptParts,
  RECEIPTS,
  receiptsLine,
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

  it("never name the machinery when deleting, nor on a receipt (MD3)", () => {
    const said = [
      ...strings(DELETING),
      ...strings(DELETABLE_NAMES),
      ...strings(RECEIPTS),
      ...[1, 3].flatMap((n) => [
        DELETING.title("studio", n),
        ...DELETING.goes(n),
        ...DELETING.stays(n),
        DELETING.keep(n),
        DELETING.confirm(n),
        DELETING.gone(n),
        DELETING.kept(1, n),
        DELETING.notHeld(1, n),
        DELETING.unanswered(1, n),
        DELETING.unreachable(n),
        DELETING.deleteSelected(n),
      ]),
      DELETING.rowName(itemName(AT)),
      DELETING.selectName(itemName(AT)),
      ...(["reading", "unpaired", "unreachable", "older", "read"] as const)
        .map(receiptsLine)
        .filter((line): line is string => line !== null),
      receiptParts(["recording", "words", "set-aside mark"]),
      receiptParts(["mailbox copy", "drive copy", "a newer part"]),
      receiptParts([]),
      receiptKind("studio"),
      receiptKind("a newer kind"),
      RECEIPTS.line(receiptKind("studio"), itemName(AT)),
      RECEIPTS.deletedLine(itemName(AT)),
      RECEIPTS.wentLine(receiptParts(["recording"])),
    ]
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
    // Home's fixed words never reach the screen as they are.
    expect(
      said.filter((text) => /set-aside mark|mailbox copy|drive copy/.test(text))
    ).toEqual([])
  })

  it("never name the machinery when letting a call's week go", () => {
    const said = [
      ...strings(CALL_DELETING),
      CALL_DELETING.week("2026-10-30", "2026-11-05"),
      CALL_DELETING.video("95 MB"),
      CALL_DELETING.rest("1.2 GB"),
      CALL_DELETING.goes.video("95 MB"),
      CALL_DELETING.goes.rest("1.2 GB"),
      CALL_DELETING.gone(itemName(AT)),
    ]
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("say what went and stayed as a sentence", () => {
    expect(receiptParts(["recording", "words"])).toBe(
      "The recording and home's words for it"
    )
    expect(receiptParts([])).toBe("Nothing else")
  })

  it("say where home's numbers are missing, and say nothing once they're in", () => {
    expect(homeLine("read")).toBeNull()
    expect(homeLine("unpaired")).toContain("isn't paired")
  })
})
