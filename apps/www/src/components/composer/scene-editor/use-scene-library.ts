/**
 * Scene library: the scene-specific policy (types, normalization, fallback,
 * key derivation) over the generic library loader (`lib/library/load`).
 *
 * QO1: the library is loaded once per page, however many pickers mount
 * (`sceneLibraryQuery`).
 */

import { HttpFileDiscovery, HttpJsonLoader } from "@some-ui/fetch-kit"
import type { SceneConfig } from "@some-ui/types"
import { SceneConfigSchema, UILayoutIntentSchema } from "@some-ui/types"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { z } from "zod"

import type { LibraryConfig } from "@/lib/library/load"
import { loadLibrary } from "@/lib/library/load"

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
  getLibraryItems: () => Array<SceneLibraryItem>
  loading: boolean
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

const sceneLibrary: LibraryConfig<SceneUIFile, SceneConfig> = {
  rootPath: "/scenes",
  extension: ".json",
  discovery: new HttpFileDiscovery("/scenes/manifest.json"),
  loader: new HttpJsonLoader(),
  rawSchema: SceneUIFileSchema,
  normalize: normalizeScene,
  fallback: createFallbackScene,
  deriveKey: deriveSceneKey,
}

/**
 * The scene files are the build's own assets: they change only with it, so a
 * whole load stays fresh for the page. A load that failed or fell back for a
 * file is stale at once, so the next picker to mount asks again.
 */
const sceneLibraryQuery = queryOptions({
  queryKey: ["scene-library"] as const,
  queryFn: () => loadLibrary(sceneLibrary),
  staleTime: ({ state }) =>
    state.data?.kind === "loaded" && state.data.fileErrors.length === 0
      ? Infinity
      : 0,
  gcTime: Infinity,
})

const NO_SCENES: ReadonlyMap<string, SceneConfig> = new Map()

export const useSceneLibrary = (): UseSceneLibraryReturn => {
  const { data } = useQuery(sceneLibraryQuery)
  const library = data?.kind === "loaded" ? data.library : NO_SCENES

  return {
    getLibraryItems: (): Array<SceneLibraryItem> =>
      Array.from(library, ([key, config]) => ({
        key,
        displayName: config.scene_name,
        config,
      })),
    loading: data === undefined,
  }
}
