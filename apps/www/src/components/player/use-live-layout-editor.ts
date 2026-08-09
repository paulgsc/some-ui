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
import { useEditModeHotkey, usePrimaryScene } from "some-ui-utils"
import type { LayoutIntent, LayoutNode } from "wireframes"
import { applyIntent } from "wireframes"

import { useIntent } from "@/lib/intent"
import {
  clearDurableFailure,
  readDurableFailure,
  writeDurableFailure,
} from "@/lib/intent/durable-failure"
import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"

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
  /** Story 7: right-click resize, available whether or not edit mode is mounted. */
  onLeafResize: (
    leafId: SlotId,
    edge: "left" | "right" | "top" | "bottom",
    deltaPx: number,
    containerSizePx: number
  ) => void
  /** `ambient-durable` per `presentation.ts`'s autosave verdict: quiet while
   * pending or succeeding, but a failure renders (via `AmbientIntentStatus`)
   * and survives this component unmounting - see `durable-failure.ts`. */
  autosaveStatus: Intent<SessionRecord>
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
  const updateIntent = useIntent(useUpdateSession(), {
    presentation: "ambient-durable",
  })
  const primaryScene = usePrimaryScene()

  const pendingTreeRef = useRef<LayoutNode<SlotId> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seeded once, from whatever the *previous* mount of this session's
  // editor (or a previous tab) left behind - see `durable-failure.ts`. The
  // effect below is what keeps it in sync with this mount's own attempts.
  const [restoredFailure, setRestoredFailure] = useState(() =>
    readDurableFailure(session.id)
  )
  const lastHandledStatusRef = useRef<
    "idle" | "working" | "succeeded" | "failed"
  >("idle")

  // No dependency array, deliberately - `updateIntent.state` is a fresh
  // object every render (see `use-intent.ts`'s header), so it can't gate
  // this effect. `lastHandledStatusRef` is what makes each arm act once
  // per genuine transition rather than once per render, the same idiom
  // `useIntentEffect` uses for the success-only case.
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

  // What actually renders: this mount's own live attempt once one has
  // happened, otherwise a failure restored from before this mount existed.
  // The restored case never offers retry - the tree that failed to save
  // isn't held anywhere by the time a person is back looking at this
  // screen (see `durable-failure.ts`'s header on why that isn't stored
  // either), so editing the layout again is the honest retry path.
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
