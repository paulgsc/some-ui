/**
 * At most the enum — per S4/#944's own acceptance criterion, `intent-kit`
 * "gains at most the presentation enum, and nothing that knows how anything
 * is rendered." What each mode *permits*, what surface an ambient failure
 * gets, and the advisory-vs-enforced decision all live in
 * `apps/www/src/lib/intent/presentation.ts`, because all of that has an
 * opinion about a design system this package must not know exists.
 *
 * Three values, not two. #934's census found one producer — the debounced
 * layout autosave (`components/player/use-live-layout-editor.ts:64,81,112`)
 * — that a two-way interactive/ambient split cannot express honestly: the
 * person did not ask for the save, so interrupting them is wrong
 * (ambient), but a silent failure loses arrangement work they just
 * authored, which plain "ambient" would allow (see the census's own
 * `layout-autosave` row and its justification). `"ambient-durable"` names
 * that third case: progress may still be quiet, but a failure must survive
 * the tab — it cannot resolve to nothing the way a pure `"ambient"`
 * failure is allowed to.
 */
export type IntentPresentation = "interactive" | "ambient" | "ambient-durable"
