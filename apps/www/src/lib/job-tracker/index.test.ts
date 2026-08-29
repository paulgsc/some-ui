import { MAX_QUEUE_SIZE } from "@some-ui/job-tracker"
import { beforeEach, describe, expect, it } from "vitest"

import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage } from "@/lib/tenant/storage"

import { createJobTrackerRepository } from "."

let storage: StorageAdapter

beforeEach(() => {
  storage = createInMemoryStorage()
})

describe("JobTrackerRepository", () => {
  it("starts empty", () => {
    const repo = createJobTrackerRepository(storage)
    expect(repo.list()).toEqual([])
  })

  it("adds an entry and persists it under a namespaced storage key", () => {
    const repo = createJobTrackerRepository(storage)
    const result = repo.add({ company: "Acme", role: "Backend Engineer" })
    expect(result.ok).toBe(true)
    expect(repo.list()).toHaveLength(1)
    expect(repo.list()[0]?.company).toBe("Acme")

    // A second repository instance over the same storage sees the same data
    // — this is the whole point of routing every read through the
    // StorageAdapter rather than an in-memory field on the class.
    const reopened = createJobTrackerRepository(storage)
    expect(reopened.list()).toHaveLength(1)
  })

  it("rejects an add once the queue is full, leaving existing entries untouched", () => {
    const repo = createJobTrackerRepository(storage)
    for (let i = 0; i < MAX_QUEUE_SIZE; i += 1) {
      const result = repo.add({ company: `Company ${i}`, role: "Engineer" })
      expect(result.ok).toBe(true)
    }

    const overflow = repo.add({ company: "One too many", role: "Engineer" })
    expect(overflow).toEqual({
      ok: false,
      reason: "full",
      capacity: MAX_QUEUE_SIZE,
    })
    expect(repo.list()).toHaveLength(MAX_QUEUE_SIZE)
  })

  it("removes an entry by id", () => {
    const repo = createJobTrackerRepository(storage)
    repo.add({ company: "Acme", role: "Engineer" })
    const [entry] = repo.list()

    repo.remove(entry.id)
    expect(repo.list()).toEqual([])
  })

  it("updates an entry's status without touching the rest of the queue", () => {
    const repo = createJobTrackerRepository(storage)
    repo.add({ company: "Acme", role: "Engineer" })
    const [entry] = repo.list()

    repo.updateStatus(entry.id, "interviewing")
    expect(repo.list()[0]?.status).toBe("interviewing")
    expect(repo.list()[0]?.company).toBe("Acme")
  })

  it("reports the oldest entry for a prune affordance", () => {
    const repo = createJobTrackerRepository(storage)
    expect(repo.oldest()).toBeNull()

    repo.add({ company: "First", role: "Engineer" })
    repo.add({ company: "Second", role: "Engineer" })
    expect(repo.oldest()?.company).toBe("First")
  })
})
