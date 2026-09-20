# ADR 0002 — User-origin palette enforcement: erase vendor colour, impose E unconditionally

- **Status:** Proposed — see §8 for amendments recorded after review; canon citation pending (#1493)
- **Date:** 2026-09-19
- **Supersedes:** ADR 0001 §3(b), §3(c), and three rows of its adopt/skip table (§1.2 below)
- **Reference:** measurements in §2 were taken against Chromium 1194 (Playwright's
  bundled build) with a real MV3 extension loaded via `--load-extension`.

---

## 1. Context

### 1.1 The problem with the current pipeline

`some-filter` today decides _whether_ to theme a page, then applies a theme per
surface. `theme-adapter.ts`'s `decide()` folds a page-level verdict
(`pageAlreadyDark()`) over a hypothesis built by `pipeline.ts`'s scan, and
`actuator.ts` realizes the result as `data-sw-patched` tags plus a dynamic
stylesheet.

Every hard bug in this extension traces to one property of that design: **the
classifier's input includes the classifier's output.**

- `runAutoTheme`'s fresh scan of an already-themed page sees only what
  `shouldSkip` doesn't exclude — and `shouldSkip` excludes everything carrying
  `data-sw-patched`. The new hypothesis is the complement of our own work,
  `pageAlreadyDark()` reads it as dark, and `decide()` emits `restore-native`.
  This is the tab-switch theme-removal bug and it is what blocks suspend-on-hide.
- `withVendorColorsVisible` exists only to un-poison that measurement, at the
  cost of two full-document style recalcs per batch.
- The interaction audit — the single most expensive thing the extension does —
  exists only to re-measure after CSS state changes.
- Dynamically added nodes paint at vendor default before we reach them. There is
  no settled state `s` for the node graph, so a classify-then-apply pipeline
  races vendor mutations indefinitely.

### 1.2 What ADR 0001 decided, and which parts this reverses

ADR 0001 §2.1 recorded, correctly, that DarkReader **has no already-dark
detector** — it "applies first, refines after." Its §3 adopt/skip table then made
three choices this ADR reverses:

| ADR 0001 row                      | Its decision                             | This ADR                                                 |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Already-dark detector             | "Net-new (ours)" — §3(c)/#236            | **Deleted.** There is no verdict to compute.             |
| CSS variable adjustment           | Adopt — §3(d), third, "trails as polish" | **Rejected outright** (see §1.3).                        |
| Full stylesheet parsing/rewriting | "Skip for now"                           | **Still skipped**, and now for a stronger reason (§1.3). |

ADR 0001 §3(b)'s apply-then-detect flow is superseded: there is no detect phase.
§3(c)'s `theme-detector` module loses its consumer.

### 1.3 Rejected alternative: discovering and remapping vendor tokens

An earlier draft of this shift proposed enumerating the vendor's own CSS custom
properties and remapping them to E. It was measured and works
(`getComputedStyle(:root)` enumerates custom properties even for cross-origin
sheets whose `.cssRules` throws), but it is **rejected**:

- It makes our correctness a function of a vendor's internal token structure,
  which they can rename or restructure at any time without notice.
- It does nothing for hardcoded colour literals, which are the long tail.
- Closing the gaps required re-fetching cross-origin stylesheets over the
  network to recover rule text. That contradicts this extension's
  `data_collection_permissions: { required: ["none"] }` posture and adds a
  network dependency to a rendering path.

**We do not read, parse, fetch, or depend on site-authored CSS in any form.**

### 1.4 The requirement, restated

The user owns the browser. Every vendor page is to be rendered in a
compile-time-known palette E. This is **unconditional**: "does this page need
theming?" is not a weaker form of the requirement, it is a different problem, and
it is the one that produced every bug above.

---

## 2. Decision

Ship E as a **static, extension-owned stylesheet injected at the user origin**,
enforced by structural selectors. Never read page state.

### 2.1 Mechanism: user-origin CSS

`chrome.scripting.insertCSS({ origin: "USER" })` places declarations in the CSS
**user origin**, whose `!important` declarations outrank _every_ author-origin
declaration per the cascade. Measured against a fixture carrying every
escalation a vendor has:

| Vendor declaration                  | Outcome    |
| ----------------------------------- | ---------- |
| `.card{background:#fff}`            | overridden |
| `#idimp{background:#fff!important}` | overridden |
| `style="background:#fff"`           | overridden |
| `style="background:#fff!important"` | overridden |

The third and fourth rows are why this mechanism is worth a rewrite.
`foreground-repair.ts:363` documents the ID-specificity case as structurally
unreachable — _"nothing short of CSSOM rule-matching can detect it… the
principled fix is a different injection origin entirely."_ This is that fix.

Consequences: no specificity war, no `data-sw-patched` tagging, no per-element
actuation, and **no reads**. A node created after injection paints correct on its
first frame, so there is no settled state `s` to wait for and no mutation race.

### 2.2 Strategy: erase, don't paint

Setting every element to `bg0` flattens the page into undifferentiated soup.
Instead:

```css
/* canvas — note the :root:root specificity boost, see §3.2 */
:root:root,
:root:root body {
  background-color: <E.bg0> !important;
}

/* erase every vendor surface; let the canvas show through */
*:not(img):not(video):not(svg):not(canvas) {
  background-color: transparent !important;
  background-image: none !important;
  color: <E.text0> !important;
  border-color: <E.border> !important;
}
```

Vendor layout is preserved; vendor colour is not. Nothing light survives,
including surfaces we have never seen.

### 2.3 E becomes border-led

Erasure collapses every background to `bg0`. Re-introducing elevation requires
_naming_ surfaces, and the only vocabulary available without reading the page is
structural: `dialog`, `[role=dialog|menu|listbox|tooltip]`, `[popover]`,
`input/textarea/select/button`, `th/thead`, `nav/header/aside`. That vocabulary
covers well-built sites and misses generic `<div>` soup entirely.

**Decision: E expresses hierarchy through borders, not fills.** `border-color` is
uniformly enforceable on every element regardless of semantics, so a border-led E
degrades gracefully exactly where a fill-led E goes flat. The `bg1`/`bg2`/`bg3`/
`surface` ramp is retained but demoted to the semantic-surface vocabulary above;
on a generic `<div>` tree, backgrounds collapse to `bg0` and structure is carried
by crisp, low-contrast borders. This is an accepted trade, not a regression.

**Corollary — legibility becomes a compile-time property.** With one background
and one text token in the general case, contrast is a fact about the swatch,
checkable in a unit test over `SWATCHES`. The runtime contrast channel has no
job: `legibility-audit.ts` (1,373 lines), `foreground-repair.ts`, and the
interaction audit that re-measures after state changes all lose their reason to
exist. This is the strongest available form of the "static compile-time
invariant" this shift was asked for.

---

## 3. Constraints — measured, and binding

### 3.1 Shadow DOM is not reachable. The shadow stack stays.

User-origin selectors **do not cross shadow boundaries.** Verified across four
variants — {open, closed} × {adopted stylesheet, plain `innerHTML`} — with both
author-origin `!important` and user-origin `!important` rules naming a class
inside the tree. All four were unaffected in both origins.

```
baseline            {"a":"rgb(255,255,255)","b":"rgba(0,0,0,0)","c":"rgb(255,255,255)","d":"rgba(0,0,0,0)"}
AUTHOR !important   {"a":"rgb(255,255,255)","b":"rgba(0,0,0,0)","c":"rgb(255,255,255)","d":"rgba(0,0,0,0)"}
USER !important     {"a":"rgb(255,255,255)","b":"rgba(0,0,0,0)","c":"rgb(255,255,255)","d":"rgba(0,0,0,0)"}
```

**Therefore `scope-registry.ts` (704), `shadow-scope-discovery.ts` (680),
`shadow-scope-theming.ts` (876) and `shadow-actuator.ts` (392) — ~2,650 lines —
are retained.** A shadow scope still needs discovery, custody, and its own
`adoptedStyleSheets` realization. Anyone budgeting the deletion in §5 must not
count these.

What _does_ simplify: a scope's realization is now a constant sheet (E's rules,
identical for every scope) rather than a per-scope function of a per-scope
verdict. `decide()` running independently per root — the thing that let a
document's verdict and a scope's verdict disagree and pull the rug out from under
each other — is gone.

