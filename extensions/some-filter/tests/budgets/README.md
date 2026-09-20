# The admission gate — blocking the browser's unresponsive kill switch

These suites exist to block one outcome: Chromium's **"Page unresponsive"**
dialog, and its softer sibling "this page is slowing down your browser".
Those are not performance feedback. They are the browser telling the user a
tab is beyond saving, and on a page this extension injected into, they are
attributed to the extension.

Reaching that dialog is a **compile-time defect**. Every selector in the
enforcement sheet and every traversal in the classifier is code in this
repository, fixed before the extension is ever loaded. If shipped code can
hang a tab, the hang was authored.

## What this directory claims

The claim is an _admission rule_, quantified over builds rather than over
pages:

> For any diff `D` producing bundle `B`, if CI admits `B`, then every
> page-affecting effect in `B` is declared, and no declared effect has a
> cost or retention class that scales with the visited page.

Note what that is **not**. It is not "we measured some pages and they were
fine." A passing measurement is corroboration; the rule is the thing that
holds for builds nobody has written yet.

### Why it is keyed on effects, not on functions

The first version of this directory recognised _this extension's current
implementation_: `scan`, `auditLegibility`, `createTreeWalker` spelled
inside a `while` loop in a file under `src/`. That reports the known-bad
head as red, and it is not a rule — it is a denylist with good manners.

Measured directly, by simulating a remediated baseline (both gates green)
and then applying reachable mutations in distinct locations:

| Mutation                                                             | src-lexical scan   | shipped-artifact rule |
| -------------------------------------------------------------------- | ------------------ | --------------------- |
| Unbounded walk in `public/prepaint-start.js` (ships, outside `src/`) | **green — missed** | red                   |
| Same walk as `for…of` over `querySelectorAll` (no `while`)           | **green — missed** | red                   |
| Aliased dynamic access `const d = document; d[name]`                 | **green — missed** | red                   |
| New primitive (`getElementsByTagName` + forced layout)               | **green — missed** | red                   |
| A fourth `createTreeWalker`                                          | red                | red                   |

One of five versus five of five. The difference is not strictness, it is
what the rule is keyed on: host property names survive bundling and
mangling, so `dist/content.js` is ground truth for what the browser will
actually be asked to do — including every imported workspace package, npm
dependency and generated string that a source scan cannot see.

Two mutations were dropped from that table because they were _correctly_
ignored: exported-but-uncalled code is tree-shaken and never ships, and
dead code cannot hang a page. Discovering that required a green control —
the first run of this experiment compared red-to-red and proved nothing.

## Where the rule lives

The rule is not some-filter's. It is `@some-extension/common/budgets`, and
it applies to any extension in this workspace — every one of them injects
into pages it does not control, so every one needs the same guarantee.

What lives _here_ is the only irreducibly some-filter-specific part:

| in `common`                                | in this directory                                         |
| ------------------------------------------ | --------------------------------------------------------- |
| the effect alphabet                        | `effect-ledger.ts` — what this extension ships, declared  |
| the bundle scanner                         | thin wiring: three arguments to `describeAdmissionGate`   |
| the four conditions                        | subjects: this extension's sheet, classifier, source tree |
| the CSS cost model, dense-document fixture |                                                           |

That split is itself the over-fitting test. If applying the rule to a second
extension ever required teaching `common` about a particular one, the rule
would have stopped being a rule. Checked by pointing it, unmodified and with
an empty ledger, at three extensions it had never seen:

| extension          | bundles derived from its own manifest     | effects found                                            |
| ------------------ | ----------------------------------------- | -------------------------------------------------------- |
| `some-censor`      | `background.js`, `content.js`             | 50, incl. `querySelector`, `matches`, `closest`          |
| `some-mujik`       | `background.js`, `content.js`             | 43, incl. `offsetWidth`, `scrollWidth`, `queueMicrotask` |
| `suspender-ledger` | `resume-veil.js`, `watch.js`, `worker.js` | 27, incl. `executeScript` ×3                             |

No change to `common` was needed for any of them. `suspender-ledger` is the
informative one: a completely different artifact shape, three bundles none
of which is named `content.js`, derived correctly because the bundle set
comes from the manifest rather than from a list. The effects found there
include several some-filter does not use at all, so the alphabet is not a
transcription of this extension's imports.

Those three are **not** wired up as consumers yet — only some-filter
declares a ledger. Adding one is a ledger plus three lines.

## The four conditions CI enforces

Over every page-facing bundle, where the set of such bundles is **derived
from the built manifest** rather than listed (so a new content script
cannot be admitted by omission):

1. **Closure.** Every alphabet occurrence has a ledger entry. No entry ⇒
   red. Any non-literal computed member access is counted as an
   unclassifiable effect.
2. **Ratchet.** Occurrence counts match the ledger. A new call site of an
   already-admitted primitive ⇒ red, and must be justified in a reviewable
   diff.
3. **Cost admission.** No effect declared `unbounded-per-dispatch`.
4. **Retention admission.** No effect declared `unbounded`.

Plus a **blindness check**: if the content bundle ever yields near-zero
occurrences, the scan has gone blind (a bundler change mangling host
property names) rather than the code having improved, and that fails
instead of passing vacuously.

## What is proved and what is declared

This is the part to read before trusting a green check.

**Mechanically excluded.** An effect entering the shipped bundle without a
declaration. A new call site appearing silently. An effect declared with a
page-scaling cost or retention class. A new page-facing bundle escaping
analysis. A selector whose subject matches every element, including the
functional-subject forms (`:where(.container *)`) an earlier cost model
admitted.

**Declared, not verified.** The cost and retention classes in
`effect-ledger.ts` are _assertions by the author_. Nothing currently
verifies at runtime that an effect marked `budgeted` bounds its work —
that needs a kernel enforcing a credit bound per dispatch, which this
extension does not yet have. **A wrong declaration is a lie this gate will
believe.** That residual trust is deliberately concentrated in one small,
heavily commented, reviewable file, and it is why every entry carries an
owner and a justification rather than just a class.

**Not proved at all.** That an admitted build cannot hang. Opaque browser
primitives (`getComputedStyle`'s forced style resolution, selector matching
and invalidation inside the engine) have engine-dependent cost and are
treated as axioms with declared bounds, not as measured constants. Style
work is not attributed to JS tasks, so `PerformanceObserver` long-task
measurement does not cover it. Firefox and Safari behaviour is untested —
CI runs Chromium only. Deliberate evasion by a committer is out of scope:
someone who can add obfuscated code can also edit the ledger.

## The other suites

`enforcement-css-budget.test.ts` analyses the generated user-origin sheet
with a real CSS parse and an explicit cost model (`selector-cost.ts`, which
documents its three cost drivers). `classifier-traversal-budget.test.ts`
measures what today's code actually costs — useful as a falsifier and as
evidence for the ledger's declarations, never as the admission rule.
`traversal-source-budget.test.ts` is retained as a _diagnostic_ with a
stated completeness limit; it is not the gate.

`perf-unresponsive-canary.spec.ts` measures real main-thread blocking in
real Chromium. It is a falsifier of the axioms above — it can show a
declared bound is false — and it can never discharge the static rule.

## Changing a budget

The numbers are derived, and each derivation sits next to it.
`SUBLINEAR_GROWTH_FACTOR` depends on no calibration at all: it doubles the
document and asserts the work does not double. Any bounded traversal passes
it; nothing linear in document size can.

Raising a number, relabelling a ledger entry, or deleting a case to reach
green is the failure mode this directory exists to prevent. If a budget is
genuinely wrong, change the derivation and say why in the same diff.
