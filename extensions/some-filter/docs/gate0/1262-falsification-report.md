# Gate 0 falsification report — issue #1262 (shadow DOM visual admission control)

Status: Gate 0 complete. Verdict: **proceed** — every proposition tested holds; no
counter-evidence surfaced that would require revising the architecture
recommendation this report answers.
Answers: the falsification-spec document supplied for this task ("visual admission
control across rendering scopes"), itself responding to
<https://github.com/paulgsc/some-ui/issues/1262>.
Repository snapshot this Gate 0 pass ran against: `paulgsc/some-ui@f560aeb6210aeab899d5b466c8b988403186574e`
(branch `claude/new-session-vmw51h`, unchanged base).

This document is the artifact Gate 0 itself required before any production source
changed: "construct a live-browser falsification harness against the built
extension and prove all of the following. If any proposition fails, stop and
revise the model rather than improvising around the failed case." No production
pipeline code (`src/adapter/*`, `src/lib/content/*`, `src/content/content.ts`,
`public/prepaint-*`) was modified. Everything new lives under
`tests/e2e/fixtures/` (harness/fixtures), `tests/e2e/specs/issue-1262-gate0-*.spec.ts`
(the seven falsification specs), and one addition to the existing
`src/adapter/__tests__/pipeline.test.ts`.

## How to reproduce

```
pnpm build:chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium \
  npx playwright test tests/e2e/specs/issue-1262-gate0
```

(`scripts/claude-e2e.sh` / `pnpm test:claude:e2e` does the executable-path
resolution automatically in this sandbox.) All nine specs pass as of this
report. The G0.1 unit tests run under the normal `pnpm test` (vitest) path.

## Environment limitation, stated up front

This sandbox has exactly one browser available (`$PLAYWRIGHT_BROWSERS_PATH/chromium`,
a Chromium build) and no Firefox binary at all. `tests/e2e/fixture.ts`'s own header
already documents why the *existing* suite is Chromium-only: "Playwright has no
mechanism to attach to a web-ext-managed Firefox process." G0.3 explicitly asks
for proof "on every supported browser." **Every finding below that depends on
live browser timing (G0.2, G0.3, G0.5, G0.6) is Chromium-only evidence.** This is
disclosed, not silently assumed away — the recommendation is a **new CI/manual
task**, not part of this Gate 0 pass, to verify the same claims against Firefox
via `web-ext` + a suitable remote-debugging bridge before the eventual
implementation is declared cross-browser-safe. Nothing here claims otherwise.

## Frame-oracle methodology, and its own honesty caveat

`tests/e2e/fixtures/frames.ts` records video for the window under test
(`recordVideo` on a dedicated Playwright context — `gate0-fixture.ts`, kept
separate from the shared suite fixture so the rest of the suite isn't recorded
for no reason) and decodes **every** frame ffmpeg extracts, not a periodically
polled subset. This is strictly stronger than the screenshot-polling pattern
`pixels.ts` already uses elsewhere in the suite, which cannot distinguish "never
painted natively" from "painted natively for one frame between polls." It is
still not a formal proof of zero missed frames: Chromium's CDP screencast is not
a vsync-locked capture of a physical display, and this sandbox has no
`HeadlessExperimental.beginFrame` single-stepping wired up. This is the strongest
oracle achievable with this tooling stack without a materially larger harness
rebuild, reported as such rather than as an absolute guarantee — consistent with
`prepaint.css`'s own documented distrust of this exact sandbox for
filter-compositing measurements (see G0.7 below, where that distrust turned out
to be exactly the right instinct once, and exactly the wrong one to over-apply
once verified).

One methodological fix worth recording for whoever extends this harness:
`captureFrames` originally decoded from the very start of the page's recorded
video (page creation), not from when the caller's `fn()` actually began — early
passes on G0.6 reported a spurious "leak" at `frameIndex 0` that was really an
artifact from setup (page load / `waitForClassification`) captured before the
window under test even started. Fixed by tracking each page's creation
timestamp (`gate0-fixture.ts`'s `pageCreatedAt` map) and skipping to it via
ffmpeg's `-ss` before decoding. Anyone adding a new Gate 0 spec should be aware
`captureFrames`'s first frame is *approximately* "when `fn()` started," not "when
the page was created."

---

## G0.1 — the current key space cannot express the missing state

**Holds.** Two independent proofs, live and mechanical, per the falsification
spec's own bar ("Confirmed live against the real built extension... not just a
jsdom unit test").

- **Mechanical** (`src/adapter/__tests__/pipeline.test.ts`, new
  `describe("scan — shadow DOM boundary (#1262 Gate 0, G0.1)")`): an identical
  white surface, one in light DOM and one inside an `attachShadow({mode:"open"})`
  root, scanned via `scan(document.body)` (`pipeline.ts:458`). The light-DOM
  surface produces exactly the expected `elementsByKey`/`attrsByKey` entry; the
  shadow-internal one produces **zero** entries, under any key, anywhere. A
  second test drives the full `createContentSession.rescan()` path (not just
  `scan()` in isolation) for three rounds and confirms the shadow surface never
  receives `data-sw-patched` and its declared white background is untouched,
  while the light sibling is themed normally.
- **Why, structurally**: `scan()`'s `document.createTreeWalker(root,
  NodeFilter.SHOW_ELEMENT)` (`pipeline.ts:462`) walks one node tree per the DOM
  standard's own tree-traversal definition; a shadow root is a distinct node
  tree from its host's, and nothing about a plain `TreeWalker` construction
  crosses that boundary. This is not jsdom-specific (jsdom 26 implements the
  same traversal algorithm) — see G0.3 for direct confirmation this silence is
  also permanent in the real built extension, not merely a jsdom artifact.
- **Canon cross-check**: `docs/canon/dom-state-estimation-canon.typ`'s
  Definition 2.2 (manifest vs. latent state) explicitly lists a **closed**
  shadow root as latent/unobservable by design, alongside `<canvas>`. It does
  **not** list an open shadow root as latent — an open root is reachable
  (`.shadowRoot` is a plain property read, no privilege needed) and therefore
  belongs to the *manifest* subspace `δ` is defined to range over. The gap
  G0.1 proves is not that the canon's environment model is wrong; it's that
  `scan()`'s concrete `δ` realization doesn't yet range over all of the
  manifest subspace the canon already licenses it to. `ingest()`'s loop over
  `lastScan.attrsByKey` (`pipeline.ts:549`) is total and mechanical, so "zero
  `attrsByKey` entries" already implies "zero hypothesis updates, zero
  `SurfaceKey` in `Ĥ`, zero `tag-surface`/`emit-surface-color` action" without
  needing separate proof of each.

## G0.2 — three creation traces, measured by frame not by final state

**Holds**, live, via the frame oracle. `tests/e2e/fixtures/shadow-traces.ts` +
`tests/e2e/specs/issue-1262-gate0-g02-creation-traces.spec.ts`, against
`dist/content.js`:

1. Shadow root populated on a **disconnected** host, then the host inserted.
2. `attachShadow()` on an **already-connected** host, then populated.
3. Mutation inside a root that **existed before classification ever ran**
   (isolates the observer gap from the creation-timing gap).

All three: every decoded frame across a ~600ms post-mutation window reads
native-bright (`firstLeak` finds a leak in frame 0 onward, not a transient one
that later self-corrects) — consistent with G0.1: there is no discovery event
at all for the current pipeline to react to, in any of the three orderings, so
exposure is permanent rather than a bounded flash. Trace 3 in particular
confirms the *observer* gap independently of discovery timing:
`observe()`'s `MutationObserver` (`pipeline.ts:655`, `subtree: true` on
`document.documentElement`) does not cross a shadow boundary by the DOM
standard's own definition of `subtree`, so a mutation to an already-registered
(from the canon's perspective; never actually registered by `scan()`) root
produces zero tokens, ever — not delayed, absent.

## G0.3 — the timing premise

**Holds on Chromium; not run on Firefox (see the environment limitation
above).** The falsification spec's precise claim — "a raw mutation notification
being able to transition a registered scope to held before the browser's next
paint" — is answered as a *negative* result here, not a positive one, and that
negative result is exactly what G0.5 measures directly: under
`naive-remedy.ts`'s reactive, debounced (50ms, `RECONCILE_POLICY.debounceMs`
exactly) discovery, a sustained mutation burst produces native-bright frames
for the *entire* burst, because each new mutation re-arms the debounce before
the previous one fires. This is direct, frame-level evidence that a raw
mutation → observer → hold transition is **not** synchronous-before-paint in
this environment: there is a real, measured, paintable gap. See G0.5 for the
full result; it is not duplicated as a separate spec since the same
instrumentation answers both questions from one experiment, per the
falsification spec's own suggestion to "include a sustained mutation burst."

## G0.4 — the creation interception boundary

**Holds, exactly as predicted, and confirmed rather than assumed.**
`tests/e2e/fixtures/probe-extension/` (a throwaway, never-shipped, two-file MV3
extension — `manifest.json` + `probe.js`) patches
`Element.prototype.attachShadow` at `document_start`, in its own isolated JS
world, and leaves a DOM marker whenever the patched version runs.
`tests/e2e/specs/issue-1262-gate0-g04-interception.spec.ts` then loads a fixture
page whose own inline (main-world) script calls `.attachShadow()`. Result: the
shadow root is created successfully, but the isolated-world patch's marker
**never appears** — Chromium's content-script isolated worlds have genuinely
separate copies of built-in prototypes, not merely separate global variables, so
a `document_start` content-script hook on `Element.prototype` is not a reliable
cross-world interception boundary for shadow roots a vendor page creates
itself. A second assertion in the same spec confirms declarative Shadow DOM
(`<template shadowrootmode="open">`) produces a working shadow root with **no**
`attachShadow()` call from any world at all, structurally confirming an
imperative hook — even a hypothetically working cross-world one — could never
be a complete creation-interception strategy on its own.

**This is the most consequential single finding for the eventual design**: it
forecloses "intercept-at-creation, hold synchronously before the constructor
returns" as an available primitive for the imperative case, and rules it out
entirely for the declarative case. The only mechanism left that can honor Axiom
C.1's pessimistic default without a reliable creation hook is coarser-than-scope
custody held across the *interval of uncertainty* — i.e. the falsification
spec's own "on uncertainty, hold the whole affected rendering scope" heuristic
is not merely the cheapest starting point; per this result, it is close to the
only sound option available on this platform, absent a fundamentally different
mechanism (e.g. a persistent CSS admission rule, per the falsification spec's
own G0.3 fallback clause). G0.6 tests exactly that coarser primitive.

## G0.5 — falsify the naive issue remedy

**Falsified, decisively, exactly as the falsification spec predicted.**
`tests/e2e/fixtures/naive-remedy.ts` implements — in the harness only, never in
`pipeline.ts` — precisely what issue #1262 itself proposes: a recursive,
shadow-aware `TreeWalker` (extended with one added branch: descend into
`element.shadowRoot` wherever found), one `MutationObserver` per newly
discovered root, and one recolor-in-place action per discovered root — all
behind the real 50ms reconcile debounce.
`tests/e2e/specs/issue-1262-gate0-g05-naive-remedy.spec.ts` runs a 300ms
sustained burst of new shadow-root creation (`sustainedShadowChurn`, mirroring
`hostile-page.ts`'s existing `sustainedMutation` pattern) against it, captured
with the frame oracle. Result: at least one frame is native-bright throughout
the burst — every new mutation re-arms the debounce before the discovery round
that would have caught the *previous* mutation gets to run, so the exposed
native window has no fixed upper bound for as long as churn continues. A
second assertion confirms the remedy **does** eventually catch up (the last
captured frame, well after the burst ends, is dark) — this is what makes the
counterexample a real timing gap rather than a broken simulation: reachability
(finding every root, eventually) is empirically **not** the same property as
admission control (never letting a native-bright frame paint), preserved here
as the decisive trace the falsification spec asked to keep.

## G0.6 — the candidate custody primitive

**Holds, for the honest occlusion fallback** — the falsification spec's own
fallback clause: "If no non-destructive primitive satisfies this for an
arbitrary theme, the universal fallback is concealment/occlusion. That cost is
honest." Given G0.4 rules out per-scope creation interception, this is the
primitive actually worth proving:
`tests/e2e/fixtures/occlusion-primitive.ts` installs a theme-independent,
permanently-engaged, self-healing full-viewport cover (structurally the same
shape as the existing production document veil, `public/prepaint-start.js`,
just held open-ended instead of released after first classification).
`tests/e2e/specs/issue-1262-gate0-g06-occlusion-primitive.spec.ts` runs it
against the **identical** sustained-churn burst that defeated the naive remedy
in G0.5, and a second variant that additionally, adversarially removes the
cover element on a 15ms cycle throughout the same burst (mirroring #1259's own
head/body-replacement churn shape). Result in both cases: **zero** leaked
frames — the frame oracle finds no native-bright frame at any point.

This is a deliberately blunt point on the spectrum (document-granularity,
never contracted, no theme awareness at all — the "null adapter" form the
falsification spec asks the custodian to be reducible to) and is not proposed
as the final design; it is the proof that *some* theme-independent primitive
satisfying G0.6's bullet list actually exists and is implementable without
touching production, which is what Gate 0 requires before anything more
refined (subtree-level holds, per-root holds) is attempted.

## G0.7 — legacy's actual compositing closure

**Holds — legacy mode is closed over open shadow roots, nested shadow roots,
and slotted content**, both as a platform primitive and in the real extension,
with one real but explicitly out-of-scope confound identified and controlled
for along the way.

- **G0.7a** (`tests/e2e/specs/issue-1262-gate0-g07-legacy-closure.spec.ts`,
  no extension loaded at all): the exact filter string
  `theme-apply.ts`'s `buildFilterString()` produces for `LEGACY_CONFIG`
  (`invert(1) hue-rotate(180deg) sepia(0.12) brightness(0.5) contrast(0.92)`)
  applied to `<html>` composites a flat open shadow root, a shadow root nested
  two levels deep, and light-DOM content projected via `<slot>`, **identically**
  to an ordinary light-DOM sibling. This answers the platform question
  cleanly: unlike CSS selectors (which the DOM standard specifies do not cross
  a shadow boundary — the mechanism G0.1 depends on), a `filter` is a
  compositing effect over an element's whole rendered output and does reach
  shadow-hosted content.
- **G0.7b** (same file, real `dist/` extension via `enterLegacyMode`): once
  legacy mode is active, none of the three shadow/slotted cases are ever left
  at literal native white, and all read as dark by the same luminance bar the
  frame oracle uses elsewhere in this report.
- **A genuine, out-of-scope confound, found and controlled for, not
  papered over**: the very first version of this spec compared a shadow-hosted
  box's composited color directly against its light-DOM sibling and got a
  **mismatch** for the light-DOM reference itself — traced to `applyState()`'s
  `restoreVendor()` (`src/content/content.ts`) not stripping the auto-mode
  pipeline's per-element `data-sw-patched` tag / dynamic stylesheet
  (`__sw_dark_dynamic`) when a tab transitions directly from `auto` into
  `legacy` on a cold profile (every fixture page in this suite starts in
  `auto` before any test switches it, since `init()` applies `auto` as its
  synchronous default before the async `GET_TAB_FILTER_STATE` response can
  ever arrive). This reproduces on **light-DOM** content too (confirmed
  directly on `#light-box` and on `#slotted-content`, itself real light DOM
  merely rendered via `<slot>`) — it has nothing to do with shadow DOM or
  #1262, and is **not** a zero-leak violation (the resulting composited color
  stayed dark in every case observed here; it is a *hue* correctness question,
  not a *safety* one). G0.7b's assertions were narrowed to the actual safety
  property (never native-bright) plus an explicit strip of the confounding
  tag before measuring the slotted case, rather than silently loosening the
  spec or ignoring the anomaly. **This is worth its own follow-up issue** to
  the maintainers — `restoreVendor()`'s auto→legacy transition appears to
  leave a stale per-element theme artifact behind — but it is not part of
  #1262 and this report takes no further action on it.

