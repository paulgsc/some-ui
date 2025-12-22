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
} from "some-types-utils"

export function resolveUILayoutIntent(
  activeLifetimes: Array<ActiveLifetime>
): UILayoutIntent {
  // Find the active scene lifetime
  const sceneLifetime = activeLifetimes.find(
    (lifetime) => lifetime.kind.type === "Scene"
  )

  if (!sceneLifetime || sceneLifetime.kind.type !== "Scene") {
    return {}
  }

  // Return the UI intent from the active scene
  return sceneLifetime.kind.ui ?? {}
}

export function resolveUILayoutIntentFromScene(
  scene: SceneConfig
): UILayoutIntent {
  return scene.ui[0] ?? {}
}

// Scene registry type
export type SceneRegistry = Record<string, SceneConfig>

export function useResolvedUIIntent(
  orchestratorState: OrchestratorState,
  sceneRegistry: SceneRegistry
): UILayoutIntent {
  return useMemo(() => {
    // First priority: check active_lifetimes for Scene with ui intent
    if (orchestratorState.active_lifetimes.length > 0) {
      const intent = resolveUILayoutIntent(orchestratorState.active_lifetimes)

      if (intent.content || intent.focus !== undefined) {
        return intent
      }
    }

    // Fallback: lookup scene in registry and use its UI config
    const sceneName = orchestratorState.current_active_scene
    if (!sceneName) return {}

    const scene = sceneRegistry[sceneName]
    if (!scene) {
      console.warn(`Scene "${sceneName}" not found in registry`)
      return {}
    }

    return resolveUILayoutIntentFromScene(scene)
  }, [
    orchestratorState.active_lifetimes,
    orchestratorState.current_active_scene,
    orchestratorState.current_time,
    sceneRegistry,
  ])
}

export function useSyncServerFocus(intent: UILayoutIntent) {
  const emit = useFocusStore((s) => s.emit)

  useEffect(() => {
    if (!intent.focus) return

    emit({
      source: "server",
      region: intent.focus.region,
      intensity: intent.focus.intensity,
      priority: 10, // Server always wins
    })
  }, [intent.focus, emit])
}

// Hook: Prune expired focus proposals
export function useFocusPruning(intervalMs = 100) {
  const prune = useFocusStore((s) => s.prune)

  useEffect(() => {
    const id = setInterval(() => prune(Date.now()), intervalMs)
    return (): void => clearInterval(id)
  }, [prune, intervalMs])
}

// Hook: Get resolved focus with current time
export function useCurrentResolvedFocus() {
  return useFocusStore(useMemo(() => selectResolvedFocus(Date.now()), []))
}