### 3.2 A specificity trap that silently whites out the page

`*:not(img):not(video):not(svg):not(canvas)` has specificity **(0,0,4)** —
`:not()` takes the specificity of its argument — and therefore outranks
`html, body` at **(0,0,1)**. The erase rule then blanks the canvas too, and the
page renders on the UA's default white with E's light text on it: the exact
light-on-light failure this extension exists to prevent.

Measured:

```
html,body low specificity      {"html":"rgba(0, 0, 0, 0)","body":"rgba(0, 0, 0, 0)"}   <- white page
:root:root boosted             {"html":"rgb(23, 28, 37)","body":"rgb(23, 28, 37)"}     <- correct
```

This failure is invisible to any check that only asserts "the erase rule
applied." **The canvas rule must be specificity-boosted, and a test must assert
the computed background of `html` and `body` specifically**, not merely that
enforcement ran.

### 3.3 `color-scheme: dark` is harmful on its own

Applied alone it darkens UA-default colours — button label, input text,
scrollbars — while vendor backgrounds stay light, producing unreadable
light-on-light controls. It is only safe as part of the full enforcement sheet,
where it also serves as the UA canvas fallback. **Never ship it as a standalone
"cheap win."**

### 3.4 Do not build on the `color-scheme` shadow-piercing quirk

