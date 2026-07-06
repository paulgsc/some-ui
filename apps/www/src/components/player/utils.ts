import { getActivityByRegistryKey } from "@/lib/activity-catalog"

type MinimalUiLayer = { panels?: Record<string, { registry_key: string }> }

/** Translates a scene's registry_key into its Activity Catalog friendly name. */
export function friendlyActivityName(
  sceneName: string,
  ui: ReadonlyArray<MinimalUiLayer> | undefined
): string {
  const registryKey = ui?.[0]?.panels?.mainContent?.registry_key
  if (!registryKey) return sceneName
  return getActivityByRegistryKey(registryKey)?.name ?? sceneName
}
