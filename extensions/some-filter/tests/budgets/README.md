# Performance budgets — the browser-unresponsive guard

These suites exist to block one specific outcome: the **browser's own
kill switch**. Chromium's "Page unresponsive — you can wait for it to become
responsive or exit the page" dialog, and its softer sibling "this page is
slowing down your browser", are not performance feedback. They are the
browser telling the user that a tab is beyond saving, and on a page this
extension injected into, they are attributed to the extension.

Reaching that dialog is a **compile-time defect**, not a runtime accident.
Every selector in the enforcement sheet and every traversal in the
classifier is code in this repository, fixed before the extension is ever
loaded. If shipped code can hang a tab, the hang was authored. So a red
check in this directory is a release blocker with no "we'll look at it
after" branch — it is the CI equivalent of a crash, and
`.github/workflows/_extension-verify.yml` runs it as its own named step,
ordered ahead of the general test run, for exactly that reason.

## Why an extension has to hold a harder line than a page does

An ordinary web app controls its own DOM. A content script does not. This
extension declares `<all_urls>` host permissions and injects at the CSS
**user origin**, so both its halves run against documents nobody here chose
and nobody here can bound:

- GitHub's pull-request **"Files changed"** view renders N changed files,
  each with M diff rows — a 60-file pull request touching 400 lines a file
  lands north of 100,000 elements, and it streams more in as you scroll.
- Neither N nor M is a number this repo picks. They are whatever the pull
  request happens to contain.

A cost that is "fine on most pages" and linear in document size is
therefore not a tuning problem. It is a page-supplied multiplier on work
this extension performs synchronously on the main thread.

## The four layers, and what each one can and cannot see

| Layer                    | Where                                            | Catches                                                             | Blind to                   |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------- | -------------------------- |
| Stylelint                | `.stylelintrc.mjs` → `extensions/*/public/*.css` | Hazardous selectors in **hand-written** injected CSS                | Anything built as a string |
| Selector cost budget     | `enforcement-css-budget.test.ts`                 | Hazardous selectors in the **generated** enforcement sheet          | Imperative work            |
| Traversal source budget  | `traversal-source-budget.test.ts`                | Unbudgeted traversal **shapes**, on any code path, exercised or not | Costs one call frame away  |
| Traversal runtime budget | `classifier-traversal-budget.test.ts`            | What the exercised paths **actually cost**, measured                | Paths no test drives       |

The two CSS layers are split because the sheet that matters is built by
string concatenation in `adapter/enforcement-sheet.ts` and is never a
`.css` file, so stylelint structurally cannot see it —
`selector-cost.ts` is a real CSS parse plus an explicit cost model standing
in for it. The two JS layers are split for the mirror-image reason: the
source scan is lexical and misses a style read one frame away from the loop
that drives it, while the runtime budget measures precisely that but only
for paths a test exercises. Neither pair subsumes the other.

## Reading a failure

Every assertion carries its measurement in the message, including a
projection onto a realistic "Files changed" page. A failure should tell you
what the cost is, what sets it, and what would bring it back under budget —
if one doesn't, that is a bug in the assertion message, not something to
work around.

## Changing a budget

The numbers are derived, not chosen by taste, and each derivation is written
down next to it:

- `MAX_NODES_PER_TASK` comes from the 50ms long-task threshold, discounted
  for the fact that per-element work here is several `getComputedStyle`
  calls rather than one cheap read.
- `MAX_SELECTOR_COST` is calibrated so any single driver-1 or driver-3
  hazard (see `selector-cost.ts`) exceeds it alone, while the shipped
  `:where(<tags>)${EXT_GUARD}` idiom fits under it — and a dedicated case
  pins that headroom so it cannot be spent silently.
- `SUBLINEAR_GROWTH_FACTOR` depends on no calibration at all: it doubles the
  document and asserts the work does not double. Any bounded traversal
  passes it; nothing linear in document size can.

Raising a number to make a suite green is the failure mode these budgets
exist to prevent. If a budget is genuinely wrong, change the derivation and
say why in the same diff.
