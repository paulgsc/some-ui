/**
 * The sync's last line: each way a sync ends reads as what came to this
 * phone, and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import type { SyncReport } from "@/lib/device-backend/home-sync"
import type { SyncEnd } from "@/lib/home-link/sync-words"
import { syncLine } from "@/lib/home-link/sync-words"

import { MACHINERY } from "./machinery"

const tally = { listed: 2, added: 1, updated: 1, removed: 1, skipped: 1 }
const report: SyncReport = {
  lessons: tally,
  trees: tally,
  rounds: { ...tally, runs: 3 },
  failed: ["k2-cafe"],
}

const ENDS: ReadonlyArray<SyncEnd> = [
  { kind: "done", report },
  { kind: "stopped" },
  { kind: "busy" },
  { kind: "unreachable" },
  { kind: "storage", summary: "This phone's storage didn't answer." },
  { kind: "other" },
]

describe("syncLine", () => {
  it("says every end in the person's terms", () => {
    const named = ENDS.map(syncLine).filter((line) => MACHINERY.test(line))
    expect(named).toEqual([])
  })
})
