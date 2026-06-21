# ADR 0001 — Dark-mode pipeline rework: overlay prepaint + always-on theme with detector

- **Status:** Proposed
- **Date:** 2026-06-21
- **Epic:** #231
- **Supersedes:** none
- **Reference:** [DarkReader](https://github.com/darkreader/darkreader) (MIT)

---

## 1. Context

`some-filter` applies a dark theme to arbitrary web pages. Today it runs three
tab states (`src/types/tab.ts`):

- **`auto`** — classify the page; if it reads "light", inject our dark theme and
  patch element backgrounds; otherwise leave the page native.
- **`legacy`** — a single global root filter
  (`html { filter: invert(1) hue-rotate(180deg) … }`, `src/content/content.ts:47-64`).
- **`off`** — nothing.

Two investigations preceded this ADR and are the reason it exists:

### Finding 1 — `legacy` is structurally flash-immune; `auto` is not

`legacy` is one declarative rule on the root element. It is synchronous, needs no
JavaScript, and inverts **any** DOM that exists or appears later — including
nodes a vendor re-render injects after load. It has no "catch-up" window.

`auto` darkens via a static CSS layer (`buildDarkThemeCSS`,
`src/lib/content/dark-theme.ts:55-198`) **plus** a JS luminance patcher driven by
a `MutationObserver` (`src/lib/content/dark-theme.ts:268-309`). The static layer
only covers html/body/semantic tags; arbitrary vendor `div`s with inline white
backgrounds must be tagged by the JS patcher **after** they paint. A random
vendor re-render therefore shows a white frame until the observer catches it —
the "flashbang".

### Finding 2 — classification currently must *drop the veil* to read truth

A document-start prepaint veil (`public/prepaint.css`, `public/prepaint-start.js`)
paints a dark substrate to hide the white-flash during load. It works by
**restyling the page's own elements** with `!important`
(`background-color: transparent/#0d1117 !important`, `filter: invert(...)`,
`public/prepaint.css:22-46`).

Because those `!important` declarations win the cascade, `getComputedStyle`
returns the veil's values, not the vendor's. So classification cannot read the
real page while the veil is up. `withPrepaintSuppressed`
(`src/lib/content/prepaint.ts:58-78`) works around this by **removing** the veil
attribute and forcing a layout flush before sampling — which is itself the
inherent source of the classification-time flash (the native white page is
briefly revealed so we can measure it).

> **Doc-drift note:** `extensions/some-filter/README.md` still documents a
> `#__sw_page_layer` wrapper that moved vendor DOM into a div. The code comments
> (`src/lib/content/classify.ts:15-19`, `dark-theme.ts:11-18`) state that wrapper
> was **removed** and vendor DOM is left in place, self-excluding extension nodes
> via `[data-my-ext]`. The README should be updated when the rework lands; called
> out here so it isn't mistaken for current architecture.

---

## 2. Reference study — DarkReader

DarkReader is **MIT-licensed**, so studying and adapting its code is permitted
with attribution (see §5).

### 2.1 High-level flow (dynamic theme)

From `src/inject/dynamic-theme/index.ts`:

1. Detect conflicting instances.
2. **Apply an immediate fallback dark style** (`getModifiedFallbackStyle`, strict
   mode) *before* analysis — prevents flash of light content.
3. Once `<head>` exists, `createOrUpdateDynamicTheme()` runs:
   - `createStaticStyleOverrides()` — base user-agent / text / inversion /
     variables styles.
   - `createDynamicStyleOverrides()` — per-stylesheet style managers that parse
     and rewrite author CSS.
   - `watchForUpdates()` — `MutationObserver` for new/changed styles, plus
     shadow-DOM and adopted-stylesheet handling.
4. `removeDynamicTheme()` — comprehensive teardown.

**Key insight:** DarkReader **applies first, refines after.** It does **not**
classify "is this page already dark?" — it themes universally based on user
settings and per-site *fixes* (CSS overrides selected by URL). It has **no
already-dark detector.**

### 2.2 Module mapping — DarkReader → ours

| DarkReader (`src/inject/dynamic-theme/`) | Responsibility | Our counterpart |
|---|---|---|
| `index.ts` | Orchestration / lifecycle | `src/content/content.ts` |
| `getModifiedFallbackStyle()` (immediate) | Anti-flash substrate before analysis | `public/prepaint.*` (veil) |
| `createStaticStyleOverrides()` | Base dark CSS (ua/text/vars) | `buildDarkThemeCSS()` (`dark-theme.ts`) |
| `style-manager.ts` / `stylesheet-modifier.ts` / `css-rules.ts` | Parse & rewrite author stylesheets | *(none — we patch elements, not rules)* |
| `modify-colors.ts` / `palette.ts` | HSL color transformation | naive `invert()` + `data-sw-patched` luminance buckets |
| `image.ts` | Per-image invert decision | blanket `invert(1) hue-rotate` / `filter:none` |
| `variables.ts` | Author CSS custom properties | *(none)* |
| `watch/` | Mutation observer for dynamic content | `startPatchObserver` (`dark-theme.ts:281-309`) |
| `inline-style.ts` | Inline `style=""` attrs | partial (observer watches `style` attr) |
| `removeDynamicTheme()` | Teardown | `removeDarkTheme()` (`dark-theme.ts:340-348`) |

**Conclusion: our architecture is the same shape** (static overrides + dynamic
observer + teardown). We are not structurally behind; the gaps are (a) the
flash-prone *flow order*, (b) prepaint poisoning measurement, and (c) crude
color/image heuristics.

### 2.3 Heuristics worth borrowing

- **HSL color modification** (`modify-colors.ts` + `palette.ts`): RGB→HSL, scale
  *lightness* toward dark "poles" while preserving hue/saturation, with separate
  curves for background (lightness ~0.5–1 → 0–0.4), foreground (lift to ≥~0.55),
  and border (mid tones). Neutral/low-sat colors snap toward pole colors; results
  cached. This is materially better than our blanket invert + three luminance
  buckets, especially for links, accents, and code blocks.
- **Image analysis** (`image.ts`): `getImageDetails` samples a ≤32×32 scaled copy
  and classifies `isDark` / `isLight` / `isTransparent` / `isLarge` via pixel
  lightness thresholds (dark <0.4, light >0.7; ~70% ratios), then inverts only
  the images that benefit (e.g. dark line-art icons) and leaves photos alone.
  We currently invert all media in `legacy` and force `filter:none` in `auto` —
  both crude.
- **CSS variable handling** (`variables.ts`): adjust author custom properties so
  themed values cascade naturally instead of overriding element-by-element.

---

## 3. Decision

Rework the pipeline along four axes. (Each is its own sub-issue; this ADR records
the rationale and the seams.)

### (a) Overlay prepaint that does not touch vendor DOM — #234

Render the veil as a **separate dark layer painted over the page in the top
layer** (popover API / `dialog::backdrop` / max-z fixed node), `pointer-events:
none`, marked `[data-my-ext]`. Because the overlay is **not an ancestor** of
vendor nodes, their computed styles stay intact and the detector can read true
vendor colors **while the veil is still up** — eliminating the need for
`withPrepaintSuppressed` to drop the veil before sampling (Finding 2).

Trade-off: an opaque cover can only show a **flat dark fill**, not the
`invert(1) hue-rotate` *preview* (invert requires restyling real elements). We
accept this — readable truth + continuous dark is worth more than an inverted
preview during the sub-second pre-theme window. Must use the real top layer; a
plain high-z `div` can be painted over by vendor stacking contexts.

### (b) Invert the control flow: apply-then-detect — #235

Adopt DarkReader's order. Instead of *classify → maybe apply*:

1. Apply the dark theme immediately (always-on), under the overlay veil.
2. Run the detector against true vendor styles (readable thanks to (a)).
3. If the page is **already dark** → restore vendor; else keep the theme.
4. Remove the veil **last** (atomic swap, no native frame).

This is DarkReader's "apply first, refine after" — **plus** an already-dark
restore branch that DarkReader does not have. We stay dark continuously and the
only remaining flash is a *purposeful* user toggle into a re-classify, never a
random re-render.

### (c) Split concerns — #233

- **`theme-apply`** module: `applyTheme()` / `restoreVendor()` — owns the dark CSS
  injection, the luminance patcher + observer lifecycle, and the legacy filter.
- **`theme-detector`** module: `detect(): { alreadyDark, … }` — pure measurement,
  no DOM mutation.
- `content.ts` shrinks to a state machine + message wiring.

This is the **novel part relative to DarkReader** — the already-dark detector is
ours to design (#236), since DarkReader has no equivalent.

### (d) Adopt DarkReader heuristics — #238

Land the HSL color-modification path first (biggest happy-path win), then image
analysis, then CSS-variable handling. Each as its own PR with before/after
fixtures.

### Adopt / skip summary

| DarkReader idea | Decision |
|---|---|
| Apply-first-then-refine flow | **Adopt** — (b) |
| Immediate fallback as overlay (not element restyle) | **Adopt (adapted)** — (a) |
| HSL color modification (`modify-colors`/`palette`) | **Adopt** — (d), first |
| Image pixel analysis for invert decision | **Adopt** — (d), second |
| CSS variable adjustment | **Adopt** — (d), third |
| Full stylesheet parsing/rewriting (`style-manager`) | **Skip for now** — large; our element-patching is good enough post-(d) |
| Per-site fixes config | **Skip** — out of scope |
| Already-dark detector | **Net-new (ours)** — (c)/#236; no DarkReader reference exists |

---

## 4. Consequences

**Positive**

- Random-re-render flashbang eliminated: theme is on by default and the overlay
  veil no longer poisons measurement.
- Cleaner seams (`theme-apply` / `theme-detector`) make the heuristics work
  testable in isolation.
- Happy-path fidelity improves with HSL color/image heuristics.

**Costs / risks**

- Flipping the default to always-apply collides with the background state model
  (`enabled`/`filteredTabIds` treats `legacy` as explicit opt-in; the cycle map is
  duplicated in `src/content/content.ts:140-144` and
  `src/background/background.ts:169-173`). Tracked in **#237** so the flow change
  does not regress into more flashbangs.
- Overlay veil loses the inverted preview (accepted above).
- HSL modification + image analysis add CPU per page; mitigate with caching as
  DarkReader does.

---

## 5. License & attribution

DarkReader is distributed under the **MIT License**. Adapting its algorithms is
permitted provided we retain the copyright notice and license text for any
code derived from it. When code is ported (e.g. `modify-colors` logic in #238),
include a header crediting DarkReader and a copy of its MIT notice under
`extensions/some-filter/docs/third-party/` (or equivalent). Conceptual reference
(this ADR) needs no notice; ported source does.

---

## 6. Sequencing

```
#232 (this ADR) ──┐
                  ├─► #233 split ──┐
#234 overlay ─────┘                ├─► #235 apply-then-detect ─► #237 bg reconcile
                  └─► #236 detector ┘
#238 heuristics (trails; depends on #233)
```

Critical path: **#233 + #234 → #235 / #236 → #237.** #238 trails as polish.
