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

**What cannot be guarded, and why.** These are the parts of the idiom no lint
rule or test here can regress against. They are named so that a change near
them is made knowingly, not so that they are forgotten.

1. **Whether the owner ends at the right time.** A lint rule sees a call site.
   A `signal` or a `Disposables` proves a resource _has_ an owner, not that the
   owner ends on every transition that should end it. A scope disposed only at
   unload satisfies both rules and is exactly the shape of the 200-tab
   incident (see `require-named-lifetime`). "Which transitions should stop
   this?" has its answer in whichever module decides activity, not at the call
   site, so it is a design question, not a syntactic one. _Hold the line
   by:_ acquiring what runs while active inside an `ActiveScope`'s `start`, and
   naming every reason to stop as a hold there.
2. **Transitions nobody wrote a test for.** A lifetime suite checks the states
   it drives. A new way to go dormant (a new size, a new mode) is untested
   until someone adds it; no harness can enumerate states it was not told
   about. _Hold the line by:_ adding each new hold to the suite in the same
   change that adds it to the `ActiveScope`.
3. **Exemptions are honour-system.** An `eslint-disable` for either rule
   passes with any comment; a linter cannot judge whether the prose names a
   real lifetime. Every exemption stays greppable
   (`rg "eslint-disable.*require-(named|scoped)-lifetime"`) and must name
   what ends the resource. Page-lifetime listeners in a content script's own
   entry point are the legitimate case.
4. **Resources the rules do not recognise.** `MutationObserver`,
   `ResizeObserver`, `IntersectionObserver`, `WebSocket`, `BroadcastChannel`,
   `browser.*.onX.addListener`, listeners on long-lived non-page targets (a
   `MediaQueryList`, a vendor element that outlives the overlay), and any call
   through an alias (`const d = document; d.addEventListener(…)`). The rules
   are syntactic on purpose: widening them either flags correct one-shot uses
   (why `matchMedia` was dropped from `require-named-lifetime`) or needs type
   and flow analysis they do not do. _Hold the line by:_ acquiring these
   through a `Disposables` too — `life.add(() => observer.disconnect())`.
5. **CSS the harness cannot see.** `ungatedInfiniteAnimations` reads the
   stylesheet source against the DOM a test builds — jsdom runs no CSS. It
   does not see animations started from JS (`element.animate`), elements a
   test never mounts, or effects that never end without being `infinite`
   (a `transition` re-triggered by a loop). _Hold the line by:_ putting every
   animated element under the overlay root's dormant gate, and creating any
   that cannot live there (fixed-position layers) inside the `ActiveScope`.
6. **What only a real browser does.** Whether a page is showing comes from the
   browser: an OS window occluded behind another may be reported hidden (and
   stop painting, which matters for a stream-captured overlay), and a page
   restored from the back/forward cache comes back without re-running the
   content script. Unit tests stub `visibilityState`; neither case can be
   simulated in jsdom, and a Firefox MV2 extension cannot be loaded into
   Playwright. _Hold the line by:_ keeping activity decided in one place
   (`watchPageShowing`), so a real-browser check has one seam to test.
7. **Coverage that depends on CI wiring.** `@some-extension/common`'s own
   unit suite runs on trunk only: PR CI excludes `extensions/**` from its node
   job, and the extension matrix skips workspaces with no manifest. A
   regression in the primitives is caught on a PR only through a workspace
   suite that exercises them. And nothing forces a workspace to have a
   lifetime suite at all — adoption is per workspace (tracked in the issue
   that moves the other workspaces from warn to error).

### Migrations are per-workspace and isolated

Because adopting these commons touches storage shapes across disjoint
workspaces, **migrations are namespaced per workspace.** Workspace `w` may have
applied `m` migrations while workspace `u` has applied `n`; the two counters are
independent and never coupled. A migration authored for one workspace must never
read or mutate another workspace's namespace. This keeps every adoption PR
markovian: it only needs to know its own workspace's current migration version.
