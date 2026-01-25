import { useEffect, useState } from "react"
import type { SceneConfig, UILayoutIntent } from "some-types-utils"
import { SceneConfigSchema, UILayoutIntentSchema } from "some-types-utils"
import { z } from "zod"

// -----------------------------
// Compile-time known files
// -----------------------------
export const SCENE_FILES = [
  "assessment",
  "cdrama",
  "constant",
  "hangul-typing",
  "leetype",
  "topik",
  "voice",
] as const

export type SceneFileName = (typeof SCENE_FILES)[number]

const SceneUIFileSchema = z.array(UILayoutIntentSchema)

export type SceneLibraryItem = {
  fileName: SceneFileName
  displayName: string
  config: SceneConfig // Normalized view for consumers
}

// -----------------------------
// Fallback
// -----------------------------
const createFallbackScene = (fileName: SceneFileName): SceneConfig => ({
  scene_name: fileName,
  duration: 60_000,
  start_time: 0,
  ui: [],
})

// -----------------------------
// Display name normalization
// -----------------------------
const toCamelCase = (fileName: SceneFileName): string => {
  return fileName
    .split("-")
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("")
}

export const useSceneLibrary = () => {
  const [library, setLibrary] = useState<Map<SceneFileName, SceneConfig>>(
    new Map()
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSceneLibrary()
  }, [])

  const loadSceneLibrary = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const loadedScenes = new Map<SceneFileName, SceneConfig>()

      await Promise.all(
        SCENE_FILES.map(async (fileName) => {
          try {
            // Fetch the UI intent array from disk
            const res = await fetch(`/scenes/${fileName}.json`)
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`)
            }

            const rawJson = await res.json()

            const ui: Array<UILayoutIntent> = SceneUIFileSchema.parse(rawJson)

            const scene: SceneConfig = SceneConfigSchema.parse({
              scene_name: toCamelCase(fileName),
              duration: 60_000, // Policy: all library scenes default to 60s
              start_time: 0,
              ui,
            })

            loadedScenes.set(fileName, scene)

            console.log(`[SceneLibrary] Loaded ${fileName}:`, {
              uiIntents: ui.length,
              displayName: scene.scene_name,
            })
          } catch (err) {
            console.warn(
              `[SceneLibrary] Failed to load ${fileName}, using fallback`,
              err
            )
            loadedScenes.set(fileName, createFallbackScene(fileName))
          }
        })
      )

      setLibrary(loadedScenes)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load scene library"
      )
    } finally {
      setLoading(false)
    }
  }

  const getScene = (fileName: SceneFileName): SceneConfig | undefined =>
    library.get(fileName)

  const getLibraryItems = (): Array<SceneLibraryItem> =>
    Array.from(library.entries()).map(([fileName, config]) => ({
      fileName,
      displayName: config.scene_name,
      config,
    }))

  return {
    library,
    loading,
    error,
    getScene,
    getLibraryItems,
    reload: loadSceneLibrary,
  }
}
