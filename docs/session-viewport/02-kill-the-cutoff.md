# Kill the cutoff: findings from making the player route measure a real V

> Findings for epic #693, story 2 (#695). Directly resolves the visible
> symptom in #692. Read `01-overflow-doctrine-and-audit.md` first for the
> invariant this story is the first real implementation of.

## What changed

The session viewport was rendering into an `overflow-hidden` box whose
height came from a magic `min-h-[680px]`, sitting inside a dashboard shell
that let the whole page scroll (`overflow-auto` on the route outlet, with
no ancestor above it ever having a _definite_ `height` - only `min-h-svh`
floors everywhere). An activity taller than 680px overflowed inside the
box; an activity that also blew past its ancestors' `min-height` floors
grew the entire page. Neither is `V` - `V` was never actually bounded.

Three files now form one deliberate, definite-height flex chain from the
sidebar shell down to the leaf, scoped to the player route only:

- `apps/www/src/routes/_dashboard.tsx` - the outlet wrapper (and
  `SidebarProvider` above it) get `h-svh overflow-hidden` /
  `min-h-0 overflow-hidden` **only** when the active route is
  `/_dashboard/sessions/$sessionId`. Every other route keeps its original
  `overflow-auto`, unmodified.
- `apps/www/src/components/player/live-player.tsx` - unchanged
  (`h-full min-h-0 flex-col`); it was always structurally correct, just
  starved of a definite ancestor height to resolve `h-full` against.
- `apps/www/src/components/player/session-viewport.tsx` - the magic
  `min-h-[680px]` floor is gone, replaced with `min-h-0` so the box takes
  exactly whatever `V` actually is.

`OrchestratedYouTubeViewport` already measured via `useContainerRect()`
and already clipped via `RenderSolved` (`packages/ui/wireframes`) - the
engine's own machinery needed no changes. The bug was entirely in the
app's ancestor chain never giving that machinery a real, bounded rect to
measure.

Regression coverage:
`apps/www/tests/session-viewport/no-overflow-scroll.spec.ts` mirrors this
exact CSS chain as a static fixture (see the file header for why it's a
mirror rather than a full app boot) and pins two things: an oversized
activity is clipped without growing the page (the fix), and the same
fixture _without_ the fix reproduces the page growing past `V` (proves the
test is meaningful).

## Decision: the route-scope split

Removing page-level scroll unconditionally would have broken the CRUD
routes (`/profile`, `/settings`, `/sessions`, `/`), which are legitimately
ordinary scrolling documents - a long settings form or a long session list
_should_ scroll the page. The fix is therefore route-scoped, not global:

> **The player route (`/sessions/$sessionId`) is a fixed-`V` surface.
> Every other route under `/_dashboard` remains an ordinary scrolling
> document.**

Implemented as `isViewportPath()` (a pathname regex matching
`/sessions/<id>` but excluding `/sessions/new`) checked against
`useRouterState`'s pathname selector, already read once per render for nav
highlighting, in `_dashboard.tsx` - rather than a second route layout or a
prop threaded through the tree. The shell has exactly one place that
decides "does this route own `V`," and it's legible at a glance. Story 5
(#698, chrome-as-layout-nodes) will likely want to move this decision into
the layout tree itself (a shell-tree leaf's presence, not a pathname
check); until that lands, this is the smallest correct version of the
split.

Loading/error states for the player route (`PlayerSkeleton`,
`SessionNotFound`, `DraftGuard` in
`apps/www/src/routes/_dashboard/sessions/$sessionId.tsx`) render inside
the same bounded, non-scrolling box, since they share the route id. They're
small, top-aligned cards, so this is a non-issue in practice - noted here
so it isn't a surprise later.

## Finding: which activity components assume unbounded height

Story 2's honest deliverable is "content is now bounded and clipped," not
"content now fits." Grepping every component reachable through
`@some-ui/content-registry`'s `componentRegistry`
(`packages/some-content-registry/src/registry/index.ts`) for
`min-h-screen` / `h-screen` / `100vh` turned up real offenders - components
that assume they own the _entire_ browser viewport, not the bounded rect
`V` (or a leaf of it) actually hands them:

- **`@some-ui/interview` → `InterviewApp`** (registry key `interview`).
  `mock-interview/interview-app/index.tsx:34` (`min-h-screen`) and seven
  sibling state screens (`welcome-screen`, `session-complete`,
  `recording-phase`, `question-playback`, `review-phase` ×3,
  `preparation-phase`) all use `min-h-screen` to center their content.
  Inside a clipped leaf shorter than the viewport, these will be
  vertically cropped rather than centered.
- **`@some-ui/honeycomb` → `HangulHexGrid`** (registry key `hangul`).
  `hangul-hex-grid/{error,loading}-state/index.tsx` and
  `song-hex-grid/song-overlay/index.tsx:220` use `h-screen` (not even
  `min-`) directly.
- **`@some-ui/umag` → `VoiceAvatar`** (registry key `voice`).
  `voice-ui/avatar/index.tsx:91` uses `min-h-screen`.

This is exactly the "truncation is now visible/measurable" outcome story 2
called out as the honest framing rather than overselling the fix: these
three registry components will visibly crop today, in a way they didn't
before (before, they just pushed the whole page taller, hiding the problem
behind a scrollbar instead of showing it). That's the correct trade per
the doctrine (clip, don't scroll) - the real fix is story 6 (#699, temporal
overflow), which is exactly the story this finding was logged to feed.
Not actioned here: story 2 is deliberately the wedge, not the resolution
for these three components.
