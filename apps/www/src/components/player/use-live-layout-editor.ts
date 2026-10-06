import { useEffect, useRef, useState } from "react"
import type { Intent } from "@some-ui/intent-kit"
import {
  failed,
  idle,
  matchIntent,
  succeeded,
  working,
} from "@some-ui/intent-kit"
import type { ActiveLifetime, SlotId } from "@some-ui/types"
import type { LayoutIntent, LayoutNode } from "wireframes"
import { applyIntent } from "wireframes"

import { useIntent } from "@/lib/intent"
import {
  clearDurableFailure,
  readDurableFailure,
  writeDurableFailure,
} from "@/lib/intent/durable-failure"
import { usePrimaryScene } from "@/lib/orchestrator"
import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"
import { useEditModeHotkey } from "@/hooks/use-edit-mode-hotkey"

import { NAIVE_LAYOUT } from "./layout"
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
  /** Right-click resize, available whether or not edit mode is mounted. */
  onLeafResize: (
    leafId: SlotId,
    edge: "left" | "right" | "top" | "bottom",
    deltaPx: number,
    containerSizePx: number
  ) => void
  /** `ambient-durable` (`presentation.ts`): quiet while pending or
   * succeeding; a failure renders and survives unmounting
   * (`durable-failure.ts`). */
  autosaveStatus: Intent<SessionRecord>
}

/**
 * Drives live edit mode: local-first topology edits (debounced to the
 * session record, so a resize drag doesn't save per pixel) plus bindings,
 * which persist to the active scene's panels and are layered onto what
 * renders now (the orchestrator only re-reads `session.scenes` on its next
 * `configure()`).
 */
export function useLiveLayoutEditor(
  session: SessionRecord,
  activeLifetimes: Array<ActiveLifetime>
): LiveLayoutEditor {
  const baseline = useSessionLayout(session)
  const [editMode, toggleHotkey] = useEditModeHotkey(activeLifetimes.length > 0)
  const [tree, setTree] = useState<LayoutNode<SlotId>>(baseline)
  const [bindOverrides, setBindOverrides] = useState<Record<SlotId, string>>({})
  const updateIntent = useIntent(useUpdateSession(), {
    presentation: "ambient-durable",
  })
  const primaryScene = usePrimaryScene()

  const pendingTreeRef = useRef<LayoutNode<SlotId> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seeded once from what a previous mount (or tab) left behind
  // (`durable-failure.ts`); the effect below keeps it in step.
  const [restoredFailure, setRestoredFailure] = useState(() =>
    // eslint-disable-next-line owner-guard/no-mount-snapshot -- seeded once by design (comment above); the effect below keeps it in step
    readDurableFailure(session.id)
  )
  const lastHandledStatusRef = useRef<
    "idle" | "working" | "succeeded" | "failed"
  >("idle")

  // No dependency array: `updateIntent.state` is a fresh object every render.
  // `lastHandledStatusRef` makes each arm act once per transition.
  useEffect(() => {
    matchIntent(updateIntent.state, {
      idle: () => undefined,
      working: () => {
        if (lastHandledStatusRef.current === "working") return
        lastHandledStatusRef.current = "working"
        setRestoredFailure(null)
      },
      succeeded: () => {
        if (lastHandledStatusRef.current === "succeeded") return
        lastHandledStatusRef.current = "succeeded"
        clearDurableFailure(session.id)
        setRestoredFailure(null)
      },
      failed: (error) => {
        if (lastHandledStatusRef.current === "failed") return
        lastHandledStatusRef.current = "failed"
        writeDurableFailure(session.id, {
          kind: error.kind,
          summary: error.summary,
        })
        setRestoredFailure(null)
      },
    })
  })

  // This mount's live attempt once there is one, else a failure restored from
  // before. The restored case offers no retry: the failed tree isn't held
  // anywhere, so editing again is the retry.
  const autosaveStatus: Intent<SessionRecord> = matchIntent<
    SessionRecord,
    Intent<SessionRecord>
  >(updateIntent.state, {
    idle: () =>
      restoredFailure
        ? failed(
            {
              kind: restoredFailure.kind,
              retryable: false,
              summary:
                "Your last layout edit here didn't save. Edit the layout again to retry.",
              cause: "restored-durable-autosave-failure",
            },
            () => undefined
          )
        : idle(),
    working: () => working(),
    succeeded: (value) => succeeded(value),
    failed: (error, retry) => failed(error, retry),
  })

  function schedulePersist(next: LayoutNode<SlotId>): void {
    pendingTreeRef.current = next
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const toSave = pendingTreeRef.current
      pendingTreeRef.current = null
      if (toSave) {
        updateIntent.start({ id: session.id, patch: { layout: toSave } })
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
      updateIntent.start({ id: session.id, patch: { layout: toSave } })
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
    updateIntent.start({ id: session.id, patch: { scenes: nextScenes } })
  }

  function onLeafResize(
    leafId: SlotId,
    edge: "left" | "right" | "top" | "bottom",
    deltaPx: number,
    containerSizePx: number
  ): void {
    const intent: LayoutIntent<SlotId> = {
      kind: "resize",
      region: leafId,
      edge,
      deltaPx,
      containerSizePx,
    }
    onTreeChange(applyIntent(tree, intent))
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
    onLeafResize,
    autosaveStatus,
  }
}
