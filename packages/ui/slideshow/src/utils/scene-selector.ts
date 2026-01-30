import type { SceneFileName } from "@slideshow/hooks/use-scene-library"
import type { SceneConfig } from "some-types-utils"

export type SceneSelection = {
  id: string // Unique ID for this selection instance
  fileName: SceneFileName
  instanceIndex: number // For tracking duplicates (0-based)
  sourceConfig?: SceneConfig // Cache the source config to prevent lookup issues
}

/**
 * Generate unique ID for a scene selection
 */
export const generateSelectionId = (
  fileName: SceneFileName,
  instanceIndex: number
): string => {
  return `${fileName}-${instanceIndex}-${Date.now()}`
}

/**
 * Create a scene config instance from a selection
 *
 * INVARIANTS:
 * 1. Scene name = display name from baseConfig + instance suffix
 * 2. Duration = always 60s (baseConfig already normalized to this)
 * 3. UI content = preserved from baseConfig (the actual payload from disk)
 *
 * Note: baseConfig comes from useSceneLibrary which already:
 * - Parsed the UILayoutIntent[] from disk
 * - Normalized it into SceneConfig with proper display name
 * - Set duration to 60s policy default
 */
export const createSceneInstance = (
  baseConfig: SceneConfig,
  selection: SceneSelection,
  overrides?: Partial<SceneConfig>
): SceneConfig => {
  const instanceSuffix =
    selection.instanceIndex > 0 ? ` (${selection.instanceIndex + 1})` : ""

  // baseConfig.scene_name already contains the proper display name
  // (e.g., "Hangul Typing" from useSceneLibrary normalization)
  return {
    ...baseConfig, // Preserves UI content (the actual file payload)
    scene_name: `${baseConfig.scene_name}${instanceSuffix}`,
    // duration and start_time already correct from normalization
    ...overrides,
  }
}

/**
 * Count occurrences of each scene file in selections
 */
export const countSceneOccurrences = (
  selections: Array<SceneSelection>
): Map<SceneFileName, number> => {
  const counts = new Map<SceneFileName, number>()

  selections.forEach((sel) => {
    counts.set(sel.fileName, (counts.get(sel.fileName) || 0) + 1)
  })

  return counts
}

/**
 * Get next instance index for a scene file
 */
export const getNextInstanceIndex = (
  selections: Array<SceneSelection>,
  fileName: SceneFileName
): number => {
  const existing = selections.filter((s) => s.fileName === fileName)
  return existing.length
}

/**
 * Validate scene selections (optional constraints)
 */
export const validateSelections = (
  selections: Array<SceneSelection>,
  options?: {
    maxTotal?: number
    maxPerScene?: number
    requiredScenes?: Array<SceneFileName>
  }
): { valid: boolean; errors: Array<string> } => {
  const errors: Array<string> = []

  if (options.maxTotal && selections.length > options.maxTotal) {
    errors.push(`Cannot exceed ${options.maxTotal} total scenes`)
  }

  if (options.maxPerScene) {
    const counts = countSceneOccurrences(selections)
    counts.forEach((count, fileName) => {
      if (count > options.maxPerScene) {
        errors.push(
          `Scene "${fileName}" appears ${count} times (max: ${options.maxPerScene})`
        )
      }
    })
  }

  if (options.requiredScenes) {
    const selectedFiles = new Set(selections.map((s) => s.fileName))
    const missing = options.requiredScenes.filter(
      (req) => !selectedFiles.has(req)
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
