import { useEffect, useMemo } from "react"
import {
  selectResolvedFocus,
  useFocusStore,
} from "@wireframes/hooks/focus-system"
import type {
  ActiveLifetime,
  OrchestratorState,
  SceneConfig,
  UILayoutIntent,
  YouTubeRegion,
} from "some-types-utils"

/* -----------------------------------------------------------
 * Intent resolution
 * --------------------------------------------------------- */

export function resolveUILayoutIntent(
  activeLifetimes: Array<ActiveLifetime>
): UILayoutIntent | undefined {
  const sceneLifetime = activeLifetimes.find(
    (lifetime) => lifetime.kind.type === "Scene"
  )

  if (!sceneLifetime || sceneLifetime.kind.type !== "Scene") {
    return undefined
  }

  return sceneLifetime.kind.ui
}

export function resolveUILayoutIntentFromScene(
  scene: SceneConfig
): UILayoutIntent | undefined {
  return scene.ui[0]
}

/* -----------------------------------------------------------
 * Scene registry
 * --------------------------------------------------------- */

export type SceneRegistry = Record<string, SceneConfig>

/* -----------------------------------------------------------
 * Hook: resolve active UI intent
 * --------------------------------------------------------- */

export function useResolvedUIIntent(
  orchestratorState: OrchestratorState,
  sceneRegistry: SceneRegistry
): UILayoutIntent | undefined {
  return useMemo(() => {
    // Priority 1: active lifetime
    const liveIntent = resolveUILayoutIntent(orchestratorState.active_lifetimes)

    if (hasAnyPanelContent(liveIntent)) {
      return liveIntent
    }

    // Priority 2: scene registry fallback
    const sceneName = orchestratorState.current_active_scene
    if (!sceneName) return undefined

    const scene = sceneRegistry[sceneName]
    if (!scene) {
      console.warn(`Scene "${sceneName}" not found in registry`)
      return undefined
    }

    return resolveUILayoutIntentFromScene(scene)
  }, [
    orchestratorState.active_lifetimes,
    orchestratorState.current_active_scene,
    sceneRegistry,
  ])
}


/* -----------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */

function hasAnyPanelContent(intent: UILayoutIntent | undefined): boolean {
  if (!intent?.panels) return false

  return Object.values(intent.panels).some(
    (panel) => panel.children?.length || panel.focus !== undefined
  )
}

/* -----------------------------------------------------------
 * Focus pruning / resolution
 * --------------------------------------------------------- */

export function useFocusPruning(intervalMs = 100): void {
  const prune = useFocusStore((s) => s.prune)

  useEffect(() => {
    const id = setInterval(() => prune(Date.now()), intervalMs)
    return (): void => clearInterval(id)
  }, [prune, intervalMs])
}

export function useCurrentResolvedFocus() {
  return useFocusStore(useMemo(() => selectResolvedFocus(Date.now()), []))
}
