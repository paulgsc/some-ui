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
   → `useFittedPage` (@some-ui/react-hooks) + `PageControls` (@some-ui/shared).
3. **A rail or sidebar**, when the list already has groups worth navigating by.
   → the challenge picker's stage rail: one stage's rungs at a time.
4. **Enlarge the surface.** A wider or taller dialog is allowed and is often
   the right answer. What is not allowed is a surface whose height is a
   percentage of the viewport with the overflow given away.
5. **Then scroll** — and say so. Long-form prose and the code the player
   types through are real cases. Declaring it takes two things:

   ```tsx
   <pre
     data-scroll-intent="long-form"          // what the Playwright specs read
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

Four layers, in increasing order of how much they actually prove.

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

**Its blind spot, named after it cost us a shipped bug.** Reading a
_relationship_ is what lets the rule name the defect — and it is also why the
rule cannot see a relationship that spans two components. `SidebarInset`
(`@some-ui/shared`) is a bare `<main class="flex-1">`; the flex row that makes
it a flex _item_ lives in `SidebarProvider`, in the same file but a different
component, and the JSX nesting the rule matches on never appears. So the
warning never fired, and every route of every consumer inherited a `<main>`
that could not shrink below its content: one un-shrinkable descendant anywhere
grew it past the viewport and the _page_ scrolled sideways. It surfaced as
499px of `scrollWidth` against a 390px viewport on `apps/www`'s `/sessions`.

The rule is still worth having; the lesson is where to compensate for it. A
**layout primitive** that hands its children to a flex context defined
elsewhere is exactly the shape the linter cannot check, so those want
`min-w-0` / `min-h-0` by construction and a test that says so — the Playwright
specs below are no backstop for it: they measure the panels the panel page
mounts and two hand-mirrored fixtures, and a shell primitive rendered by a
route is none of those.

### 2. `apps/www/tests/ui-fit` (Playwright, the actual gate)

Five specs, all run in CI (section 3): `panel-fit` (2c) mounts real panels
on a page built with www's own config and CSS, `incident-fit` (2e) plays the
phone's LeetType incident session on that page through every kind of screen,
`studio-fit` (2f) walks the phone's Studio screens on a second page built
under the Android app's profile, and `launcher-fit` (2b) and
`exercise-shell-fit` measure static fixtures that mirror the shipped classes.

```bash
pnpm --filter www build:fit
pnpm --filter www build:fit-phone
pnpm --filter www test:ui-fit
```

There was a fourth, a sweep of every Storybook story in the monorepo in an
unbounded canvas. No workflow ever ran it, and it went with the stories it
swept (#1687): a gate that claims coverage nothing enforces is worse than
none.

Two properties of the panel harness are load-bearing, and both were wrong on
the first attempt:

- **It serves over HTTP, not `file://`.** Chromium blocks cross-origin ES
  module loads from a file origin, so every panel rendered an empty root and
  the sweep passed having measured nothing.
- **It asserts each panel actually mounted.** A panel that renders nothing
  cannot be checked, and a harness that reports that as a pass is worse than
  no harness.

If you add a sweep like this elsewhere, plant a deliberately-overflowing
fixture and confirm it goes red before believing a green run.

A third, added later and for the same reason — because its absence had been
load-bearing:

- **One of the four viewports is a phone in landscape** (780×390). For a long
  time the matrix was three sizes, all of them portrait phone or
  landscape-_desktop_, which means a workspace could be genuinely unusable on
  a phone held sideways and still pass every layer of this cleanly. That is
  not the suite being lenient; it is the suite never having rendered the case.
  Adding the orientation immediately turned up two real failures in
  `panel-fit` (`QuizSummary`, advanced and failed, painting 6px past the rect
  it was granted) that the other three sizes could not see.

  Landscape earns a slot rather than being a fourth variation on the same
  shape, because it breaks the most assumptions at once. Every Tailwind width
  breakpoint below `md` reads as true, so a layout believes it has a tablet's
  room while the axis it is short of is height. Fixed chrome that is a fine
  fraction of 780px is most of 390px. And a document that outgrows the window
  here does so under chrome pinned to the viewport, which is how a scrolling
  route tears the shell's own background — the `h-svh` note in `sidebar.tsx`
  is that failure, reported as "weird gaps in border and bg".

  The idiom that answers it lives in `@some-ui/shared`
  (`lib/short-window.ts`): **on a short window a surface keeps its controls
  and sheds its commentary.** It is class strings rather than a hook, so the
  question is answered by CSS at paint time and nothing re-renders when a
  phone is turned over.

