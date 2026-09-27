# The Good-Citizen Charter

> Canonical reference for every extension workspace in this monorepo.
> Lives in `@some-extension/common` because it is shared _judgement_, not shared _code_.

A browser extension is a **guest runtime executing inside a host-owned
environment.** Almost every extension bug we have shipped comes from accidentally
assuming the opposite. This document is the specification that the
[Extension Commons](https://github.com/paulgsc/some-ui/labels/commons) epics
exist to uphold.

Two mandates are in tension and both must be honoured:

1. **Disjointness.** Each workspace must stay independent enough that diffing a
   line or a style in workspace `A` can never produce an unexpected bug in some
   nth workspace `B`. We never want the fear CSS creates ("touch nothing").
2. **No reinvention.** We must not constantly reinvent hacky slop that creates
   collisions and complexity.

The balance: **hoist the _contract_ and the _typestate_ into the commons; keep
the _application_ isolated per workspace; enforce the idioms with a shared
linter rather than a shared runtime.** An idiom living here does _not_ imply a
shared implementation — where an idiom cannot be a single source of truth
(namespacing, storage prefixes, z-index discipline), the shared artifact is a
**lint rule** in `@some-ui/eslint-kit` that keeps each workspace from drifting.

---

## 0. The host page owns reality

Your extension does not own the DOM, CSS, the z-index stack, the event system,
the navigation lifecycle, or the performance budget. The vendor page does.

```
Vendor Page
    ↑
    │ owns
    │
Extension
```

not

```
Extension
    ↑
    │ controls
    │
Vendor Page
```

This sounds philosophical, but it drives dozens of implementation decisions below.

---

## 1. Existing behavior is specification, not implementation

When porting `React/Tailwind → Vanilla TS/CSS`, the React version is a
**behavioral / UX / visual specification.** It is _not_ an implementation
constraint. The runtime architecture should be extension-native.

---

## 2. Logic ≠ Presentation ≠ Effects

```
            Logic
              │
     ┌────────┼────────┐
     │                 │
Presentation       Effects
```

- **Logic** — state machines, policy, disclosure levels, command routing.
- **Presentation** — CSS, layout, themes, animation.
- **Effects** — DOM, browser APIs, tabs, storage, network, keyboard.

Logic must not know about `document.querySelector(...)` or
`browser.tabs.create(...)`. This separation is what makes a logic layer
portable (even to WASM) and testable without a DOM.

> **Enforced by:** a lint rule forbidding `document.*` / `browser.*` / `chrome.*`
> references inside designated logic directories.

---

## 3. Commands are more important than inputs

Instead of binding `Alt+Shift+B => toggle`, define a **command**:

```
toggle-extension
```

Then a hotkey, popup button, context menu, command palette, and automation can
all feed the same command. This scales far better across extensions, and it is
why keybindings are hoisted into the commons as a **typestate** (the binding
table type, the platform-normalized matcher, the input-context guard) defined
**once**, while the command _handlers_ stay local to each workspace.

---

## 4. Namespace everything

A good citizen assumes every namespace is **already occupied.**

| Concern | Good                         | Bad               |
| ------- | ---------------------------- | ----------------- |
| CSS     | `.ph-root`, `.ph-card`       | `.card`           |
| DOM     | `<div data-polyhedron-root>` | `<div id="root">` |
| Storage | `polyhedron.boyo.*`          | `settings`        |
| Events  | `polyhedron:toggle`          | `toggle`          |

Each workspace owns **one** prefix and uses it for CSS classes, `data-*`
attributes, storage keys, and custom event names. The prefix is the workspace's
identity; collisions across workspaces are then structurally impossible.

> **Enforced by:** a per-workspace namespace lint rule. The prefix is _declared_
> per workspace (config), not shared — so workspaces stay disjoint while the
> _discipline_ is shared.

---

## 5. Shadow DOM is the default isolation boundary

Not because it is fashionable — because vendor CSS and extension CSS must be
independent. Without isolation, a vendor update breaks your UI, or your CSS
breaks the vendor page. Both are failures.

> **Reference implementation:** `some-conveyor`'s `ShadowHost` (closed shadow
> root, `contain: layout style paint`). Slated to hoist into the commons.

