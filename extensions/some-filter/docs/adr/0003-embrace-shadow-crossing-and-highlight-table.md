# ADR 0003 — Embrace user-origin shadow crossing; replace flat erasure with a compile-time highlight table

- **Status:** Proposed
- **Date:** 2026-09-19
- **Supersedes:** ADR 0002 §3.1 (measurement reversed), §5.1/§5.2 (shadow-stack retention — reversed, conditionally), §2.3 (semantic-surface vocabulary — generalized)
- **Reference:** measurements below were taken against Chromium 1194 (the same
  revision ADR 0002 itself measured against) and a live Firefox instance, both
  running the real `some-filter` MV3 extension via `chrome.scripting.insertCSS`/
  `browser.scripting.insertCSS`.

---

## 1. Context

ADR 0002 §3.1 measured that a user-origin `!important` rule does not cross a
shadow boundary, and §5.2 built the whole "retain the shadow stack untouched"
decision on that measurement. `docs/adr/0002-user-origin-palette-enforcement.md`
and its implementation (`src/adapter/enforcement-sheet.ts`, landed behind a
flag in #1463) found the opposite the moment it was tested for real: the
erase rule overrides explicit, `!important`, non-inherited declarations
_inside_ an open shadow root.

That finding has since been independently reproduced four separate ways,
summarized in §2 below. This ADR records the decision that follows from it:
stop treating shadow crossing as a bug to route around, and use it as the
mechanism — with two conditions attached, because the evidence, while now
strong, is not a specification guarantee.

## 2. Decision, part 1 — embrace global crossing

### 2.1 What was measured

| Variant                                                    | Chromium 1194 | Firefox (live, version unrecorded) |
| ---------------------------------------------------------- | ------------- | ---------------------------------- |
| Open shadow root, inline `!important` style                | crosses       | crosses                            |
| Open shadow root, `adoptedStyleSheets` `!important` rule   | crosses       | crosses                            |
| Closed shadow root, inline `!important` style              | crosses       | crosses                            |
| Closed shadow root, `adoptedStyleSheets` `!important` rule | crosses       | crosses                            |

All eight cells: both `background-color` (non-inherited) and `color`
(inherited) were overridden by the enforcement sheet, matching the enforced
swatch exactly, not the shadow-internal element's own explicit declaration.
Also independently confirmed on a live production page (github.com, real
`<relative-time>`/`<tool-tip>`/`<include-fragment>` shadow-hosted
components), with the tab explicitly cycled to `"off"` first to rule out the
existing shadow-scope-theming pipeline (which legitimately themes shadow
roots via its own `adoptedStyleSheets` mechanism) as a confound.

### 2.2 What this is not

This is not confirmed as specification-guaranteed behavior. A search for
authoritative documentation of "the CSS `user` origin pierces shadow
boundaries" found none. What it did find:

- Chrome's own documentation states plainly that shadow DOM / CSS
  interoperability is "inconsistent... between features in the same browser,
  across browsers, and between the features and the specification"
  ([Chrome for Developers][css-names]).
- A live, filed bug — [w3c/webextensions#906][insertcss-bug] — confirms
  `chrome.scripting.insertCSS`'s `origin` handling has at least one other
  known defect (`"author"` origin landing at the `"user"` cascade position).
  This doesn't implicate the specific behavior measured here, but it is
  evidence that this exact API's origin plumbing is not airtight in Chrome.

Two independently-developed engines (Blink and Gecko) agreeing across eight
variants is meaningfully stronger evidence than either alone — an accidental,
convergent implementation quirk in two unrelated codebases is a much less
likely explanation than a deliberate (if under-documented) design choice for
the "user" origin. But "we could not find it contradicted" is not the same
claim as "we found it guaranteed," and this ADR does not claim the latter.

[css-names]: https://developer.chrome.com/docs/css-ui/css-names
[insertcss-bug]: https://github.com/w3c/webextensions/issues/906

### 2.3 The decision

Treat global crossing — light DOM and shadow DOM alike, one static sheet, no
special-casing — as the intended mechanism, superseding ADR 0002 §5.2's
"retain the entire shadow stack untouched."

**Condition, binding on every future change to this area:**
`tests/e2e/specs/adr0002-enforcement-sheet.spec.ts`'s shadow-crossing case
(currently named `(KNOWN DIVERGENCE)`, asserting the _current_, crossing
behavior) must stay in the suite permanently, including after any deletion
under §3 below — renamed to drop "KNOWN DIVERGENCE" once this ADR is
accepted, but never deleted. This is the only thing standing between "an
engine update changes this" and "every shadow-hosted component on every site
silently reverts to native colors with nothing in the codebase left to
notice or fall back to." A canary that stays red is a contained, loud
failure; a canary that was deleted is a silent one, and silent regressions
are exactly what ADR 0002 §1.1 diagnosed as the original pipeline's own
disease.

## 3. Decision, part 2 — a compile-time highlight table, not flat erasure

ADR 0002 §2.3 already conceded flat erasure risks a "flat hierarchy on div
soup" and named it an unmeasured risk (§5.4). §2's own live testing (the
border-width finding, #1463's second commit) already showed one instance of
this: `borderStrong`'s color was correct but invisible with no width to
render through. The same _class_ of gap exists for content, not just
borders: `enforcement-sheet.ts`'s `ERASE_SELECTOR` currently paints every
element the same flat `text0`, discarding distinctions the _existing_,
shipped pipeline (`theme-apply.ts`'s `DARK_THEME_BODY_RULES`) already makes
and has already shipped without incident.

The fix is the same idea `SEMANTIC_SURFACES` already applies to
`background-color`, generalized to every property a compile-time,
no-DOM-reads table can reasonably own — an IDE syntax-highlighter's
token-to-color grammar, not a page-reading classifier. Proposed
`HIGHLIGHT_TABLE`, each row tagged by provenance:

| Selector                                                            | Property → token                            | Provenance                       |
| ------------------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| `h1`–`h6`                                                           | `color` → `text0`                           | ported (`DARK_THEME_BODY_RULES`) |
| `p, span, label, caption, figcaption, blockquote, cite, li, dt, dd` | `color` → `text1`                           | ported                           |
| `small, sub, sup, abbr, time`                                       | `color` → `text2`                           | ported                           |
| `a` / `a:visited`                                                   | `color` → `link` / `linkVisited`            | ported                           |
| `code, kbd, samp`                                                   | `background` → `bg3`, `color` → `codeFg`    | ported                           |
| `pre`                                                               | `background` → `bg2`, `color` → `text0`     | ported                           |
| `input::placeholder, textarea::placeholder`                         | `color` → `text2`                           | ported                           |
| `::selection`                                                       | `background` → `selectionBg`                | ported                           |
| `dialog, [popover]`, `[role=dialog\|menu\|listbox\|tooltip]`        | `background` → `surface`                    | existing (#1463)                 |
| `input, textarea, select, button`                                   | `background` → `inputBg`                    | existing (#1463)                 |
| `th, thead`                                                         | `background` → `bg2`                        | existing (#1463)                 |
| `nav, header, aside`                                                | `background` → `bg1`                        | existing (#1463)                 |
| `input, textarea, select`                                           | `accent-color` → `link`                     | **new**                          |
| `svg *`                                                             | `fill`/`stroke` → `currentColor !important` | **new — see §3.1**               |

### 3.1 The icon row is the one genuinely new cost

Every other new/ported row is additive with no downside — it replaces "no
opinion, inherits from ambient text color" with a more specific, still-safe
opinion. The `svg *` row is different in kind: it is strictly more
aggressive than anything shipped today (the existing pipeline touches only
`svg text`/`svg tspan`, never shape fills), and it will flatten intentional
multi-color SVG content — brand logos, status-colored icon states — to a
single color, the same class of accepted, blunt trade-off
`background-image: none` (§3.5) already is for CSS-background icons. Not a
gap to silently fix; a cost to accept on the same "temu, not pixel-perfect"
terms the rest of this architecture already runs on. Flagged here rather
than folded into the "ported" rows above so it gets its own sign-off, not a
free ride on the others' precedent.

## 4. Consequences

### 4.1 Unblocked, conditionally

§5's original deletion list becomes reachable in principle — the shadow
stack's retention was the one hard blocker §5.2 named, and it no longer
holds. This ADR does **not** itself authorize deleting
`shadow-scope-theming.ts`/`shadow-actuator.ts`/`scope-registry.ts` et al.
ADR 0002 §7 step 4 (eye-strain validation on real sites) has not run, and
this document does not substitute for it — a technically-sound mechanism
that looks bad in practice is still a reason not to ship it. Deletion stays
gated on: this ADR being accepted, step 4 completing, and the canary test
(§2.3 above) staying in the suite.

### 4.2 Risk retained, not eliminated

§2.2's caveat stands: this is strong empirical evidence, not a spec
guarantee. Re-verify after any Chromium or Firefox version bump this
project's CI or documented dev environment moves to, not just once at
adoption time.

## 5. Open

- ADR 0002 §6's Firefox parity question is now substantially answered for
  the mechanism itself (manual test, #1463) and for shadow crossing
  specifically (§2.1 above) — both manual, neither in this sandbox's
  automated e2e suite (no Firefox binary available here; see `CLAUDE.md`).
  Automating the Firefox side, even manually-triggered, would close this
  gap properly rather than leaving it as chat-relayed console output.
- `HIGHLIGHT_TABLE`'s new rows (`accent-color`, `svg *`) are proposed, not
  yet implemented or tested against a real page. §3.1's cost should be seen
  live before landing, not just reasoned about.