### 2b. `apps/www/tests/ui-fit/launcher-fit.spec.ts` (Playwright, for `apps/www`)

`panel-fit` only measures the panels its page mounts, so it never sees
`apps/www`'s own routes —
and the failure epic #852 was about needs no `overflow-auto` at all to
happen. A grid that renders N cards inside a page that happens to scroll
passes the lint and pushes everything below it off
the first screen anyway. The rule guards the symptom; nothing guarded the
property.

This spec guards the property, for the two surfaces that render the activity
catalogue:

```bash
pnpm --filter www test:ui-fit          # runs all four ui-fit specs
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

A component rendered on its own sits in a canvas of **unbounded height**, and
that is a hole exactly the shape of #899. A component whose box comes from its
host has no host there: `h-full` resolves against `auto`, the content sets its
own height, and "content fits its box" passes vacuously because there is no
box. The TOPIK quiz summary sat at ~950px of content behind that pass in
Storybook for months, and painted the difference over the pane below it in a
real session.

So this spec grants the box before measuring. The panel page
(`tests/ui-fit/panel-page`) mounts one fixture per load inside the shape
`RenderSolved` gives a leaf: an absolute rect that clips, and a full-size box
inside it that the panel fills. Two things are then asserted at each of the
four viewports, measured from that inner box:

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
gets fitted**, so binding a new panel without a fixture is a type error rather
than an omission nobody notices. Fixture ids are typed the same way, so a
renamed fixture fails `tsc` rather than quietly dropping out of the sweep. Entries carrying `debt` are measured
but not failed — and a second test asserts each one _still_ overflows, so the
list cannot rot: fix a panel and the way to get green again is to delete its
entry, which puts it back under the gate.

`PANEL_STAGES` covers the states the applet alone never reaches. The summary
only appears after ten answers; sweeping only the applet's initial state is how
#899 shipped past a green sweep in the first place.

**Why a page in `apps/www` rather than Storybook.** The panel page is built
with www's Vite config, providers and stylesheets (`pnpm --filter www
build:fit`, into `apps/www/out/ui-fit`), so its CSS is byte-identical to what
www ships. Storybook compiled its own copy, and in #1685 that copy lost
Tailwind while www was fine: a gate measuring a second pipeline can fail, or
pass, for reasons the app does not have.

### 2d. `apps/www/tests/composer` (Playwright, and the only one that runs the app)

Every layer above measures something that is not the running application.
`launcher-fit` hand-mirrors the shipped
classes in static HTML rather than mounting the component, `panel-fit` mounts
panels one at a time inside a leaf-shaped rect, and `tests/csp` fulfils routes without a
server. Each of those trades is defensible on its own. Together they left a
gap with a precise shape: **no test in this repository had ever clicked a
control.**

That gap is what let the composer ship a pager whose "Next" flashed the last
page and landed back on the first. Every layer was green, the lint rule saw
nothing to flag, and the hook's own unit tests drove a fake `ResizeObserver`
that could not produce the geometry the bug needed.

So this suite boots `vite` and drives `/sessions/new` in a real browser, at
the phone/landscape/laptop trio, asserting behaviour rather than pixels: Next
advances a page _and stays there_, no multi-item page overflows the box it was
given, the step rail refuses exactly where Continue refuses, and no step
scrolls the page or paints outside a box that never said it would clip. Run
against the code it was written for, it fails seven ways.

```bash
pnpm --filter www exec playwright test tests/composer
```

It reuses an already-running dev server if it finds one, so a local `pnpm dev`
loop stays fast. When it boots its own it runs the static build
(`VITE_STATIC_DATA=true`): there is no `file_host` to sign in to, so "signing
in" is the in-memory demo.

**On a phone the composer is not the wizard.** Below `md` it is the lesson
CRM's shape: one concern per pane (Browse, Added, Configure, Arrange, Review),
switched by the shared `BottomTabBar` (`@some-ui/shared`), with Save living in
the last pane because there is no Back / Continue footer. Both layouts walk one
position (`components/composer/panes.ts`), so crossing the breakpoint keeps
your place. `tests/composer/mobile.spec.ts` holds that shape, and two things
more that nothing else could see:

- **`useFittedPage` must not take its own probing for evidence.** It forgets
  the counts it has rejected when "the box changed", and two things it does
  itself looked like that: a rejected count overflowing brings a scrollbar
  that takes width from the box, and a count that changes the page count
  brings or removes the pager beside the box, which changes its height. Each
  voided the rejection, the count was tried again, and the scrollbar (or the
  page length) flickered every frame for as long as the page was open. The box
  is now identified by its border-box width, which a scrollbar cannot change,
  and judged count by count: only _the same count_ producing a different box is
  the window resizing. The spec fails against the old hook with
  `Configure: the fitted box kept changing between frames`.
- **A phone paints no scrollbar.** Scrolling there is by finger, and a bar is
  only noise, so the fitted boxes carry `handheld:no-scrollbar` (below `md`
  wide or 480px tall: a landscape phone is a phone too). The spec
  launches Chromium _without_ `--hide-scrollbars` (Playwright's headless
  default), because a run that can paint no scrollbar cannot fail on one.

### 2e. `apps/www/tests/ui-fit/incident-fit.spec.ts` (Playwright, the phone's incident session)

`panel-fit` measures each fixture as it loads. A LeetType session file's
screens are reached only by playing one, so this spec plays the
`leetype-incident` fixture, a session file written to fill every kind of
screen (`panel-page/incident-session.ts`), tapping as a learner would and
measuring at each stop with the same `findViolations` (`harness.ts`). It runs
at the phone sizes alone (`PHONE_VIEWPORTS`): the session is a phone surface.

### 2f. `apps/www/tests/ui-fit/studio-fit.spec.ts` (Playwright, the phone's Studio)

The panel page is built under the `lan` profile, which stubs every `apk`
workspace (`build.profiles.ts`), and Studio (`@some-ui/soundbites`) is one:
a fixture for it there would mount a stub. So the phone's screens have a
page of their own, `panel-page`'s shape built under the Android app's
profile (`pnpm --filter www build:fit-phone`, `tests/ui-fit/phone-page`),
which `gates` admits as a ui-fit page rather than a route or a door. Its
fixtures mount Studio on fakes from `@some-ui/soundbites/fixtures` (a
project store in memory, a microphone that always hears), each opened on a
video in one standing (`phone-page/fixtures.tsx`), inside the room the
shell gives a document route on the phone: the header above, the bar below,
a body that scrolls as a page between them. The spec taps from each Start
to the screens that standing reaches (Record before, during and after a
take; Done for now's three steps; Shape's two; Finish with a scene missing
and ready; Watch before a render and with one whose change is asked;
History; Time spent; New idea asked and typed), measuring at each stop with
`findViolations`, at `PHONE_VIEWPORTS`. The body's scroll down is the
route's own, so what the sweep sees is a screen that leaves the phone
sideways, or a box that asserts a height its content cannot fit. The first
needs a check of its own: a row wider than the phone that sizes to its
content leaks nothing, and the body that scrolls across to show it is the
clipping ancestor the escape check excuses, so a 900px screen measured
clean at 360px until `findViolations` read the body for its intent. A
`data-scroll-intent="page"` box that scrolls sideways is reported as `wide`
(a page scrolls down, never across), and the page plants one of each
(`planted-overflow`, `planted-wide`) to prove the sweep sees them.

### 2g. `apps/www/tests/ui-fit/settings-bar-fit.spec.ts` (Playwright, Settings' bar of pages)

On the phone, Settings is reached by a bar of its pages (MY-DATA MD1): five
tabs where a wing's bar holds two or three, along the bottom upright and as
a rail on the phone's side. The rail is `fixed`, which `findViolations`
leaves to the overlay plane, so this spec measures the bar itself on the
phone page's `settings-bar` fixture: inside the screen, every tab inside it
and clear of the others, no label cut, and More's list on screen once
tapped. It sweeps `PHONE_VIEWPORTS` and a narrow phone on its side
(780x360), the shortest height five tabs on the rail have to fit.

### 2h. `apps/www/tests/ui-fit/my-data-fit.spec.ts` (Playwright, My data)

My data (MY-DATA MD2) is the phone's page of what you keep: three figures,
three charts, each kind of recording, and a kind's list. The phone page's
`my-data`, `my-data-unpaired` and `my-data-kind` fixtures draw it with every
kind and the widest numbers it says, and the spec sweeps each at
`PHONE_VIEWPORTS` with `findViolations` and a check that nothing is wider
than the phone, once more with the tables shown.

### 2i. `apps/www/tests/ui-fit/stays-put.spec.ts` (Playwright, a screen holds still while it is used)

The other specs ask whether a screen fits at rest. This one asks whether it
holds still while it is used (promise HS1). A screen at any moment is a
still picture; a person acting on it (typing a figure on a keypad, tapping
through a study card, filling a form) is acting on that picture, and is
still acting on it when the app answers. A thumb and an eye aim where a
control was a moment ago, so an answer that rearranges the picture takes the
next tap meant for another control. aph's logger did that on every number:
the first digit typed was outside the usual range, a "Typo?" banner mounted
above the keypad, and the keypad dropped 48px, about one row of keys.

So the rule has two halves, and neither is satisfied by machinery the person
can see:

1. **What the app says about what was just done is said over the screen,
   never in it.** A warning, a refusal, "saved", "loading", a hint: each is
   said with `Notice` (`@some-ui/shared`), which floats on the screen's
   notice plane, as a toast or a popover does, and takes no room in the
   layout. The www shell puts the plane under its header; a sheet or dialog
   has its own at its top, since a modal hides the page's. A notice nothing
   else takes away (a refusal) carries a close button.
2. **The layout changes only when the person asked for other content:**
   another screen, another form of this one (a mode switch), or more of it
   (a translation, the rest of a list), which then grows _below_ what was
   tapped. Nothing holds room for what might appear: no blank line kept for
   a message, no invisible stand-in for a control. A control that cannot be
   used now stays in its place, disabled, which says why it is there; a word
   that changes ("Copy", "Copied") keeps one width (`SameWidth`); every
   `Button` variant draws a border, transparent unless it shows, so a toggle
   between `outline` and `default` keeps its width.

The spec walks a screen tap by tap (`holdStill`,
`apps/www/tests/layout-invariants/stays-put.ts`). Before and after each tap,
once animations have ended, it reads every visible target's box in its
scrolled content and fails on any that moved, and it fails on any element
with `role="alert"` or `role="status"` that takes room in the screen instead
of being on the notice plane, an empty one held open included. A tap whose
point is a new layout declares it with `reflows` and says why; a tap that
asks for more declares `grows`, and may move only what is below it. A
message, a preview or a refusal is never either.

A CLS budget would not have caught any of this. The Layout Instability API
leaves out every shift within 500ms of an input (`hadRecentInput`), which is
every shift a tap causes, so a screen that moves under each tap scores zero.

The walks, and HS1's Family, are in `stays-put.spec.ts` (aph, and the
measure's planted self-test) and one spec per wing beside it
(`stays-put-rounds`, `-soundbites`, `-topik`, `-www`), each listed in
`pr.yml`. A phone screen none of them walks is outside HS1 until one does,
with its fixture on the phone page (`./phone-page/fixtures.tsx`). A spec is
its walks: taps built from the measure's own (`button`, `toScreen`,
`waitsFor`, `refuseWrites`), handed to `walkEachPhone` (`harness.ts`), which
opens each walk's fixture at every phone size. What happens on a screen
without a tap (a save refused, home answering, the phone filling up) is a
fixture's action (`./phone-page/fit-actions.ts`), which a walk calls with
`happens`. Run them against a built phone page:

```sh
pnpm --filter www build:fit-phone
pnpm --filter www test:ui-fit tests/ui-fit/stays-put.spec.ts
```

### 2j. `pnpm check:stays-put` (a count, HS3)

The walks in 2i hold the screens they walk. What keeps a new screen from
bringing the fault back before anyone writes a walk for it is a count of its
shape in the source: an error or status line drawn in a phone screen's
layout instead of said with `Notice`.

> **HS3: a phone surface draws no error or status line in its layout, except
> the ones listed as its content.**
>
> - _Claim:_ every phone source file (`packages/eslint/src/phone-sources.ts`,
>   the scope GES5 holds too) with a JSX element of `role="alert"` or
>   `role="status"`, or an `<Alert>`, other than a `<Notice>`, is listed in
>   `scripts/notices.allowlist` at its exact count, in a group whose
>   `Content:` line is true (the line is the screen's own content, such as a
>   figure, not news of what was just done), or in the `Grandfathered:` group,
>   which only shrinks.
> - _Falsified by_ an allowlist hunk that adds or raises an entry under a
>   `Content:` line that the file it names, as it stands after the diff,
>   contradicts: the line answers a tap, a save or a load (a refusal, a
>   warning, progress). Or a hunk that rewords a `Content:` line so it no
>   longer says what content the line is. Or a hunk that narrows
>   `staysPutSites` in `packages/eslint/src/stays-put.ts` or `phoneSources` in
>   `packages/eslint/src/phone-sources.ts`.
> - _Scope:_ `scripts/notices.allowlist` and the files it names;
>   `packages/eslint/src/stays-put.ts` and `phone-sources.ts`.
> - _Why not enforced:_ that each line is listed at its count is enforced
>   (`pnpm check:stays-put`, in root `pnpm lint` and pr.yml). Whether a line
>   is content or news is a reading no AST can make; the walks in 2i measure
>   it for the screens they walk.

> **HS2 (retired): a line a phone surface mounts on a condition is listed,
> with why it moves nothing.**
>
> - _Claim:_ every phone source file that mounted an element with
>   `role="alert"`, `role="status"` or `<Alert>` on a condition was listed in
>   `scripts/stays-put.allowlist`, under a true `Placement:` line or
>   `Grandfathered:`.
> - _Falsified by_ an allowlist hunk under a `Placement:` line its file
>   contradicted.
> - _Scope:_ `scripts/stays-put.allowlist`, `packages/eslint/src/stays-put.ts`.
> - _Why not enforced:_ whether a listed line moved a control was layout.
> - _Retired:_ by HS3 (the owner, 2026-11-06). A line kept in the layout,
>   even after the last control or in room held for it, shows the screen's
>   machinery as a blank or a jump; what a screen says about a tap goes on
>   the notice plane, so the count now covers every such line in the layout,
>   not only those mounted on a condition.

What the count cannot see (a line with no role, a role set by a spread, text
that changes length in an element that stays) is in the module's header, and
stays with review and the walks.

### 3. CI

The ui-fit specs ran nowhere until #899. `pnpm test:ui-fit` existed, this
document called them "the actual gate", and no workflow invoked them — which
is its own lesson about where guardrails actually live. `pr.yml` now builds
the panel page and the phone page and runs `panel-fit`, `incident-fit`,
`studio-fit`, `settings-bar-fit`, `my-data-fit`, `launcher-fit`,
`exercise-shell-fit`, `intent-failure-fit`, `rust-rounds-fit`,
`take-pattern-fit` and `stays-put` whenever a PR touches `packages/ui/**`, `packages/some-content-registry/**`,
`packages/some-styles/**`, `apps/www/src/**`, `apps/www/tests/ui-fit/**`,
www's build config (the list is in `pr.yml`), the root `package.json` or
`pnpm-lock.yaml`.

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
