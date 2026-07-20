# Binding-aware geometry and always-on resize: findings from stories 5 and 7

> Findings for epic #693, stories 5 (#736) and 7 (#737). Both are net-new
> stories with no prior issue - read
> `03-open-slots-session-layout-and-live-edit.md` first for `SlotId`, the
> session-owned tree, and the live editor these two build directly on top
> of.

## Story 5: `solveLayoutWithBindings` - unbound leaves solve to zero

`solveLayout`/`solveLayoutWithFocus` (`packages/ui/wireframes/src/lib/
layout-weighted.ts`) only ever knew about topology and weights - a leaf
with nothing bound to it still got its full authored share of space, and
`OrchestratedYouTubeViewport`'s `renderLeaf` painted a placeholder box into
that space instead. `solveLayoutWithBindings(tree, boundLeafIds, viewport,
focusId?, focusIntensity?)` adds a third input (which leaves currently have
real content) and zeroes an unbound leaf's _derived_ weight before the
existing weight-normalization pass runs - the persisted `weight` on the
tree itself is never touched, so re-binding a leaf later restores its
prior proportional share, not a fresh default.

Two things had to be handled beyond "just zero the leaf":

- **Cascading collapse.** A split whose entire subtree is unbound also
  zero-collapses, transitively (`isZeroCollapsed`, memoized per node) -
  otherwise a fully-unbound branch would still claim its authored share at
  its own parent's level, leaving a claimed-but-empty gap that violates
  "bound leaves exactly tile `V`."
- **A latent bug in the pattern this is modeled on.** The existing
  `weightsToConstraints` (used by `solveLayoutWithFocus`) pushes every
  child - leaf or split - onto its traversal stack and then unconditionally
  overwrites leaf constraints in the `"leaf"` branch, discarding the
  proportional `ideal` its parent had just set. In practice this means
  `solveLayoutWithFocus` has likely never actually honored authored weights
  once `focusIntensity > 0` - existing tests never caught it because they
  only check tiling validity and leaf-set equality, not proportionality.
  `weightsToConstraintsWithBindings` only descends into `"split"` nodes, so
  leaves are set exactly once by their parent and never revisited. Left
  `weightsToConstraints` itself alone - that bug is real but predates this
  story and is out of scope for it.

`OrchestratedYouTubeViewport` gained a `collapseUnbound` prop (default
`true`) computing `boundLeafIds` from its own `mergedPanels`. The real
player (`SessionViewport`) passes `collapseUnbound={!editMode}` - off
during edit mode, since #700 needs unbound leaves visible to have
something to click on to bind (an explicit override through the same
function, not a separate code path, per the story's acceptance). The
standalone `/overlays/youtube` demo route and the `OrchestratedYouTubeViewport`
Storybook stories both opt out explicitly (`collapseUnbound={false}`) since
their whole point is visualizing every named region, not simulating a real
session's authoring flow.

Property-tested (`layout-weighted.property.test.ts`): for any tree
reachable via `applyIntent` and any subset of its leaves marked bound,
unbound leaves solve to exactly zero area, bound leaves solve to positive
area, and the tree still tiles the viewport - plus focused unit tests for
the cascading-collapse case and for re-binding restoring the prior
proportional split rather than an equal-thirds default.

## Story 7: right-click any leaf to resize, independent of edit mode

The `resize` intent (`layout-intent.ts`) was already fully implemented:
pixel delta to weight delta, correct sign per edge, sibling
renormalization, but only reachable through the composer's `LayoutEditor`
canvas. This story is purely exposure: right-click a leaf on the real
player, in or out of edit mode, and a small `LeafResizeHandles` overlay
(four edge handles, mouse-drag or arrow-key nudge) appears for that one
leaf, calling the same `resize` intent and persisting through the exact
debounced `session.layout` path story 6 already established
(`useLiveLayoutEditor.onLeafResize`).

`RenderSolved` gained a second, independent callback -
`onLeafContextMenu` - fired on every right-click alongside (not instead
of) the existing `onLeafClick` (focus popup). Keeping them independent
means resize works even with `enableFocus={false}` (the real player's
setting today) and doesn't have to reason about focus state at all.

One real bug surfaced while browser-testing this: the handle for an edge
was originally centered _on_ the boundary line between two leaves (a CSS
translate pushing it half outside its own leaf's rect). For a leaf sitting
at the outer edge of the viewport - trivially the case in the zero-collapse
test fixture, but true for any leftmost/rightmost/top/bottom leaf - that
overhang landed outside `SessionViewport`'s `overflow-hidden` container,
making the handle unhittable exactly there (confirmed via
`elementFromPoint` in a real browser: it resolved to the container
background, not the handle, and `mousedown` never reached React). Handles
now stay fully inside their own leaf's rect - still exactly on the visual
edge, just never translated past it.

## Where I'd push back on myself

- `solveLayoutWithFocus`'s pre-existing proportionality bug (above) means
  focus-intensity animations have probably never actually preserved
  authored weight ratios between siblings, only tiling validity. Worth its
  own fix, but doing it here would be an unrequested, unrelated behavior
  change to a function neither story touches otherwise.
- Keyboard nudge (arrow keys) on the resize handles is a real, tested
  interaction, not just an accessibility checkbox - `role="slider"` was
  the only ARIA role the linter accepted for a mouse-and-keyboard-driven
  handle, and it happens to be the semantically honest one.
- Right-click resize and edit mode's own overlay both reach the same
  `resize` intent, but they don't need to be simultaneously reachable in
  the same gesture: edit mode's overlay sits at a higher z-index and
  already provides resize via hover-edge drag, so a right-click landing on
  the overlay during edit mode is simply absorbed by it rather than also
  arming `LeafResizeHandles` underneath. No redundant interaction, no
  conflict.
