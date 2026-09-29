import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { EMPTY_LEDGER, recordObservations } from "@leetype/lib/leetype/ledger"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import {
  createLedgerStore,
  LEDGER_KEY,
} from "@leetype/lib/leetype/ledger/store"
import { nextRound } from "@leetype/lib/leetype/round-sampler"
import { describe, expect, it } from "vitest"

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & {
  values: Map<string, string>
} {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
  }
}

const LEDGER = recordObservations(
  EMPTY_LEDGER,
  observationsOfCommitment({
    answerId: "CW-P6",
    presented: ["CW-P6", "CW-P8"],
    commitment: { kind: "choice", id: "CW-P8" },
    roundId: "count-present-sorted-lookup",
    rewriteKey: "rw:a",
    sessionId: "s1",
    at: 1_790_000_000_000,
  })
)

describe("createLedgerStore", () => {
  it("round-trips a ledger through storage", () => {
    const storage = memoryStorage()
    createLedgerStore(storage).set(LEDGER)
    expect(createLedgerStore(storage).get()).toEqual(LEDGER)
  })

  it("reads a missing, cleared or garbled value as the empty ledger (Thm. 7.2)", () => {
    const storage = memoryStorage()
    expect(createLedgerStore(storage).get()).toEqual(EMPTY_LEDGER)
    storage.setItem(LEDGER_KEY, "{not json")
    expect(createLedgerStore(storage).get()).toEqual(EMPTY_LEDGER)
    storage.setItem(LEDGER_KEY, JSON.stringify({ schema: 99, entries: {} }))
    expect(createLedgerStore(storage).get()).toEqual(EMPTY_LEDGER)
  })

  it("swallows a refused write and keeps the older, still-true value (Prop. 7.2)", () => {
    const storage = memoryStorage()
    const store = createLedgerStore(storage)
    store.set(LEDGER)
    storage.setItem = (): void => {
      throw new Error("QuotaExceededError")
    }
    expect(() => store.set(EMPTY_LEDGER)).not.toThrow()
    expect(store.get()).toEqual(LEDGER)
  })

  it("works with no storage at all", () => {
    const store = createLedgerStore(null)
    store.set(LEDGER)
    expect(store.get()).toEqual(EMPTY_LEDGER)
  })

  it("leaves every round playable from a cleared store (Thm. 7.2)", () => {
    const storage = memoryStorage()
    createLedgerStore(storage).set(LEDGER)
    storage.values.delete(LEDGER_KEY)
    const ledger = createLedgerStore(storage).get()
    const drawn = new Set<string>()
    for (let seed = 1; seed <= 200; seed += 1) {
      drawn.add(nextRound(ledger, AUTHORED_ROUNDS, seed, 0)?.id ?? "none")
    }
    expect([...drawn].sort()).toEqual(
      AUTHORED_ROUNDS.map((round) => round.id).sort()
    )
  })
})
