import { describe, expect, it } from "vitest"

import {
  enqueue,
  isFull,
  MAX_QUEUE_SIZE,
  oldestEntry,
  removeEntry,
  updateEntryStatus,
} from "./queue"
import type { JobEntry } from "./types"

function fillQueue(size: number): ReadonlyArray<JobEntry> {
  let queue: ReadonlyArray<JobEntry> = []
  for (let i = 0; i < size; i += 1) {
    const result = enqueue(
      queue,
      { company: `Company ${i}`, role: "Software Engineer" },
      `job-${i}`,
      new Date(2026, 0, i + 1).toISOString()
    )
    if (!result.ok) throw new Error("test setup: enqueue unexpectedly failed")
    queue = result.queue
  }
  return queue
}

describe("enqueue", () => {
  it("adds a new entry with the supplied id and timestamp", () => {
    const result = enqueue(
      [],
      { company: "Acme", role: "Backend Engineer" },
      "job-1",
      "2026-01-01T00:00:00.000Z"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entry).toEqual({
      id: "job-1",
      company: "Acme",
      role: "Backend Engineer",
      url: null,
      status: "saved",
      notes: null,
      addedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(result.queue).toHaveLength(1)
  })

  it("trims whitespace and turns blank optional fields into null", () => {
    const result = enqueue(
      [],
      { company: "  Acme  ", role: " Engineer ", url: "   ", notes: "" },
      "job-1",
      "2026-01-01T00:00:00.000Z"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entry.company).toBe("Acme")
    expect(result.entry.role).toBe("Engineer")
    expect(result.entry.url).toBeNull()
    expect(result.entry.notes).toBeNull()
  })

  it("rejects a blank company or role instead of enqueuing a useless entry", () => {
    const result = enqueue(
      [],
      { company: "   ", role: "Engineer" },
      "job-1",
      "2026-01-01T00:00:00.000Z"
    )
    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: "Company and role are both required.",
    })
  })

  it("blocks adding past MAX_QUEUE_SIZE rather than growing without bound", () => {
    const full = fillQueue(MAX_QUEUE_SIZE)
    expect(isFull(full)).toBe(true)

    const result = enqueue(
      full,
      { company: "One too many", role: "Engineer" },
      "job-overflow",
      "2026-02-01T00:00:00.000Z"
    )
    expect(result).toEqual({
      ok: false,
      reason: "full",
      capacity: MAX_QUEUE_SIZE,
    })
    // The queue itself is untouched by a rejected enqueue.
    expect(full).toHaveLength(MAX_QUEUE_SIZE)
  })

  it("accepts an add again once a resolved (offer/rejected) entry frees a slot, with no removal needed", () => {
    const full = fillQueue(MAX_QUEUE_SIZE)
    const resolved = updateEntryStatus(full, "job-0", "rejected")
    expect(resolved).toHaveLength(MAX_QUEUE_SIZE) // nothing removed
    expect(isFull(resolved)).toBe(false) // but no longer counts as full

    const result = enqueue(
      resolved,
      { company: "Room via resolution", role: "Engineer" },
      "job-new",
      "2026-02-01T00:00:00.000Z"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.queue).toHaveLength(MAX_QUEUE_SIZE + 1)
  })

  it("accepts an add again once the queue has room after a removal", () => {
    const full = fillQueue(MAX_QUEUE_SIZE)
    const pruned = removeEntry(full, "job-0")
    expect(isFull(pruned)).toBe(false)

    const result = enqueue(
      pruned,
      { company: "Now there's room", role: "Engineer" },
      "job-new",
      "2026-02-01T00:00:00.000Z"
    )
    expect(result.ok).toBe(true)
  })
})

describe("removeEntry", () => {
  it("removes only the matching id", () => {
    const queue = fillQueue(3)
    const result = removeEntry(queue, "job-1")
    expect(result.map((entry) => entry.id)).toEqual(["job-0", "job-2"])
  })

  it("is a no-op for an id that isn't in the queue", () => {
    const queue = fillQueue(2)
    expect(removeEntry(queue, "does-not-exist")).toEqual(queue)
  })
})

describe("updateEntryStatus", () => {
  it("updates only the targeted entry's status", () => {
    const queue = fillQueue(2)
    const result = updateEntryStatus(queue, "job-0", "applied")
    expect(result.find((entry) => entry.id === "job-0")?.status).toBe("applied")
    expect(result.find((entry) => entry.id === "job-1")?.status).toBe("saved")
  })
})

describe("oldestEntry", () => {
  it("returns null for an empty queue", () => {
    expect(oldestEntry([])).toBeNull()
  })

  it("returns the entry with the earliest addedAt", () => {
    const queue = fillQueue(5)
    expect(oldestEntry(queue)?.id).toBe("job-0")
  })

  it("ignores insertion order when addedAt says otherwise", () => {
    const queue: ReadonlyArray<JobEntry> = [
      {
        id: "later",
        company: "A",
        role: "R",
        url: null,
        status: "saved",
        notes: null,
        addedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "earlier",
        company: "B",
        role: "R",
        url: null,
        status: "saved",
        notes: null,
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    expect(oldestEntry(queue)?.id).toBe("earlier")
  })
})
