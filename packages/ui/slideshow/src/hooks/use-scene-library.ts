/**
 * Scene Library - Domain-Specific Adapter
 *
 * This is the thin specialization layer that defines:
 * - Scene-specific types
 * - Scene normalization policy
 * - Scene fallback policy
 * - Scene key derivation
 *
 * No discovery logic, no loading logic, purely policy.
 */

import type { SceneConfig } from "some-types-utils"
import { SceneConfigSchema, UILayoutIntentSchema } from "some-types-utils"
import {
  HttpFileDiscovery,
  HttpJsonLoader,
  useRecursiveLibrary,
} from "some-ui-utils"
import { z } from "zod"

// -----------------------------
// Scene-Specific Types
// -----------------------------

/** Raw file format: array of UI layout intents */
const SceneUIFileSchema = z.array(UILayoutIntentSchema)
type SceneUIFile = z.infer<typeof SceneUIFileSchema>

/** Library item for consumer convenience */
export type SceneLibraryItem = {
  key: string
  displayName: string
  config: SceneConfig
}

// -----------------------------
// Scene Normalization Policy
// -----------------------------

/**
 * Transform raw UI array into full SceneConfig
 * This encodes domain policy:
 * - All library scenes default to 60s duration
 * - All library scenes start at 0
 * - scene_name is derived from key
 */
const normalizeScene = (key: string, ui: SceneUIFile): SceneConfig => {
  return SceneConfigSchema.parse({
    scene_name: key,
    duration: 60_000, // Policy: 60 second default
    start_time: 0, // Policy: always start at 0
    ui,
  })
}

// -----------------------------
// Scene Fallback Policy
// -----------------------------

/**
 * Create a minimal valid scene when file load fails
 */
const createFallbackScene = (key: string): SceneConfig => ({
  scene_name: key,
  duration: 60_000,
  start_time: 0,
  ui: [],
})

// -----------------------------
// Scene Key Derivation
// -----------------------------

/**
 * Extract scene key from file path
 * Example: "/scenes/hangul-typing.json" → "hangul-typing"
 */
const deriveSceneKey = (filePath: string): string => {
  const fileName = filePath.split("/").pop() ?? ""
  return fileName.replace(".json", "")
}

// -----------------------------
// Scene Library Hook
// -----------------------------

/**
 * Scene-specific library hook
 *
 * This is now a thin wrapper that only provides scene-specific configuration
 * to the generic recursive library engine.
 */
export const useSceneLibrary = () => {
  const result = useRecursiveLibrary<SceneUIFile, SceneConfig>({
    rootPath: "/scenes",
    extension: ".json",
    discovery: new HttpFileDiscovery("/scenes/manifest.json"),
    loader: new HttpJsonLoader(),
    rawSchema: SceneUIFileSchema,
    normalize: normalizeScene,
    fallback: createFallbackScene,
    deriveKey: deriveSceneKey,
  })

  // Add scene-specific convenience methods
  const getLibraryItems = (): Array<SceneLibraryItem> => {
    return result.entries().map(([key, config]) => ({
      key,
      displayName: config.scene_name,
      config,
    }))
  }

  const getScene = (key: string): SceneConfig | undefined => {
    return result.get(key)
  }

  return {
    ...result,
    getScene,
    getLibraryItems,
    // Maintain backward compatibility
    library: result.library,
    loading: result.loading,
    error: result.error,
    reload: result.reload,
  }
}

// -----------------------------
// Alternative: Vite-based Scene Library
// -----------------------------

/**
 * If you prefer compile-time discovery with Vite import.meta.glob
 *
 * Usage in your app:
 * ```ts
 * const sceneModules = import.meta.glob("/scenes/*.json")
 * const library = useSceneLibraryVite(sceneModules)
 * ```
 */
export const useSceneLibraryVite = (
  modules: Record<string, () => Promise<unknown>>
) => {
  const { ViteGlobDiscovery } = require("./file-discovery")
  const { ViteModuleLoader } = require("./resource-loader")

  return useRecursiveLibrary<SceneUIFile, SceneConfig>({
    rootPath: "/scenes",
    extension: ".json",
    discovery: new ViteGlobDiscovery("/scenes/*.json", modules),
    loader: new ViteModuleLoader(modules),
    rawSchema: SceneUIFileSchema,
    normalize: normalizeScene,
    fallback: createFallbackScene,
    deriveKey: deriveSceneKey,
  })
}
