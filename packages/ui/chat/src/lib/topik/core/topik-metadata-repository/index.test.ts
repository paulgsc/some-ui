import type { TopikManifestFile } from "@chat/lib/topik"
import { TopikManifestSchema } from "@chat/lib/topik"
import { describe, expect, it, vi } from "vitest"

import { TopikMetadataRepository } from "."

describe("TopikMetadataRepository", () => {
  it("returns the validated manifest when the payload matches the schema", async () => {
    const valid: TopikManifestFile = {
      version: "1",
      topiks: [
        {
          key: "t1",
          displayName: "Topik 1",
          description: "d",
          batchCount: 1,
          totalQuestions: 1,
          totalMessages: 1,
        },
      ],
    }
    const loader = vi.fn().mockResolvedValue(valid)
    const repository = new TopikMetadataRepository(loader, TopikManifestSchema)

    await expect(repository.loadCatalog()).resolves.toEqual(valid)
  })

  it("throws when a topik entry is missing required fields", async () => {
    const malformed = {
      version: "1",
      topiks: [{ key: "t1" }], // missing displayName/description/batchCount/...
    }
    const loader = vi.fn().mockResolvedValue(malformed)
    const repository = new TopikMetadataRepository(loader, TopikManifestSchema)

    await expect(repository.loadCatalog()).rejects.toThrow()
  })

  it("throws when topiks is not an array", async () => {
    const malformed = { version: "1", topiks: "not-an-array" }
    const loader = vi.fn().mockResolvedValue(malformed)
    const repository = new TopikMetadataRepository(loader, TopikManifestSchema)

    await expect(repository.loadCatalog()).rejects.toThrow()
  })
})