In Chromium 1194, adding `:root{color-scheme:dark!important}` to a user-origin
sheet causes **that sheet's other rules to apply inside shadow trees**, which
they otherwise do not (§3.1). Reproduced deterministically in isolated browser
profiles with exact per-variant tab targeting; a sheet without the `color-scheme`
declaration never pierces.

`color-scheme` has no defined relationship to selector scoping. This is a
Chromium implementation artifact, it is untested on Firefox, and it could
disappear in any update. **It must not be relied on.** It is recorded here
because it produces a screenshot indistinguishable from total success, and a
future session will otherwise rediscover it and mistake it for the mechanism
working.

### 3.5 `background-image: none` is required, and is the main fidelity cost

`background-color: transparent` does not remove gradients; a light
`linear-gradient` survives erasure and keeps painting as authored. Suppressing
`background-image` is therefore mandatory — but it is blunt, and also removes
icons, sprites, logos and avatars delivered as CSS backgrounds. This is the
largest known fidelity cost of the design and the most likely source of per-site
complaints.

---

## 4. The prepaint veil stays

**Investigation: can a `document_start` user sheet replace the veil? No.**

User-origin CSS is **not declaratively registrable.** Chromium rejects the
option outright:

```
chrome.scripting.registerContentScripts([{ …, css:['probe.css'], origin:'USER' }])
→ TypeError: Error at index 0: Unexpected property: 'origin'.
```

Manifest `content_scripts.css` is author-origin, and `registerContentScripts`
has no origin field. User-origin CSS can therefore only be injected
**imperatively**, via `insertCSS` against a known `tabId`, which requires the
MV3 service worker to be running and to complete a round trip. The renderer does
not wait for it.

Measured over 12 navigations, warm service worker, zero-latency local page — the
most favourable conditions obtainable:

```
1/12 navigations painted white before enforcement landed
delta range: -22ms .. +3ms
```

Enforcement usually wins by 10–20 ms and sometimes loses. Real conditions are
strictly worse: MV3 terminates the worker after ~30 s idle, so the first
navigation to a site pays a cold start, and network latency does not delay the
vendor's own cached first paint.

**Conclusion: the veil is retained,** and it is retained for a structural reason
rather than an empirical one — manifest `content_scripts.css` at `document_start`
is in the renderer before it paints anything, and the enforcement sheet
constitutively cannot be. The veil does get simpler: there is no commit/release
decision and no classification to wait for, only "hold until the enforcement
sheet is confirmed applied."

`prepaint.css`'s existing design note — that the veil must not be an ancestor of
vendor DOM so it cannot poison `getComputedStyle` — is now moot rather than
wrong. Nothing reads computed style any more. Do not use that as licence to
restyle vendor elements with the veil; the overlay form is still what makes
teardown atomic.

---

## 5. Consequences

### 5.1 Deleted

- `theme-adapter.ts` — `pageAlreadyDark()`, `decide()`, `restore-native`.
- `theme-detector.ts` — ADR 0001 §3(c)'s detector, and its consumer.
- `pipeline.ts`'s Sensor/Estimator scan and luminance evidence path.
- `withVendorColorsVisible` — nothing to hide, because nothing is read.
- The interaction audit and its 12 ms budget / 30 s cooldown machinery.
- `legibility-audit.ts`, `foreground-repair.ts`, the contrast channel.
- `data-sw-patched` tagging and `actuator.ts`'s per-surface emission.
- The coverage watchdogs and `visibility-gate.ts`'s hidden-tab deferral —
  a static sheet costs nothing to leave applied.

