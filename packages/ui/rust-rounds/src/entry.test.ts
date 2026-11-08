/**
 * Practice Home's line for the week (RR13), read lightly from what the
 * week's stores and apps/www's takes desk really write: the same week the
 * screen opens on (`currentWeek`), its deadline and the tickets said, then
 * what was sent, then that it closed; the rounds' line while no week is held.
 */
import { rustWeekEntry } from "@rust-rounds/entry"
import { WEEK_TAKES_KEY } from "@rust-rounds/lib/play/keys"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { CARD_WORDS } from "@rust-rounds/lib/week-play/card-words"
import { currentWeek } from "@rust-rounds/lib/week-play/runtime"
import { weeksSent } from "@rust-rounds/lib/week-play/store"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import { keptWeeks } from "@rust-rounds/lib/weeks"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const held = (id: string, opens: string): HeldWeek => ({
  week: { ...QUILLMOSS_WEEK, id, opens },
  sha256: "a",
  runs: {},
  ended: [],
})

const W46 = held("2026-w46", QUILLMOSS_WEEK.opens)
const W47 = held("2026-w47", "2026-11-16T00:00:00-08:00")
const MID_46 = Date.parse("2026-11-11T18:00:00Z")

/** A take on the desk as apps/www's `lib/takes-desk` keeps it. */
const take = (line: string, over: object = {}): object => ({
  id: line,
  line,
  takenAt: MID_46,
  durationMs: 3_000,
  mimeType: "audio/webm",
  waits: true,
  ...over,
})

describe("Practice Home's line for the week (RR13)", () => {
  it("is null while the phone holds no week", () => {
    expect(rustWeekEntry(inMemoryStorage(), MID_46)).toBeNull()
  })

  it("names the week the screen opens on, its deadline, and the tickets said", () => {
    const storage = inMemoryStorage()
    // Stored newest first, as an exchange reads them.
    keptWeeks(storage).hold({ weeks: [W47, W46], unread: [] })
    storage.setItem(
      WEEK_TAKES_KEY,
      JSON.stringify([
        take("2026-w46:QM-311"),
        take("2026-w46:QM-312", { standing: "earlier" }),
        take("2026-w46:PASTE:2026-11-11T18:00:00.000Z"),
      ])
    )
    expect(currentWeek([W47, W46], MID_46)).toBe(W46)
    expect(rustWeekEntry(storage, MID_46)).toBe(CARD_WORDS.open(W46.week, 1, 3))
    // Before either opens, the one that opens first.
    const before = Date.parse("2026-11-01T00:00:00Z")
    expect(currentWeek([W47, W46], before)).toBe(W46)
    expect(rustWeekEntry(storage, before)).toBe(CARD_WORDS.open(W46.week, 1, 3))
  })

  it("says what was sent, then that the week closed", () => {
    const storage = inMemoryStorage()
    keptWeeks(storage).hold({ weeks: [W46], unread: [] })
    const after = Date.parse(QUILLMOSS_WEEK.due) + 60_000
    expect(rustWeekEntry(storage, after)).toBe(CARD_WORDS.closed(W46.week))
    weeksSent(storage).keep(() => [
      {
        week: "2026-w46",
        at: "2026-11-12T00:00:00.000Z",
        answers: [{ ticket: "QM-311", take: "t", recordedAt: "x" }],
        passed: ["QM-312", "QM-313"],
      },
    ])
    expect(rustWeekEntry(storage, MID_46)).toBe(CARD_WORDS.sent(1, 3))
  })
})
