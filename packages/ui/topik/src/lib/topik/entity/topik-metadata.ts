/**
 * Topik Metadata Types and Schema
 *
 * Lightweight metadata for topik selection UI
 * Separate from full batch data to enable efficient listing
 */

import { z } from "zod"

// ═══════════════════════════════════════════════════════════════════════════
// METADATA TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TopikMetadata = {
  key: string
  displayName: string
  description: string
  batchCount: number
  totalQuestions: number
  totalMessages: number
  difficulty?: "beginner" | "intermediate" | "advanced"
  tags?: Array<string>
}

export const TopikMetadataSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  batchCount: z.number(),
  totalQuestions: z.number(),
  totalMessages: z.number(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tags: z.array(z.string()).optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// MANIFEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manifest file structure
 * Lists all available topiks with metadata
 */
export type TopikManifest = {
  version: string
  topiks: Array<TopikMetadata>
}

export const TopikManifestSchema = z.object({
  version: z.string(),
  topiks: z.array(TopikMetadataSchema),
})

export type TopikManifestFile = z.infer<typeof TopikManifestSchema>