### 5.2 Retained

- `swatches/index.ts` — E itself, modified per §2.3 to be border-led.
- The whole shadow stack, per §3.1.
- The prepaint veil, per §4.
- `extension-charter/require-named-lifetime` and the e2e harness.

### 5.3 Bugs that become structurally impossible

- The self-reference hazard (§1.1) — there is no hypothesis to rebuild.
- The tab-switch theme-removal bug — there is no verdict to invert.
- The suspend-on-hide blocker — resuming re-enters nothing.
- **#1460** (bfcache) — a static user sheet has no session to re-arm. Verify on
  implementation that `insertCSS` survives bfcache restore, or that
  `webNavigation` re-fires; this is the one place the claim needs a test rather
  than an argument.
- #831's shadow-scan feedback — nothing scans.

### 5.4 Risks

- **Fidelity.** §3.5. Expect per-site complaints about missing CSS-background
  imagery. There is no per-site fixes mechanism and adding one reintroduces
  vendor coupling through the back door.
- **Flat hierarchy on div soup.** Accepted in §2.3, but unmeasured against the
  user's real sites. The acceptance test is an eye-strain judgement on
  github.com and claude.ai, which no harness in this repo measures.
- **Firefox parity is unverified.** See §6.
- **The veil's hold window widens.** Enforcement is now a service-worker round
  trip rather than an inline content script, so the veil is up marginally
  longer. Bounded by the same teardown path.

---

## 6. Open — Firefox parity (unverified)

This environment has no Firefox binary and the Playwright CDN is blocked, so
**every measurement in this ADR is Chromium-only.** Firefox is a supported target
(`manifest.firefox.json`, `strict_min_version: "109.0"`) and is where the
200-tab hang was reported, so parity is load-bearing, not incidental.

Two specific asymmetries to check before implementation, neither assumed here:

1. **Does Firefox honour user-origin injection?** Firefox's MV3
   `browser.scripting.insertCSS` takes `origin: "USER"`; its older
   `browser.tabs.insertCSS` took `cssOrigin: "user"`. Confirm which the
   109+ target supports and that user `!important` beats author `!important`,
   including the inline-`!important` row of §2.1's table.
2. **Does Firefox allow _declarative_ user-origin CSS?** Firefox has
   `browser.contentScripts.register({ css, cssOrigin: "user" })`, which Chromium
   has no equivalent of. If it registers at `document_start`, Firefox may not
   need the veil at all — which would make §4's conclusion Chromium-specific
   rather than universal, and is worth knowing before the veil is simplified.

The test is the fixture and harness under this ADR's implementation story:
assert the §2.1 table, the §3.1 four-variant shadow matrix, and the §3.2 canvas
specificity case, on both engines.

---

## 7. Sequencing

1. Border-led E in `swatches/index.ts` + `Φ_comfort` restated over the new
   hierarchy (contrast is now a property of the swatch — §2.3).
2. The enforcement sheet and its injection path, behind a flag, alongside the
   existing pipeline. Tests per §3.2 and §3.1 from the first commit.
3. Firefox parity (§6). Gate further deletion on the result.
4. Smallest end-to-end slice on one real site the user exercises; eye-strain
   judgement before any deletion lands.
5. Delete §5.1 in dependency order, shadow stack untouched.
6. Simplify the veil (§4) last, once enforcement is confirmed on both engines.

Steps 1–4 are reversible behind the flag. Step 5 is not.

---

## 8. Amendments

Recorded after the review of this ADR (Codex, 2026-09-20, three findings, all
real) rather than rewritten into the sections above, so the measurements and
reasoning in §2–§7 stay as they were when taken.

### 8.1 §3.1 is reversed — user-origin rules do cross shadow boundaries

