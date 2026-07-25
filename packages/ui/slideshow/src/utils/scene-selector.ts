import type { SceneConfig } from "@some-ui/types"

export type SceneSelection = {
  id: string // Unique ID for this selection instance
  sceneKey: string // The unique slug/key for the library item (e.g., "hangul-typing")
  instanceIndex: number // For tracking duplicates (0-based)
  sourceConfig?: SceneConfig // Cache the source config to prevent lookup issues
}

/**
 * Generate unique ID for a scene selection
 */
export const generateSelectionId = (
  sceneKey: string,
  instanceIndex: number
): string => {
  return `${sceneKey}-${instanceIndex}-${Date.now()}`
}

/**
 * Create a scene config instance from a selection
 */
export const createSceneInstance = (
  baseConfig: SceneConfig,
  selection: SceneSelection,
  overrides?: Partial<SceneConfig>
): SceneConfig => {
  const instanceSuffix =
    selection.instanceIndex > 0 ? ` (${selection.instanceIndex + 1})` : ""

  return {
    ...baseConfig,
    scene_name: `${baseConfig.scene_name}${instanceSuffix}`,
    ...overrides,
  }
}

/**
 * Count occurrences of each scene key in selections
 */
export const countSceneOccurrences = (
  selections: Array<SceneSelection>
): Map<string, number> => {
  const counts = new Map<string, number>()

  selections.forEach((sel) => {
    counts.set(sel.sceneKey, (counts.get(sel.sceneKey) || 0) + 1)
  })

  return counts
}

/**
 * Get next instance index for a scene key
 */
export const getNextInstanceIndex = (
  selections: Array<SceneSelection>,
  sceneKey: string
): number => {
  const existing = selections.filter((s) => s.sceneKey === sceneKey)
  return existing.length
}

/**
 * Validate scene selections
 */
export const validateSelections = (
  selections: Array<SceneSelection>,
  options: {
    maxTotal?: number
    maxPerScene?: number
    requiredScenes?: Array<string>
  }
): { valid: boolean; errors: Array<string> } => {
  const errors: Array<string> = []

  // if options.maxTotal is always passed as a number, TypeScript will flag the check
  if (options.maxTotal !== undefined && selections.length > options.maxTotal) {
    errors.push(`Cannot exceed ${options.maxTotal} total scenes`)
  }

  if (options.maxPerScene !== undefined) {
    const counts = countSceneOccurrences(selections)
    counts.forEach((count, sceneKey) => {
      if (count > (options.maxPerScene ?? 0)) {
        errors.push(
          `Scene "${sceneKey}" appears ${count} times (max: ${options.maxPerScene ?? 0})`
        )
      }
    })
  }

  if (options.requiredScenes && options.requiredScenes.length > 0) {
    const selectedKeys = new Set(selections.map((s) => s.sceneKey))
    const missing = options.requiredScenes.filter(
      (req) => !selectedKeys.has(req)
    )
    if (missing.length > 0) {
      errors.push(`Missing required scenes: ${missing.join(", ")}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
