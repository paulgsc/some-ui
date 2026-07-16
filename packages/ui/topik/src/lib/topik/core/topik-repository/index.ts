/**
 * Topik Repository - Pure Data Access Layer
 *
 * RESPONSIBILITIES:
 * - Fetch remote topik data
 * - Validate schema integrity
 * - Normalize/transform data structure
 *
 * NON-RESPONSIBILITIES (delegated to TanStack Query):
 * - Caching
 * - Request deduplication
 * - Invalidation
 * - Memory management
 * - Lifecycle coordination
 */

import type { ConversationBatch } from "@topik/lib/topik"
import { TopikFileSchema } from "@topik/lib/topik"
import type { ITopikRepository } from "@topik/lib/topik/core/session-types"

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class TopikRepository implements ITopikRepository {
  constructor(
    private readonly loader: (key: string) => Promise<unknown>,
    private readonly validator: typeof TopikFileSchema
  ) {}

  /**
   * Load and validate topik data.
   * Pure data access - no caching, no deduplication.
   * TanStack Query handles those concerns.
   */
  async load(key: string): Promise<Array<ConversationBatch>> {
    const raw = await this.loader(key)

    // Validate schema - throws on invalid data
    return this.validator.parse(raw)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

async function defaultLoader(key: string): Promise<unknown> {
  const response = await fetch(key)

  if (!response.ok) {
    throw new Error(
      `Failed to load topik "${key}": ${response.status} ${response.statusText}`
    )
  }

  const json: unknown = await response.json()

  return json
}

/**
 * Create a repository instance. Defaults to a plain HTTP loader; pass a
 * loader built on `@some-ui/fetch-kit`'s `createDataSource` (or anything
 * else shaped `(key) => Promise<unknown>`) to source batches from wherever
 * the host app resolves them from - a bundled static asset, a local
 * companion server, or otherwise. The repository itself stays agnostic to
 * that choice.
 */
export function createTopikRepository(
  loader: (key: string) => Promise<unknown> = defaultLoader
): TopikRepository {
  return new TopikRepository(loader, TopikFileSchema)
}