The four-variant measurement in §3.1 did not replicate through the real
extension surface (`chrome.scripting.insertCSS({ origin: "USER" })` from a real
MV3 service worker): a user-origin `!important` rule overrides explicit,
`!important`, non-inherited declarations inside open and closed shadow roots,
on both Blink and Gecko. ADR 0003 records the eight-cell measurement and the
decision that follows (embrace global crossing; the shadow stack's retention
in §5.2 becomes conditional). The review finding that a constant
`adoptedStyleSheets` sheet could not outrank vendor `!important` inside a
shadow root was correct about author-origin adopted sheets, and is moot under
ADR 0003: the mechanism inside a shadow root is the same user-origin sheet, not
an adopted one.

### 8.2 §2.2 erases generated content too

`*` never matches a pseudo-element, so the snippet in §2.2 left a vendor's
`::before`/`::after` boxes — a fixed white `html::before` overlay, a light card
drawn on a pseudo — painting as authored on top of the erased canvas. The
enforcement sheet applies the same four declarations to
`:where(*:not([data-my-ext]))::before, …::after` (#1463, `2944993`), with a
unit case pinning the rule and an e2e case asserting a white `html::before`
reads transparent under the live sheet.

The same commit replaced the sheet's `[data-my-ext] { all: revert !important }`
exclusion with `:not([data-my-ext])` on the erase rule: at the user origin,
`revert` rolls the cascade back to the user-agent origin, which stripped
`prepaint.css`'s author styling from the veil.

### 8.3 §2.1 — transitions outrank every `!important` origin (open)

CSS transition declarations sit above all `!important` origins in the cascade.
On an element with an authored `transition: background-color 2s`, inserting the
sheet starts a 2 s interpolation from the vendor's colour to E, during which
the vendor's colour is what paints — after enforcement is "applied", and after
a naive confirmation read. The classifier pipeline handled the same hazard with
`withPrepaintSuppressed`'s transition freeze; the sheet has no policy yet.

Not a change to the mechanism, but a constraint on the handoff: the veil must
not be released on the strength of the sheet being inserted alone. The policy
(a transition/animation freeze held from before the injection request until
the confirmation read and one painted frame after it, removed afterwards so
steady-state vendor transitions are untouched) and its e2e fixture are
specified in #1489 (SF-CUT3), which owns the veil handshake.

### 8.4 Second review round — the sheet's remaining paint surfaces

Six further findings (Codex, round 2), all real. Two are fixed on the
implementation PR (#1463): the canvas rule carries `filter: none !important`
on `html`/`body` (`ccb4f03`), so a vendor's root-level invert
(`filter-invert-vendor-page.html`) no longer composites E back to light, and
the same reset is on both erase rules — every non-media element and its
`::before`/`::after` (`8af1643`) — so a filter on a descendant group
(`PG-GROUP-FILTER` in the paint grammar) cannot post-process the tokens
inside it either; and
`insertCSS` targets `allFrames: true`, reaching every frame that exists at the
injection event — late-created frames and a per-frame veil are #1489's
per-document request. The other four are tracked in #1497 and must land
before #1492's eye-strain run judges fidelity:

- `-webkit-text-fill-color` fills glyphs regardless of `color`; the sheet
  declares `currentColor` for it.
- `box-shadow` can paint a complete surface (`inset 0 0 0 9999px white`,
  `PG-BG-INSET-SHADOW` in the paint grammar); the sheet resets it
  (`8af1643`), which adds vendor elevation shadows to §5.4's fidelity cost.
- Painting pseudo-elements beyond `::before`/`::after`: `::backdrop` is
  imposed dark rather than erased (`8af1643`); `::marker`, `::first-letter`,
  `::first-line`, `::file-selector-button` remain open.
- Descendants of extension-owned elements are excluded by selector
  (`:not([data-my-ext] *)`), the same contract `EXT_GUARD` already states,
  subject to #1488's cost measurement.

Round 2 on the landing PR (#1500) added two more independent channels to both
erase rules: `text-shadow` is erased (a white zero-blur text-shadow keeps
glyphs white under an enforced `color`), and `outline-color` is imposed with
`borderStrong` the way `border-color` is — width and style stay the vendor's,
so focus rings keep their shape.

One consequence of §8.1 surfaced while porting the `::placeholder` rule:
Chromium implements the placeholder as a real element inside the control's UA
shadow tree, so the erase rule's `color` reaches it and outranks a bare
`(0,0,1)` `::placeholder` rule. The ported rule therefore carries `EXT_GUARD`
too, which is the only reason it wins (live-measured on #1500).
