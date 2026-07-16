/**
 * Topik Metadata Repository
 *
 * Fetches lightweight metadata for topik selection
 * Separate from full batch loading
 */

import type {
  ITopikMetadataRepository,
  TopikManifestFile,
} from "@topik/lib/topik"
import { TopikManifestSchema } from "@topik/lib/topik"

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class TopikMetadataRepository implements ITopikMetadataRepository {
  constructor(
    private readonly loader: () => Promise<unknown>,
    private readonly validator: typeof TopikManifestSchema
  ) {}

  async loadCatalog(): Promise<TopikManifestFile> {
    const raw = await this.loader()
    return this.validator.parse(raw)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a repository instance. `source` is either a manifest URL (plain
 * HTTP loader, the existing default) or a loader function - pass a loader
 * built on `@some-ui/fetch-kit`'s `createDataSource` to source the manifest
 * from wherever the host app resolves it from (a bundled static asset, a
 * local companion server, or otherwise) without this repository knowing
 * which.
 */
export function createTopikMetadataRepository(
  source: string | (() => Promise<unknown>)
): TopikMetadataRepository {
  const loader = typeof source === "function" ? source : defaultLoader(source)

  return new TopikMetadataRepository(loader, TopikManifestSchema)
}

function defaultLoader(manifestUrl: string): () => Promise<unknown> {
  return async () => {
    const response = await fetch(manifestUrl)
    if (!response.ok) {
      throw new Error(
        `Failed to load topik manifest: ${response.status} ${response.statusText}`
      )
    }
    const json: unknown = await response.json()

    return json
  }
}
