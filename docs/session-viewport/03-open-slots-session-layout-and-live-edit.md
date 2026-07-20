# An open slot vocabulary, a session-owned tree, and a live editor: findings from stories 3, 4, and 6

> Findings for epic #693, stories 3 (#697), 4 (#696), and 6 (#700). Landed
> together because 6 depends on both 3 and 4. Read
> `01-overflow-doctrine-and-audit.md` and `02-kill-the-cutoff.md` first -
> this trio gives `Layout(t)` an owner and a real editor; it doesn't change
> how a bounded `V` is measured or clipped.
>
> A prior attempt at story 3/4's scope (nested shell/scene ownership)
> shipped real code on an unmerged branch, was reverted, and is kept as
> historical context in that branch's version of this doc. This is the
> corrected model: topology lives on the session, not the scene, and
> chrome was decided elsewhere in the epic to live entirely outside the
> tree.

## Story 3: `SlotId` replaces the closed `YouTubeRegion` union

`YouTubeRegion` was defined twice (`packages/types/orchestrator-types` and
`packages/ui/wireframes/src/lib/youtube-config.ts`) and threaded through as
the concrete instantiation of `LayoutNode<T>`/`solveLayout<T>`/
`applyIntent<R>` everywhere a real tree was built or rendered - despite the
engine itself (`layout-weighted.ts`, `layout-intent.ts`) never assuming a
closed union. The closedness was entirely at the instantiation sites.

- `SlotId = string` is now the one open type threaded through the render
  path: `OrchestratedYouTubeViewport`, `LayoutNodeRenderer`,
  `TreeVisualizer`, `withFocus`/`useRequestFocus` (focus system), and every
  session-level tree (`SessionRecord.layout`).
- `YouTubeRegion` has exactly one definition now
  (`packages/types/orchestrator-types`), re-exported (not redefined) from
  `youtube-config.ts`. It remains the known, non-exhaustive vocabulary
  behind `regionColors`/`defaultConstraints`/`ALL_YOUTUBE_REGIONS` - real
  values, just no longer the only valid ones. `getSlotColor(id: SlotId)`
  is the new lookup, with a neutral fallback for ids outside that set.
- `LayoutEditor` (the composer's old exploration sandbox, now retired - see
  story 4 below) deliberately keeps exploring only the closed vocabulary;
  it isn't the live editor and was never meant to demonstrate open ids.

## Story 4: `Layout(t)` moves from nowhere to the session

There was no `SceneConfig.layout` or `ActiveLifetime.kind.Scene.layout` on
`main` to remove - the previous shipped version of that idea lived only on
an unmerged branch. Story 4 is additive:

- `SessionRecord` (`apps/www/src/lib/tenant/types.ts`) gains an optional
  `layout?: LayoutNode<SlotId>`. Absent means the naive default (a single
  `mainContent` leaf filling `V`, `NAIVE_LAYOUT` in
  `apps/www/src/components/player/layout.ts`), permanently, not a seed.
  There is no per-activity template lookup at scene-creation time, and
  never was on `main`.
- `useSessionLayout(session)`
  (`apps/www/src/components/player/use-session-layout.ts`) is the one
  place a session's tree is read - independent of which scene the
  orchestrator is currently ticking through. It replaces
  `useSceneDrivenLayout` (deleted, along with its
  `SCENE_LAYOUT_MAP`/`SceneName` dispatch table - dead code even before
  today, since no real `scene_name` the activity catalog produces matched
  those keys).
- The composer's `arrangement-step.tsx` never had a real "edit a scene's
  layout" panel on `main` (that was also unmerged-branch-only) - it had an
  inert "explore the layout engine" sandbox mounting a bare `LayoutEditor`,
  wired to nothing. That's replaced with a short pointer at the real
  thing: "press `E` while this session is playing to edit its layout
  live."

## Story 6: one keybinding, add/place/bind, in place on the real player

`E` toggles a `LiveEditOverlay`
(`packages/ui/wireframes/src/components/live-edit-overlay`) stacked on top
of the real `OrchestratedYouTubeViewport` - same tree, same measured rect,
translucent so the real content underneath stays visible. It reuses
`LayoutNodeRenderer` (now `overlay`-aware and extensible via
`renderLeafExtra`) for the existing place/move/resize/remove drag
interactions `applyIntent` already implemented, and adds two things that
didn't exist before: a named "add leaf" control (any string, per story 3)
and, per empty leaf, a "Bind" picker over the open component registry.

Two different persistence paths, because topology and binding are
different layers of state:

- **Topology** writes straight to `session.layout` - `useLiveLayoutEditor`
  keeps local tree state for instant feedback, debounces the actual
  `updateSession` write (350ms) so a resize drag doesn't fire a save per
  pixel, and flushes immediately on exiting edit mode. This is read
  directly by `useSessionLayout` on every render - always current.
- **Binding** writes to the _currently active scene's_ `ui.panels`
  (matched by `scene_name`, since `SceneConfig` has no other id), because
  bindings are scene data, not session data. The mock orchestrator engine
  (`buildActiveLifetimes`) only re-derives `activeLifetimes` from
  `engine.scenes` on its next `configure()` - a bind edit written only to
  `session.scenes` would be invisible until the session is replayed. To
  make "bind it and see it, without leaving the player" actually true
  _this_ session, `useLiveLayoutEditor` also layers the edit's bindings
  into what's rendered right now via a synthetic, non-persisted
  `ActiveLifetime` appended after the real ones - real content stacks
  correctly since binding is only offered on leaves that don't already
  have any (verified empty leaf → bind → real registry component renders
  immediately, same session, no replay).

## Where I'd push back on myself

- Binding a leaf that already has content isn't offered at all (the
  "Bind" control only appears on empty leaves). Rebinding an
  already-bound leaf would need either real "replace" semantics on the
  merge (currently panels from multiple lifetimes concatenate, they don't
  override) or a round-trip through `configure()` - deliberately out of
  scope here.
- The debounced topology save is a real gap if the tab closes mid-drag
  before the 350ms timer fires and before edit mode is explicitly toggled
  off. Acceptable for a mock/local-storage backend; would need a
  `beforeunload` flush for a real network-backed session store.
- Zero-collapse for unbound leaves (story 5, #736) doesn't exist yet, so
  "unbound leaves are visible in edit mode, collapse outside it" is
  trivially true - every leaf is always visible today. The override this
  story anticipates in `LiveEditOverlay` isn't needed until #736 lands.
