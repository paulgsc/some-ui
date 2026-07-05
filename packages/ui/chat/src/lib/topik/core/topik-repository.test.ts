import type { TopikFile } from "@chat/lib/topik"
import { TopikFileSchema } from "@chat/lib/topik"
import { describe, expect, it, vi } from "vitest"

import { TopikRepository } from "./topik-repository"

describe("TopikRepository", () => {
  it("returns validated batches when the payload matches the schema", async () => {
    const valid: TopikFile = [
      {
        id: 0,
        messages: [
          {
            id: "m0",
            role: "assistant",
            content: "hello",
            timestamp: new Date(2024, 0, 1).toISOString(),
            korean: "안녕",
            english: "hello",
          },
        ],
        questions: [],
      },
    ]
    const loader = vi.fn().mockResolvedValue(valid)
    const repository = new TopikRepository(loader, TopikFileSchema)

    await expect(repository.load("k1")).resolves.toEqual(valid)
    expect(loader).toHaveBeenCalledWith("k1")
  })

  it("throws when the payload is not an array", async () => {
    const loader = vi.fn().mockResolvedValue({ oops: "not a list" })
    const repository = new TopikRepository(loader, TopikFileSchema)

    await expect(repository.load("k1")).rejects.toThrow()
  })

  it("throws when a batch is missing required message fields", async () => {
    const malformed = [
      {
        id: 0,
        messages: [{ id: "m0" }], // missing role/content/timestamp/korean/english
        questions: [],
      },
    ]
    const loader = vi.fn().mockResolvedValue(malformed)
    const repository = new TopikRepository(loader, TopikFileSchema)

    await expect(repository.load("k1")).rejects.toThrow()
  })
})
