# The "never overflow-scroll" doctrine, and an audit of every current offender

> Doctrine + audit for epic #693, story 1 (#694). Motivates #692. Read this
> before touching the layout engine or the player - it defines the invariant
> every later story in the epic is implementing or hardening, and lists
> every place in the repo that currently violates it, with file:line.

## The invariant

> For every leaf rect `R` in `solve(Layout(t), V)`, the content bound to `R`
> is rendered such that its painted box is `⊆ R`. If the content's natural
> box exceeds `R`, the leaf MUST resolve it by a **sanctioned** strategy
> (clip + focus, or temporal rotation - #693 §5), never by
> `overflow: auto|scroll` on the leaf or any ancestor up to `V`.

`V` (the session viewport's rect) is fixed. A leaf's content may have an
arbitrary natural size. The forbidden resolution is letting that content
grow the box past `R` and handing the user a scrollbar - whether on the
leaf itself or on some ancestor between the leaf and `V`.

### The escalation ladder (allowed resolutions, in priority order)

1. **Spatial (cheap):** resize / refocus - grow the focused leaf, shrink
   siblings, via the weighted solver + intents
   (`packages/ui/wireframes/src/lib/layout-weighted.ts#solveLayoutWithFocus`).
   Already built.
2. **Temporal (when spatial isn't enough):** the leaf becomes a
   time-multiplexed viewport - rotate through `[1, N)` content members
   (`packages/ui/dice-card`, `packages/ui/slideshow`). Primitive already
   built, not yet wired into the leaf renderer (story 6, #699).
3. **Structural (exogenous):** keybindings mutate `Layout(t)` - toggle a
   whole subtree in/out, or cycle a preset (stories 7-8, #700/#701).

## Two decisions this story is responsible for recording

### 1. The "focused leaf may scroll" nuance

"Never scroll" is too strong for genuinely linear content (a long
transcript, a chat log). The doctrine adopted here:

> **An unfocused leaf must never scroll. A focused/maximized leaf may
> scroll internally, because the user explicitly asked for that leaf to
> take priority over the rest of `V`.**

This is the honest reading of "never _unbounded_ scroll" - the invariant
protects the _unattended_ layout from silently growing past its rect; it
does not forbid a human-driven, single-leaf reading mode. Stories 6 and 7
should treat a focused leaf's internal scroll as a legitimate fourth rung
on the ladder, gated on focus, not as a doctrine violation.

### 2. The overlay-plane exemption

Toasts and any future command palette / modal are **not** part of
`Layout(t)`. They live on a separate, ephemeral **overlay plane** that
paints above `V` rather than tiling it. Evidence this is already the de
facto model, not a new invention: `apps/www/src/components/toaster.tsx`
mounts `ToastProvider`/`ToastViewport` as a sibling of `SidebarProvider`'s
children in `routes/_dashboard.tsx`, not as a registry-bound leaf.

Consequence named explicitly because stories 5 and 7 depend on it: "toggle
sidebar via keybinding" is a **tree operation** (a command that mutates
`Layout(t)`), while "open command palette" is an **overlay operation**
(a command that mounts something on the overlay plane). They are two
different mechanisms dispatched from the same command layer, not one.

## The audit: every current overflow surface, file:line

### Forbidden (page/ancestor-level scroll a leaf's content can trigger)

| File:line                                                             | What it does                                                                                                                                                                                                              | Status                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/www/src/routes/_dashboard.tsx:99-106` (was line 84 before #695) | Outlet wrapper: `overflow-auto` for every route, including the player route, with no bound on any ancestor above it (`SidebarProvider`/`SidebarInset` only set `min-h-svh`, never a definite `height`)                    | **Fixed by #695** for the player route only (`/sessions/$sessionId`) - see `02-kill-the-cutoff.md`. Still the correct, intentional behavior for the CRUD routes (profile/settings/sessions list), which are ordinary scrolling documents. |
| `apps/www/src/components/player/session-viewport.tsx:12`              | `min-h-[680px]` - a magic floor decoupled from the activity's actual needs, so an activity taller than 680px overflowed _inside_ the (also `overflow-hidden`) box before the ancestor chain even had a chance to bound it | **Fixed by #695** - replaced with `min-h-0`, letting the flex chain give it the real available height.                                                                                                                                    |
| `apps/www/src/components/player/live-player.tsx:81`                   | `flex h-full min-h-0 w-full flex-col gap-4` stacking `SessionViewport`/`NowNextStrip`/`TransportControls` with no bound reconciling them against `V`                                                                      | Structurally correct (`h-full` + `min-h-0`) but was inert before #695, because nothing above it in the ancestor chain had a _definite_ height for `h-full` to resolve against. Now load-bearing.                                          |

### Sanctioned (the reference clip pattern)

| File:line                                                          | What it does                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/wireframes/src/components/render-solved/index.tsx:47` | Each solved leaf is `position: absolute` with an explicit pixel `width`/`height` and `overflow-hidden` - clip-to-rect, no scroll. **This is the pattern every future leaf-content strategy should match.** |

### Out of scope of the invariant (not part of `Layout(t)`)

| File:line                                                   | What it does                                                                                                                                                          | Why it's exempt                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/www/src/components/composer/arrangement-step.tsx:182` | `overflow-x-auto` wrapping `<LayoutEditor />` at a fixed `min-w-[1280px]`, inside a `Collapsible` explicitly labeled "exploration only, does not change your session" | This is an _authoring canvas_ in the composer wizard, not a rendered leaf of a live `V`. It's a design-time tool that happens to be wider than its container - ordinary editor-canvas scroll, not the invariant's target. Story 3 (#696) may give it a real destination; until then it's correctly out of scope, not a violation. |
| `apps/www/src/components/toaster.tsx` (whole component)     | Mounts `ToastViewport` (a fixed-position overlay) as a `SidebarProvider` sibling                                                                                      | Overlay plane, per the decision above.                                                                                                                                                                                                                                                                                            |

### Known offenders inside activity content (registry components)

Not overflow-_surfaces_ in the layout-tree sense, but activity components
bound into the leaf that assume they own the _entire_ viewport rather than
a bounded rect handed to them - the concrete form "which activities assume
unbounded height" takes. Full list and what it means for story 6 is in
`02-kill-the-cutoff.md`; flagged here because it's the same grep sweep as
the rest of this audit:

- `packages/ui/interview/src/components/mock-interview/interview-app/index.tsx:34`
  and 7 sibling files under `mock-interview/` - `min-h-screen`.
- `packages/ui/honeycomb/src/components/hangul-hex-grid/{error,loading}-state/index.tsx`
  and `song-hex-grid/song-overlay/index.tsx:220` - `h-screen`.
- `packages/ui/umag/src/components/voice-ui/avatar/index.tsx:91` - `min-h-screen`.

## What every downstream story can assume

- The invariant text above is the thing to point a test at; #695's
  `apps/www/tests/session-viewport/no-overflow-scroll.spec.ts` is the first
  such test.
- A leaf may scroll **iff** it is the focused/maximized leaf; an unfocused
  leaf never may.
- Toasts, command palettes, and modals are overlay-plane, never tree nodes
  - stories 5/7 dispatch to two different mechanisms, not one.
- The composer's `LayoutEditor` canvas scroll is intentionally out of
  scope; it is not evidence of a doctrine violation.
