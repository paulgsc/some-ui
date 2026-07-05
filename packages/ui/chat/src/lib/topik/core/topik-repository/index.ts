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

import type { ConversationBatch } from "@chat/lib/topik"
import { TopikFileSchema } from "@chat/lib/topik"
import type { ITopikRepository } from "@chat/lib/topik/core/session-types"

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

/**
 * Create repository instance with HTTP loader.
 */
export function createTopikRepository(): TopikRepository {
  const loader = async (key: string): Promise<unknown> => {
    const response = await fetch(key)

    if (!response.ok) {
      throw new Error(
        `Failed to load topik "${key}": ${response.status} ${response.statusText}`
      )
    }

    const json: unknown = await response.json()

    return json
  }

  return new TopikRepository(loader, TopikFileSchema)
}
