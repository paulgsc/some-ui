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
   → `useFittedPage` (some-ui-utils) + `PageControls` (some-ui-shared).
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
  reason, so the debt stays greppable.

If you add a sweep like this elsewhere, plant a deliberately-overflowing
fixture and confirm it goes red before believing a green run.

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
