/**
 * Topik Library - Domain-Specific Adapter
 *
 * Discovers and loads topik conversation batches from /public/topiks/
 * Uses the recursive library architecture for runtime discovery.
 */

import type { ConversationBatch } from "@chat/types/topik"
import {
  HttpFileDiscovery,
  HttpJsonLoader,
  useRecursiveLibrary,
} from "some-ui-utils"
import { z } from "zod"

// -----------------------------
// Topik-Specific Types
// -----------------------------

/** Raw file format: array of conversation batches */
const TopikFileSchema = z.array(
  z.object({
    id: z.string(),
    messages: z.array(
      z.object({
        id: z.string(),
        speaker: z.string(),
        text: z.string(),
        translation: z.string(),
      })
    ),
    questions: z.array(
      z.object({
        id: z.string(),
        type: z.enum(["multiple-choice", "text-input"]),
        text: z.string(),
        options: z.array(z.string()).optional(),
        correctAnswer: z.string(),
        explanation: z.string(),
        grammarNote: z.string().optional(),
      })
    ),
  })
)

type TopikFile = z.infer<typeof TopikFileSchema>

/** Topik library item for display and selection */
export type TopikLibraryItem = {
  key: string
  displayName: string
  description: string
  batches: Array<ConversationBatch>
  batchCount: number
  totalQuestions: number
}

// -----------------------------
// Topik Normalization Policy
// -----------------------------

/**
 * Transform raw topik file into structured format
 * Extracts metadata for display purposes
 */
const normalizeTopik = (key: string, batches: TopikFile): TopikLibraryItem => {
  // Derive display name from key (e.g., "intermediate-daily" → "Intermediate Daily")
  const displayName = key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  // Calculate total questions across all batches
  const totalQuestions = batches.reduce(
    (sum, batch) => sum + batch.questions.length,
    0
  )

  // Generate description based on content
  const description = `${batches.length} conversation${
    batches.length === 1 ? "" : "s"
  }, ${totalQuestions} question${totalQuestions === 1 ? "" : "s"}`

  return {
    key,
    displayName,
    description,
    batches,
    batchCount: batches.length,
    totalQuestions,
  }
}

// -----------------------------
// Topik Fallback Policy
// -----------------------------

/**
 * Create a minimal valid topik when file load fails
 */
const createFallbackTopik = (key: string): TopikLibraryItem => {
  const displayName = key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return {
    key,
    displayName,
    description: "Failed to load",
    batches: [],
    batchCount: 0,
    totalQuestions: 0,
  }
}

// -----------------------------
// Topik Key Derivation
// -----------------------------

/**
 * Extract topik key from file path
 * Example: "/topiks/intermediate-daily.json" → "intermediate-daily"
 */
const deriveTopikKey = (filePath: string): string => {
  const fileName = filePath.split("/").pop() ?? ""
  return fileName.replace(".json", "")
}

// -----------------------------
// Topik Library Hook
// -----------------------------

/**
 * Topik-specific library hook
 *
 * Discovers all topik files from /topiks/ and provides:
 * - Selection UI data
 * - Batches for a specific topik
 * - Loading states
 */
export const useTopikLibrary = () => {
  const result = useRecursiveLibrary<TopikFile, TopikLibraryItem>({
    rootPath: "/topiks",
    extension: ".json",
    discovery: new HttpFileDiscovery("/topiks/manifest.json"),
    loader: new HttpJsonLoader(),
    rawSchema: TopikFileSchema,
    normalize: normalizeTopik,
    fallback: createFallbackTopik,
    deriveKey: deriveTopikKey,
  })

  // Add topik-specific convenience methods
  const getTopikItems = (): Array<TopikLibraryItem> => {
    return result
      .items()
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  const getTopik = (key: string): TopikLibraryItem | undefined => {
    return result.get(key)
  }

  const getTopikBatches = (
    key: string
  ): Array<ConversationBatch> | undefined => {
    const topik = result.get(key)
    return topik?.batches
  }

  return {
    ...result,
    getTopikItems,
    getTopik,
    getTopikBatches,
    // Maintain backward compatibility
    library: result.library,
    loading: result.loading,
    error: result.error,
    reload: result.reload,
  }
}

// -----------------------------
// Alternative: Vite-based Topik Library
// -----------------------------

/**
 * If you prefer compile-time discovery with Vite import.meta.glob
 *
 * Usage in your app:
 * ```ts
 * const topikModules = import.meta.glob("/topiks/*.json")
 * const library = useTopikLibraryVite(topikModules)
 * ```
 */
export const useTopikLibraryVite = (
  modules: Record<string, () => Promise<unknown>>
) => {
  const { ViteGlobDiscovery } = require("./file-discovery")
  const { ViteModuleLoader } = require("./resource-loader")

  return useRecursiveLibrary<TopikFile, TopikLibraryItem>({
    rootPath: "/topiks",
    extension: ".json",
    discovery: new ViteGlobDiscovery("/topiks/*.json", modules),
    loader: new ViteModuleLoader(modules),
    rawSchema: TopikFileSchema,
    normalize: normalizeTopik,
    fallback: createFallbackTopik,
    deriveKey: deriveTopikKey,
  })
}
