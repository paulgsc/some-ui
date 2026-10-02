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
import type { SessionRecord, UpdateSessionInput } from "@/lib/tenant"
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

export type LiveLayoutEditorOptions = {
  /**
   * Whether this surface may be edited at all - `false` on a phone.
   *
   * Required rather than defaulted, for the same reason `useIntent`'s
   * `presentation` is: a default here is a decision nobody made, and this
   * particular decision has already been got wrong once by omission. The
   * caller hides the editor's chrome on a narrow screen, but the hotkey
   * listener lives in *this* hook, so gating only the chrome left `editMode`
   * reachable from a keyboard on a narrow viewport (a split-screen desktop
   * window, a tablet). Nothing rendered, no exit affordance - and
   * `setSuspended(true)` still ran on every scene. One owner for the
   * decision, passed down, rather than two hooks independently asking the
   * media query and drifting.
   */
  editable: boolean
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
  activeLifetimes: Array<ActiveLifetime>,
  { editable }: LiveLayoutEditorOptions
): LiveLayoutEditor {
  const baseline = useSessionLayout(session)
  const [editMode, toggleHotkey] = useEditModeHotkey(
    editable && activeLifetimes.length > 0
  )
  const [tree, setTree] = useState<LayoutNode<SlotId>>(baseline)
  const [bindOverrides, setBindOverrides] = useState<Record<SlotId, string>>({})
  const updateIntent = useIntent(useUpdateSession(), {
    presentation: "ambient-durable",
  })
  const primaryScene = usePrimaryScene()

  /**
   * The one patch this hook is currently accumulating, or `null` when there
   * is nothing unsaved.
   *
   * A patch rather than a tree, because this hook has two writers -
   * topology (`onTreeChange`/`onLeafResize`) and bindings (`onBind`) - and
   * they must not race each other to the same session record. Merging them
   * into one pending patch means a resize and a bind made together leave as
   * one `PATCH` carrying both, instead of two that each overwrite half of
   * what the other just sent.
   */
  const pendingPatchRef = useRef<UpdateSessionInput | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Whether a dispatch is outstanding. Tracked here rather than read off
   * `updateIntent.state` because `flush` runs from a timer callback, not
   * from a render, so it cannot see the current render's state.
   *
   * This is what makes the hook a *single* writer, and it is the load-
   * bearing half of the fix. `useIntent`'s thundering-herd guard drops a
   * second `start()` made during an in-flight one - correct for the
   * double-click it was built for, and silent data loss here, where the
   * second call is a different edit (see `lib/intent/dropped-write.ts`,
   * which now refuses to let that happen quietly). Holding the patch until
   * the previous dispatch settles means this hook never puts the guard in
   * that position: at most one `start()` is ever outstanding, and every
   * edit made meanwhile is still in `pendingPatchRef`, waiting to ride the
   * next one.
   */
  const inFlightRef = useRef(false)
  /**
   * The `scenes` array of the dispatch currently out, held until the server
   * confirms it.
   *
   * `pendingPatchRef` alone closes the lost-update window only while edits
   * are still queued. Once a flush happens that ref is empty again, but the
   * `session` prop does not catch up until the request lands - so a bind
   * made in between would rebuild the array from a version that predates
   * the binds already sent, and undo them. This ref is that interval's
   * memory: cleared on success, when the prop has caught up, and
   * deliberately *kept* on failure, so the next flush re-sends work that
   * never made it rather than abandoning it.
   */
  const sentScenesRef = useRef<SessionRecord["scenes"] | null>(null)

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
  /**
   * A dispatch has settled: the scheduler may send again, and should
   * immediately if edits arrived while it was out. Declared here rather
   * than inline so both terminal arms below read the same way.
   */
  function releaseAndFlush(): void {
    inFlightRef.current = false
    // `flush` is a hoisted function declaration further down this scope.
    // Calling it by name rather than through a ref keeps this off the
    // render path entirely - `releaseAndFlush` only ever runs from the
    // effect below, never during a render.
    flush()
  }

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
        // The write landed, so the `session` prop is the authority again.
        sentScenesRef.current = null
        releaseAndFlush()
      },
      failed: (error) => {
        if (lastHandledStatusRef.current === "failed") return
        lastHandledStatusRef.current = "failed"
        writeDurableFailure(session.id, {
          kind: error.kind,
          summary: error.summary,
        })
        setRestoredFailure(null)
        // Flushed after a failure too, not only a success. An edit made
        // while a failing save was in flight is still an edit nobody has
        // saved, and the durable-failure notice above is about the attempt
        // that failed - it is not a reason to also throw away the newer
        // work waiting behind it.
        releaseAndFlush()
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

  /**
   * Send whatever has accumulated, unless a dispatch is already outstanding.
   *
   * The `inFlightRef` early return is not a drop: the patch stays in
   * `pendingPatchRef`, and the status effect flushes it the moment the
   * outstanding dispatch settles. Nothing an editor does is discarded by
   * this scheduler - it is only ever deferred.
   */
  function flush(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) return
    const patch = pendingPatchRef.current
    if (!patch) return
    pendingPatchRef.current = null
    if (patch.scenes) sentScenesRef.current = patch.scenes
    inFlightRef.current = true
    updateIntent.start({ id: session.id, patch })
  }

  /**
   * Merge one writer's edit into the pending patch and restart the debounce.
   *
   * Every edit path goes through here, which is what makes the coalescing
   * property hold for all of them at once: a drag firing a resize per pixel
   * and a person binding six panels in a row both leave as one request.
   */
  function queuePatch(part: UpdateSessionInput): void {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...part }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, PERSIST_DEBOUNCE_MS)
  }

  function onTreeChange(next: LayoutNode<SlotId> | null): void {
    const resolved = next ?? NAIVE_LAYOUT
    setTree(resolved)
    queuePatch({ layout: resolved })
  }

  function toggleEditMode(): void {
    // Leaving edit mode is a natural commit point, so don't make the person
    // wait out the debounce for it. `flush` no-ops when there is nothing
    // pending, so this needs no condition of its own beyond the direction.
    if (editMode) flush()
    toggleHotkey()
  }

  function onBind(leafId: SlotId, registryKey: string): void {
    setBindOverrides((prev) => ({ ...prev, [leafId]: registryKey }))

    const sceneName = primaryScene?.kind.Scene.scene_name
    if (!sceneName) return
    /**
     * Most recent first: still-queued edits, then edits dispatched but not
     * yet confirmed, then the `session` prop. That ordering is the
     * lost-update half of this fix. `session` does not refresh until a
     * dispatch lands, so a bind that read it directly would rebuild the
     * scenes array from a version predating the binds already made and
     * silently undo them - which is what happened both within a burst
     * (`pendingPatchRef` closes that) and across an in-flight request
     * (`sentScenesRef` closes that). Bind N sees binds 1..N-1 however fast
     * they arrive, and whichever of the three windows it arrives in.
     */
    const baseScenes =
      pendingPatchRef.current?.scenes ?? sentScenesRef.current ?? session.scenes
    const sceneIndex = baseScenes.findIndex((s) => s.scene_name === sceneName)
    if (sceneIndex === -1) return

    const scene = baseScenes[sceneIndex]
    const [firstLayer, ...restLayers] = scene.ui
    const nextScenes = [...baseScenes]
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
    queuePatch({ scenes: nextScenes })
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
