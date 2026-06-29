/**
 * Topik Metadata Repository
 *
 * Fetches lightweight metadata for topik selection
 * Separate from full batch loading
 */

import type {
  ITopikMetadataRepository,
  TopikManifestFile,
} from "@chat/lib/topik"
import { TopikManifestSchema } from "@chat/lib/topik"

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class TopikMetadataRepository implements ITopikMetadataRepository {
  constructor(
    private readonly loader: () => Promise<TopikManifestFile>,
    private readonly validator: typeof TopikManifestSchema
  ) {}

  async loadCatalog(): Promise<TopikManifestFile> {
    const raw = await this.loader()
    const validated = this.validator.parse(raw)
    return validated
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createTopikMetadataRepository(
  manifestUrl: string
): TopikMetadataRepository {
  const loader = async (): Promise<TopikManifestFile> => {
    const response = await fetch(manifestUrl)
    if (!response.ok) {
      throw new Error(
        `Failed to load topik manifest: ${response.status} ${response.statusText}`
      )
    }
    const data: TopikManifestFile = await response.json()
    return data
  }

  return new TopikMetadataRepository(loader, TopikManifestSchema)
}