---

## 6. Never fight the z-index war

Bad citizenship is an escalation ladder: `99999999` → `999999999` →
`2147483647`. Good-citizen thinking:

- use isolated roots (shadow DOM / top-layer APIs when available);
- reserve headroom below max so vendor emergency UI (payment, security
  warnings) can still render above you — `some-conveyor` deliberately sits at
  `2147483640`, **not** `2147483647`;
- suspend during fullscreen; never cover critical vendor UI.

> **Enforced by:** a lint rule banning raw escalating `z-index` literals;
> require the shared z-index policy constant.

---

## 7. Fullscreen is a hard suspend

When a video enters fullscreen the user has explicitly chosen immersion. The
extension UI **disappears** — it does not fight for visibility. Suspend
animations, observers, overlays, and update loops; resume afterward.

> **Reference implementation:** `some-conveyor`'s `PageMonitor` treats
> fullscreen (and a hidden tab, and a focused window) as `Suspended`.

---

## 8. Resource budgets matter

The extension shares a process with the page. Prefer shared infrastructure:
**1 observer, 1 scheduler, 1 rAF** over `5 MutationObservers / 3 rAF loops /
7 intervals`. Every allocated resource (rAF, observer, timer, WASM viewport,
DOM node) must be registered for deterministic teardown.

