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

import type { ConversationBatch, TopikFile } from "@chat/lib/topik"
import { TopikFileSchema } from "@chat/lib/topik"

import type { ITopikRepository } from "@chat/lib/topik/core/session-types"

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class TopikRepository implements ITopikRepository {
  constructor(
    private readonly loader: (key: string) => Promise<TopikFile>,
    private readonly validator: typeof TopikFileSchema
  ) {}

  /**
   * Load and validate topik data
   * Pure data access - no caching, no deduplication
   * TanStack Query handles those concerns
   */
  async load(key: string): Promise<Array<ConversationBatch>> {
    const raw = await this.loader(key)

    // Validate schema - throws on invalid data
    const validated = this.validator.parse(raw)

    return validated
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create repository instance with HTTP loader
 *
 * @param baseUrl - Base URL for topik files (e.g., "/data/topiks")
 * @param validator - Zod schema for validation
 */
export function createTopikRepository(): TopikRepository {
  const loader = async (key: string): Promise<TopikFile> => {
    const response = await fetch(`${key}`)

    if (!response.ok) {
      throw new Error(
        `Failed to load topik "${key}": ${response.status} ${response.statusText}`
      )
    }

    return response.json()
  }

  return new TopikRepository(loader, TopikFileSchema)
}