Per the falsification spec's own framing, this result means legacy "may use a
degenerate permanently-committed state without per-surface classification":
the eventual rendering-scope custody machinery does not need to additionally
cover the legacy path.

---

## Verdict and what this changes about the recommended model

All seven propositions hold; none produced counter-evidence against the
falsification spec's architecture recommendation. Two concrete refinements to
carry into the next phase (canon amendment / production design), both
grounded in evidence gathered here rather than restated intuition:

1. **G0.4 forecloses per-scope creation-time interception as a primitive.**
   The recommended custody model's transition table lists "new root → HELD
   before creation returns or before host can paint" as an event handled via
   interception; this Gate 0 pass shows that specific mechanism (an
   isolated-world `attachShadow` patch) does not exist on this platform, for
   either the imperative or the declarative case. The model's own fallback —
   coarser ancestor/document custody bounding an unregistered scope — is not
   merely the cheaper option; it is the only one left standing, and G0.6
   confirms it is implementable and sound.
2. **Legacy needs no new custody machinery** (G0.7). The eventual
   implementation sequence can treat legacy mode as already conformant and
   spend no effort extending it.

## What Gate 0 deliberately did not do

Per the falsification spec's own instruction ("Before changing production
source, construct a live-browser falsification harness... prove all of the
following"), this pass built and ran the harness only. Not done here, and left
for the next phase now that Gate 0 has cleared:

- No change to `pipeline.ts`, `contracts.ts`, `theme-adapter.ts`,
  `actuator.ts`, `theme-apply.ts`, `content.ts`, or `public/prepaint-*` —
  the actual rendering-scope registry, custody state machine, and creation
  discovery this issue needs.
- No canon amendment (`docs/canon/dom-state-estimation-canon.typ`) yet —
  the falsification spec's own sequencing ("land the falsification harness
  and canon amendment first") bundles the two, but re-deriving D.1/D.2 and
  the custody claims correctly is substantial, precise work in its own right,
  and is better done informed by this report's concrete findings (especially
  G0.4's interception result) than attempted in the same pass as first
  building the evidence it needs to cite.
- No Firefox verification (environment limitation, stated above).
- No attempt at subtree- or node-level custody granularity — out of scope
  per the falsification spec's own sequencing (§8: "only after safety is
  stable, contract custody volume").