> **Shared primitives:** `Disposables` and `ActiveScope` in
> `@some-extension/common` (hoisted from `some-conveyor`'s
> `DisposableRegistry`). **Enforced by:** `require-named-lifetime` and
> `require-scoped-lifetime`, plus a workspace lifetime suite built on
> `@some-extension/common/testing` — see
> [Resource lifetimes: what is enforced, and what is not](#resource-lifetimes-what-is-enforced-and-what-is-not).

---

## 9. Detect, don't assume

Vendor DOMs are hostile and mutable. Avoid
`document.querySelector("#some-youtube-id")` when that id is not contractually
stable. Prefer **scan → classify → reconcile**. An FSM-driven reconciliation
loop is more reliable than imperative event chains.

---

## 10. Prepaint should hide uncertainty, not create certainty

Bad: _guess vendor theme → paint immediately._ Good: _neutral veil → detect
reality → commit theme → remove veil._ The prepaint layer exists to **buy
time**, not to become the theme engine.

> **Reference implementation:** `some-filter`'s `prepaint` + `theme-detector`.

---

## 11. Coexistence over control

The highest-level rule. A good extension does **not**:

- break the page,
- break other extensions,
- monopolize resources,
- hijack shortcuts,
- steal focus,
- override critical UI.

If a page update occurs, the extension degrades gracefully.

> Treat the extension as a **well-behaved operating-system process**, not as the
> owner of the webpage.

---

## How this charter is upheld

| Idiom                                                    | Shared as…                                   | Where                             |
| -------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| Commands / keybindings (#3)                              | shared **typestate** (one definition)        | `@some-extension/common`          |
| Isolation, fullscreen, disposal, attention (#5–#8)       | shared **primitives** (reference impls)      | `@some-extension/common`          |
| Namespacing, storage, z-index, logic-purity (#2, #4, #6) | shared **lint rules** (per-workspace config) | `@some-ui/eslint-kit`             |
| Resource lifetimes (#7, #8)                              | primitives + lint rules + a test harness     | see the section below             |
| Schema changes from any of the above                     | **per-workspace, isolated migrations**       | each workspace's migration ledger |

### Resource lifetimes: what is enforced, and what is not

The idiom: **a resource is held only while the thing consuming it is active.**
A timer, a frame loop, a listener on the page, an animation, an observer is
acquired when its consumer starts doing something someone can see, and is gone
the moment it stops — minimised, hidden, not showing, fullscreen, destroyed,
or replaced before it ever started.

**What upholds it.**

| Layer      | What                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitives | `Disposables` (a lifetime: `signal`, `interval`, `timeout`, `frame`, `loop`, `child`), `ActiveScope` (acquire in one `start`, released by any named hold), `isPageShowing` / `watchPageShowing`       |
| Lint       | `require-named-lifetime` (`setInterval`, `requestIdleCallback`); `require-scoped-lifetime` (listeners on `document`/`window` without a `signal` or `once`; self-rescheduling `requestAnimationFrame`) |
| Tests      | `@some-extension/common/testing`: `probeResources()` counts live intervals, timeouts, frames and page listeners; `ungatedInfiniteAnimations()` finds infinite CSS animations outside a dormant gate   |

`require-scoped-lifetime` is a warning in the shared config and an error in a
workspace that has adopted the primitives. `some-drama` is the reference: its
`tests/card-lifetime.test.ts` and `tests/display-lifetime.test.ts` drive the
card through every transition and assert what is still running.

**Invariants L1–L7: what the rules and tests above cannot check.** Each is
written for review, human or bot, one hunk at a time: a claim, what in a
diff falsifies it, where it applies, and why it is a review invariant rather
than a lint rule or test. A reviewer checks the hunk against the claim,
reading at most the file the hunk changes (as it stands after the diff) and
any files the invariant names, since a hunk shows only a few lines of
context; no invariant asks for exploring states the diff does not touch. "Adopted
workspaces" means those with `require-scoped-lifetime` at `error` (today:
`some-drama`). Each held on every adopted workspace when it was written; a
violation is a regression, not debt. Each falsifier covers every edit that
can break its claim, deletions and moves included, not only additions,
because a reviewer stops when the falsifier doesn't match.

**L1: A repeating resource lives on the active scope.**

- _Claim:_ in a class that owns an `ActiveScope`, every `.interval(` and
  `.loop(` call, and every `spawn*(` call, acquires on the `scope` its
  `start` receives or on a child of that scope.
- _Falsified by_ a hunk, in such a file, that calls `.interval(` or `.loop(`
  on the class's own lifetime (`this.life`) or on a `new Disposables()`, or
  calls `spawn*(` outside `start`. A move out of `start` counts: the call
  reappears as an added line elsewhere.
- _Scope:_ adopted workspaces. One-shot `.frame(` and `.timeout(` on the
  class's own lifetime are fine: they end by themselves.
- _Why not lint or tests:_ both rules can see that a resource has an owner,
  but not whether it is the right owner. That is a fact about the component,
  and tests only cover the states they drive (L2).

**L2: Every dormant reason is tested.**

- _Claim:_ every hold name an `ActiveScope` uses appears in the title of an
  `it(` in that workspace's lifetime suite (`tests/*lifetime*.test.ts`). The
  hold names are the type argument, the initial holds, and each
  `.hold(`/`.release(` literal. Substrings count ("min" is in "minimised").
- _Falsified by_ a hunk that adds a hold name with no `it(` title containing
  it anywhere in the workspace's suite after the diff, or that removes or
  retitles an `it(` so an existing hold name no longer appears in any title.
- _Scope:_ adopted workspaces.
- _Why not lint or tests:_ a harness only drives the states it is given,
  and no test can list the dormant states a component will grow later.

**L3: An exemption names what ends the resource.**

- _Claim:_ every `eslint-disable` of `require-named-lifetime` or
  `require-scoped-lifetime` has a line starting `Lifetime:` in the unbroken
  `//` comment block directly above it, saying what ends the resource.
- _Falsified by_ a hunk that adds such a directive without that line, that
  deletes or rewords the `Lifetime:` line above an existing directive, or
  that breaks the comment block between them (inserting a non-comment line).
- _Scope:_ the whole repo. All 12 exemptions met it when it was written.
- _Why not lint or tests:_ whether the `Lifetime:` line is true needs a
  person to read it. Whether it exists is mechanical, so this could become a
  lint rule; until it does, the review checks it.

**L4: A resource the rules do not recognise is still owned.**

- _Claim:_ outside a script's entry module (`background.ts`, `content.ts`,
  `popup.ts`), each of these either registers its release with `<life>.add(`
  in the same function, or carries a `Lifetime:` comment as in L3:
  - `new MutationObserver(`, `ResizeObserver(`, `IntersectionObserver(` or
    `PerformanceObserver(`;
  - `new WebSocket(`, `BroadcastChannel(` or `EventSource(`;
  - `.onX.addListener(` on `browser.*` or `chrome.*`.
- _Falsified by_ a hunk that adds one of these in a non-entry module whose
  function has neither, or that deletes the `<life>.add(` registration or
  the `Lifetime:` comment of an existing one.
- _Scope:_ adopted workspaces. Entry modules are exempt because page or
  worker lifetime is the right lifetime there.
- _Why not lint or tests:_ the rules are syntactic on purpose. Adding these
  kinds would flag correct one-shot and entry-point uses; that is why
  `matchMedia` was dropped. Aliased calls (`const d = document`) are out of
  reach altogether.

**L5: Every infinite animation is behind the dormant gate.**

- _Claim:_ three things hold:
  - the workspace's content stylesheet has a `<root>.<dormant> *` rule with
    `animation: none`;
  - every element that gets an `infinite` animation either sits inside the
    overlay root in the DOM, or is created inside `ActiveScope.start` (or by
    a function that only `start` calls);
  - `.animate(` is called only inside `start`.
- _Falsified by_ a hunk that:
  - removes or weakens the gate rule;
  - gives an element appended outside the overlay root an `infinite`
    animation, when that element is created somewhere other than `start`,
    or moves the creation of such an element out of `start`;
  - or adds `.animate(` outside `start`.
- _Scope:_ adopted workspaces with an overlay (today: some-drama's
  `#dc-root.dc-dormant`).
- _Why not lint or tests:_ jsdom runs no CSS. `ungatedInfiniteAnimations`
  compares the stylesheet source to the DOM a test builds, so it cannot see
  elements a test never builds, animations started from JavaScript, or a
  transition that a loop keeps restarting.

**L6: Only one module decides whether the page is showing.**

- _Claim:_ shipped code reads `document.visibilityState`, `document.hidden`
  or `document.fullscreenElement` only through `isPageShowing` or
  `watchPageShowing`.
- _Falsified by_ a hunk that adds such a read anywhere else.
- _Scope:_ adopted workspaces.
- _Why not lint or tests:_ this one is mechanical and could become a
  `no-restricted-syntax` rule. What stays out of reach is what "showing"
  means in a real browser: an OS window covered by another can report hidden
  and stop painting, and a page restored from the back/forward cache comes
  back without re-running the content script. jsdom can simulate neither,
  and Playwright cannot load a Firefox MV2 extension. Keeping one seam means
  a real-browser check has one place to cover.

**L7 (not reviewable): coverage that depends on CI wiring.**

- _Statement:_ `@some-extension/common`'s own unit suite runs on trunk only.
  PR CI filters `extensions/**` out of its test job, and the extension matrix
  skips workspaces without a manifest. On a PR, a regression in the
  primitives is caught only by a workspace suite that exercises them.
- _Not falsifiable from a diff:_ a reviewer should not flag it on a hunk. It
  is tracked in #1552, and changes only when a workflow does.

### Migrations are per-workspace and isolated

Because adopting these commons touches storage shapes across disjoint
workspaces, **migrations are namespaced per workspace.** Workspace `w` may have
applied `m` migrations while workspace `u` has applied `n`; the two counters are
independent and never coupled. A migration authored for one workspace must never
read or mutate another workspace's namespace. This keeps every adoption PR
markovian: it only needs to know its own workspace's current migration version.
