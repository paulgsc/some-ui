# Content fits its box

The rule, in one line: **a surface's size is chosen by the layout, and the
content's job is to fit it.** Scrolling is what you reach for when that has
genuinely failed, not the first thing you reach for.

Stated the other way round, which is the version that says where to fix things:

> **Containment is the default contract. Expansion beyond the containing block
> requires an explicit escape — and the escape is declared at the boundary
> where size authority was granted, not at every descendant that exercises
> it.**

That distinction is what stops this being whack-a-mole. There are only two
kinds of overflow. **Structurally preventable** overflow is the large kind: it
happens because some descendant asserted a lower bound its ancestors could not
honour, and it is prevented once — at the boundary — for every component
downstream. **Semantically intentional** overflow (a popover, a code pane, a
marquee, an unbroken URL) is the small kind: it genuinely differs per surface,
so it is declared per surface. Everything below is an attempt to keep the first
kind out of the second kind's budget.

The boundaries that grant size authority in this repo are few and nameable:
the dashboard shell (`routes/_dashboard.tsx`), the session viewport
(`SessionViewport` → `OrchestratedYouTubeViewport` → `RenderSolved`'s leaf
rects), and `componentRegistry` — where a key is bound to a leaf and a whole
workspace's component is handed a rect it never sees. Those are the places to
enforce; a rule spread across every descendant instead is the thing this
document exists to avoid.

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

### 1b. `fits-the-box/no-unshrinkable-flex-child` (lint, warn)

The structural half, added by #899. A flex item's automatic minimum size is its
**content**, not zero — so `flex-1` in a bounded column does not mean "take
what is left", it means "take what is left, but never less than what I hold".
A child with tall content therefore raises the floor of every ancestor up to
the one that clips, and a panel handed a small rect paints past it. This rule
reads the _relationship_ (a flex parent, a flexible child, no `min-h-0` /
`min-w-0` and no declared overflow) rather than a single class, which is why it
can name the defect instead of the symptom.

It is the one mechanizable piece of the containment contract: intrinsic minimum
sizes are exactly how a descendant defeats composition, and they are visible in
the class list.

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

### 2c. `apps/www/tests/ui-fit/panel-fit.spec.ts` (Playwright, the #899 gate)

The sweep in 2 renders every story in a canvas of **unbounded height**, and
that is a hole exactly the shape of #899. A component whose box comes from its
host has no host in a story: `h-full` resolves against `auto`, the content sets
its own height, and "content fits its box" passes vacuously because there is no
box. The TOPIK quiz summary sat at ~950px of content behind that pass for
months, and painted the difference over the pane below it in a real session.

So this spec grants the box before measuring. `#storybook-root` is pinned to
the viewport and `overflow: hidden`, the decorator chain is made definite down
to the panel — the same shape `RenderSolved` gives a leaf — and two things are
then asserted at the same three viewports:

- **escape** — nothing paints outside the granted rect. A panel asking for more
  than it was given: `min-h-screen` on a panel root, a chip row that will not
  wrap.
- **leak** — no box holds more content than its own height without clipping it.
  A box that sizes to its content cannot leak (`scrollHeight` equals
  `clientHeight`), so this only fires where something really did assert a size.
  This is #899's exact shape, and running the spec against the pre-fix commit
  reports it in those words: _"holds 395px more content than its own height and
  does not clip it"_.

What is swept is `Record<RegistryKey, …>`: **every registry key must say how it
gets fitted**, so binding a new panel without a swept story is a type error
rather than an omission nobody notices. Entries carrying `debt` are measured
but not failed — and a second test asserts each one _still_ overflows, so the
list cannot rot: fix a panel and the way to get green again is to delete its
entry, which puts it back under the gate.

`PANEL_STAGES` covers the states a top-level story never reaches. The summary
only appears after ten answers; sweeping only the applet's initial state is how
#899 shipped past a green sweep in the first place.

### 3. CI

Layers 2, 2b and 2c ran nowhere until #899. `pnpm test:ui-fit` existed, this
document called layer 2 "the actual gate", and no workflow invoked it — which
is its own lesson about where guardrails actually live. `pr.yml` now builds
Storybook and runs `panel-fit`, `launcher-fit` and `exercise-shell-fit`
whenever a PR touches `packages/ui/**`, `packages/some-content-registry/**`,
`packages/some-styles/**`, `apps/www/src/**` or `.storybook/**`.

**Layer 2 is deliberately not in that list yet.** Run against a
packages-scoped build today it reports **128 stories** — Sandlot, the
scheduler's node popups, the chat surfaces, topik's change-material dialog,
and a long tail of extension stories that render nothing at all. All of it
predates #899. Making it required would fail every UI PR for work it did not
do, and quietly pressure the next author to delete the check rather than the
debt. The honest position is the one recorded here: the sweep is real, it is
red, it runs locally, and the number above is the size of the backlog. Bring
it down and wire it in — one package at a time is a perfectly good shape for
that, since `STORYBOOK_WORKSPACE=<pkg>` scopes the build.

### 4. Review

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
