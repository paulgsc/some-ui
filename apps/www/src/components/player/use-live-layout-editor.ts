import { useRef, useState } from "react"
import type { ActiveLifetime, SlotId } from "some-types-utils"
import { usePrimaryScene } from "some-ui-utils"
import type { LayoutNode } from "wireframes"

import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"

import { NAIVE_LAYOUT } from "./layout"
import { useEditModeHotkey } from "./use-edit-mode-hotkey"
import { useSessionLayout } from "./use-session-layout"
import { boundLeafIdsOf } from "./utils"

const PERSIST_DEBOUNCE_MS = 350
const LIVE_EDIT_OVERRIDES_SCENE_ID = "__live-edit-overrides__"

type LiveLayoutEditor = {
  editMode: boolean
  toggleEditMode: () => void
  tree: LayoutNode<SlotId>
  onTreeChange: (tree: LayoutNode<SlotId> | null) => void
  /** `activeLifetimes` plus this session's not-yet-replayed bind edits, layered on top. */
  effectiveLifetimes: Array<ActiveLifetime>
  boundLeafIds: Set<SlotId>
  onBind: (leafId: SlotId, registryKey: string) => void
}

/**
 * Drives story 6's live edit mode: local-first topology edits (debounced to
 * the session record so a resize drag doesn't fire a save per pixel) plus
 * bindings, which persist to the currently active scene's panels and are
 * also layered onto what's rendered right now - the orchestrator only
 * re-reads `session.scenes` on its next `configure()`, so without this a
 * bind edit would be invisible until the session is replayed.
 */
export function useLiveLayoutEditor(
  session: SessionRecord,
  activeLifetimes: Array<ActiveLifetime>
): LiveLayoutEditor {
  const baseline = useSessionLayout(session)
  const [editMode, toggleHotkey] = useEditModeHotkey(activeLifetimes.length > 0)
  const [tree, setTree] = useState<LayoutNode<SlotId>>(baseline)
  const [bindOverrides, setBindOverrides] = useState<Record<SlotId, string>>({})
  const updateSession = useUpdateSession()
  const primaryScene = usePrimaryScene()

  const pendingTreeRef = useRef<LayoutNode<SlotId> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: LayoutNode<SlotId>): void {
    pendingTreeRef.current = next
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const toSave = pendingTreeRef.current
      pendingTreeRef.current = null
      if (toSave) {
        updateSession.mutate({ id: session.id, patch: { layout: toSave } })
      }
    }, PERSIST_DEBOUNCE_MS)
  }

  function onTreeChange(next: LayoutNode<SlotId> | null): void {
    const resolved = next ?? NAIVE_LAYOUT
    setTree(resolved)
    schedulePersist(resolved)
  }

  function toggleEditMode(): void {
    if (editMode && timerRef.current && pendingTreeRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      const toSave = pendingTreeRef.current
      pendingTreeRef.current = null
      updateSession.mutate({ id: session.id, patch: { layout: toSave } })
    }
    toggleHotkey()
  }

  function onBind(leafId: SlotId, registryKey: string): void {
    setBindOverrides((prev) => ({ ...prev, [leafId]: registryKey }))

    const sceneName = primaryScene?.kind.Scene.scene_name
    if (!sceneName) return
    const sceneIndex = session.scenes.findIndex(
      (s) => s.scene_name === sceneName
    )
    if (sceneIndex === -1) return

    const scene = session.scenes[sceneIndex]
    const [firstLayer, ...restLayers] = scene.ui
    const nextScenes = [...session.scenes]
    nextScenes[sceneIndex] = {
      ...scene,
      ui: [
        {
          ...firstLayer,
          panels: {
            ...firstLayer.panels,
            [leafId]: { registry_key: registryKey, props: {} },
          },
        },
        ...restLayers,
      ],
    }
    updateSession.mutate({ id: session.id, patch: { scenes: nextScenes } })
  }

  const overrideLifetime: ActiveLifetime | null =
    Object.keys(bindOverrides).length > 0
      ? {
          id: -1,
          started_at: 0,
          kind: {
            Scene: {
              scene_id: LIVE_EDIT_OVERRIDES_SCENE_ID,
              scene_name: LIVE_EDIT_OVERRIDES_SCENE_ID,
              duration: 0,
              ui: [
                {
                  panels: Object.fromEntries(
                    Object.entries(bindOverrides).map(
                      ([leafId, registryKey]) => [
                        leafId,
                        { registry_key: registryKey, props: {} },
                      ]
                    )
                  ),
                },
              ],
            },
          },
        }
      : null

  const effectiveLifetimes = overrideLifetime
    ? [...activeLifetimes, overrideLifetime]
    : activeLifetimes

  return {
    editMode,
    toggleEditMode,
    tree,
    onTreeChange,
    effectiveLifetimes,
    boundLeafIds: boundLeafIdsOf(effectiveLifetimes),
    onBind,
  }
}
