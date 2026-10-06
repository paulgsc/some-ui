/**
 * Scene library: the scene-specific policy (types, normalization, fallback,
 * key derivation) over the generic library engine. No discovery or loading.
 */

import { HttpFileDiscovery, HttpJsonLoader } from "@some-ui/fetch-kit"
import type { SceneConfig } from "@some-ui/types"
import { SceneConfigSchema, UILayoutIntentSchema } from "@some-ui/types"
import { z } from "zod"

import { useRecursiveLibrary } from "@/hooks/use-recursive-library"

/** Raw file format: array of UI layout intents */
const SceneUIFileSchema = z.array(UILayoutIntentSchema)
type SceneUIFile = z.infer<typeof SceneUIFileSchema>

/** Library item for consumer convenience */
type SceneLibraryItem = {
  key: string
  displayName: string
  config: SceneConfig
}

/** Return type for the scene library hook */
export type UseSceneLibraryReturn = {
  getScene: (key: string) => SceneConfig | undefined
  getLibraryItems: () => Array<SceneLibraryItem>
  library: Map<string, SceneConfig>
  loading: boolean
  reload: () => Promise<void>
  entries: () => Array<[string, SceneConfig]>
  get: (key: string) => SceneConfig | undefined
}

/**
 * Raw UI array → full SceneConfig: library scenes default to 60s, start at 0,
 * and take `scene_name` from the key.
 */
const normalizeScene = (key: string, ui: SceneUIFile): SceneConfig => {
  return SceneConfigSchema.parse({
    scene_name: key,
    duration: 60_000, // Policy: 60 second default
    start_time: 0, // Policy: always start at 0
    ui,
  })
}

/** A minimal valid scene for when a file fails to load. */
const createFallbackScene = (key: string): SceneConfig => ({
  scene_name: key,
  duration: 60_000,
  start_time: 0,
  ui: [],
})

/** "/scenes/hangul-typing.json" → "hangul-typing" */
const deriveSceneKey = (filePath: string): string => {
  const fileName = filePath.split("/").pop() ?? ""
  return fileName.replace(".json", "")
}

/** The scene-specific configuration for the generic library engine. */
export const useSceneLibrary = (): UseSceneLibraryReturn => {
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
    reload: result.reload,
  }
}
