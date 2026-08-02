# Content fits its box

The rule, in one line: **a surface's size is chosen by the layout, and the
content's job is to fit it.** Scrolling is what you reach for when that has
genuinely failed, not the first thing you reach for.

This exists because the leetype nav-menu modals violated it in every way at
once — a picker at `max-h-[85vh] overflow-y-auto`, a drawer wrapping its body
in `ScrollArea max-h-[60vh]`, a skip menu nesting `max-h-[52vh]` inside
`max-h-[80vh]`. Each looked fine in the one window it was built in, and each
cut content off somewhere else.

## What to do instead, in order

1. **Tabs**, when the content is heterogeneous sections. Four short panes beat
   one long column, and each pane fits on its own.
   → `ChallengeBrief` (Why / Task / Concepts / Goal).
2. **A measured paged list**, when the content is a homogeneous list of
   unbounded length.
   → `useFittedPage` (some-ui-utils) + `PageControls` (@some-ui/shared).
3. **A rail or sidebar**, when the list already has groups worth navigating by.
   → the challenge picker's stage rail: one stage's rungs at a time.
4. **Enlarge the surface.** A wider or taller dialog is allowed and is often
   the right answer. What is not allowed is a surface whose height is a
   percentage of the viewport with the overflow given away.
5. **Then scroll** — and say so. Long-form prose and the code the player
   types through are real cases. Declaring it takes two things:

   ```tsx
   <pre
     data-scroll-intent="long-form"          // what the sweep reads
     className={
       // scroll-intent: long-form — a stack trace is as long as it is
       "overflow-auto max-h-32 …"            // what the lint rule reads
     }
   >
   ```

   The comment has to sit **inside the braces**, attached to the class string.
   A `{/* … */}` above the element is a sibling node and will not be seen — the
   lint rule reads leading comments of the string literal, not of the JSX.
   Alternatively, a whole file whose scroll is its purpose (a scroll-area
   primitive, a command palette) goes in `allowInFiles` in
   `packages/eslint/src/configs/fits-the-box.config.ts`.

### Why measured, not a fixed page size

A constant is wrong at every viewport but one. Five rows overflow a short
window and waste half a tall one, and "responsive" then degenerates into
picking a different wrong number per breakpoint. `useFittedPage` measures the
box and the content and converges on the count that actually fits.

## How this is enforced

Three layers, in increasing order of how much they actually prove.

### 1. `fits-the-box/no-greedy-overflow` (lint, warn)

Flags `overflow-auto` / `overflow-y-auto` / `max-h-[Nvh]` in component source
and names the alternatives. Fast, runs on every save — but it only sees a
class name, so it cannot tell whether the content ended up fitting. It is a
prompt, not a proof.

### 2. `apps/www/tests/ui-fit` (Playwright, the actual gate)

Renders **every story in the monorepo** at three viewport sizes and fails on
anything that scrolls sideways or scrolls vertically without declaring intent.

```bash
CI=1 pnpm build-storybook -o storybook-static          # or STORYBOOK_WORKSPACE=<pkg> to scope
STORYBOOK_STATIC=storybook-static pnpm --filter www test:e2e tests/ui-fit
```

This is the layer worth trusting, for one reason: it needs no per-component
work. Every component here already ships stories, so new UI is covered the day
it lands, and _not_ shipping a story is the only way to avoid the check — which
is a thing a reviewer can see.

Two properties of the harness are load-bearing and were both wrong on the first
attempt:

- **It serves over HTTP, not `file://`.** Chromium blocks cross-origin ES
  module loads from a file origin, so every story rendered an empty root and
  the sweep passed having measured nothing.
- **It asserts each story actually mounted.** A story that renders nothing
  cannot be checked, and a harness that reports that as a pass is worse than
  no harness. Known-broken stories go in `NON_RENDERING_STORIES` with the
  reason, so the debt stays greppable. That list is currently empty, and
  should be argued down rather than added to.

That second guard immediately earned itself: it caught four leetype story
groups (CodeDisplay, CodeInputCard, Leetype, LeetypeApp) rendering nothing at
all in a built Storybook, dying on `TypeError: f is not a function`. The cause
was `vite-plugin-top-level-await`, arriving via the root `vite.config.ts` that
Storybook auto-loads: it rewrites every module downstream of a top-level await
so its exports are assigned only after a `__tla` promise settles, then leaves
consumer chunks importing those bindings without awaiting it. Storybook builds
at `es2022`, which supports top-level await natively, so the plugin had nothing
to add and is now filtered out in `.storybook/main.ts`.

If you add a sweep like this elsewhere, plant a deliberately-overflowing
fixture and confirm it goes red before believing a green run.

### 2b. `apps/www/tests/ui-fit/launcher-fit.spec.ts` (Playwright, for `apps/www`)

The sweep above globs `packages/**` and `extensions/**`, so it never sees
`apps/www` — and the failure epic #852 was about needs no `overflow-auto` at
all to happen. A grid that renders N cards inside a page that happens to
scroll passes the lint, passes the sweep, and pushes everything below it off
the first screen anyway. The rule guards the symptom; nothing guarded the
property.

This spec guards the property, for the two surfaces that render the activity
catalogue:

```bash
pnpm --filter www test:ui-fit          # runs both this and the sweep
```

It asserts an invariant rather than a pixel budget: **the launcher's
footprint does not depend on the catalogue size.** `/app` is not a bounded
viewport route — `routes/_dashboard.tsx` gives it `overflow-auto` on purpose
— so "the document must not scroll" would fail for a reason the epic is not
about. "The section is the same height at N = 50 as at N = 4" is the thing
that is actually true of a correct launcher and false of a wrong one, at
every viewport, forever.

Two properties of it are load-bearing:

- **It pins the failure as well as the fix.** A `catalogue` fixture
  reproduces the pre-#852 grid and must still be seen to grow. An AFTER
  assertion that has never gone red proves nothing — the same reason the
  session-viewport spec keeps its BEFORE shell.
- **It imports `k` and the fixture from the package** rather than copying
  them, so a change to the breakpoint ladder moves the test with it. The CSS
  it renders is still a hand-written mirror of the shipped classes, and that
  can drift; the mirror is the price of not booting a router, a query client
  and seeded tenant storage to measure a grid. See
  [`docs/launcher/01-characterization.md`](../launcher/01-characterization.md).

The catalogue itself carries a third guard: `catalogue-size.test.ts` fails
when an activity is added, with a message saying to re-run the fit sweep and
bump the recorded count. Adding an applet is meant to be easy; noticing that
you did is meant to be automatic.

### 3. Review

The remaining judgement calls — is this tab split natural, is this dialog the
right size — are not mechanizable. The two layers above exist so review can
spend its attention there instead of on catching `overflow-y-auto`.

## What this is deliberately _not_

**Not a CLAUDE.md / agent-settings rule.** Guidance in a prompt is advisory:
it is followed when convenient, silently skipped under pressure, and invisible
in a diff. The failure being fixed here was not caused by a lack of knowing
better; it was caused by nothing checking. Prose belongs in this document,
where it explains the mechanism — it should not _be_ the mechanism.

**Not a screenshot/visual-regression suite.** Those answer "did this change?",
which needs a human to adjudicate every diff and goes stale the moment a
design lands. The question here is "does it fit?", which has an objective
answer the browser already knows, and no baseline to maintain.
