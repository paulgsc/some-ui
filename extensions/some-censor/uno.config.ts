import { defineSomeUiConfig } from "@some-ui/styles/config"

/**
 * UnoCSS config for the `some-censor` extension.
 *
 * some-censor is a content-script surface with an unusual constraint: its UI is
 * injected *into* YouTube's own cards, not into a shadow root, because the veil
 * has to inherit each card's border radius and occupy its exact box. So the
 * generated stylesheet ships into a hostile cascade and must stay as small and
 * as specific as possible.
 *
 * ## Why the content scan is a two-file allowlist, not `src/**\/*.ts`
 *
 * The sibling extensions scan all of `src` and then carry a ~20-entry
 * `blocklist` to undo it — scanning raw TypeScript harvests every bare
 * identifier that happens to collide with a utility or shortcut (`container`,
 * `grid`, `label`, `text`, `fixed`, …), so the stylesheet fills with rules
 * nothing authored. That blocklist is a denylist against the language itself:
 * it has to grow every time someone names a variable `panel`.
 *
 * Here every class string the extension can put in the DOM lives in exactly one
 * module — `src/lib/content/veil-styles.ts` — and `dom-handle.ts` may only
 * consume it. Scanning that one file plus the irreducible raw CSS makes the
 * output exactly the set of utilities the veil declares, with no denylist and
 * no bare-identifier noise. The narrow scan is also what keeps the idiom
 * honest: a class name written anywhere else simply will not be generated, so
 * "styles live in veil-styles.ts" is enforced by the build rather than by
 * review.
 *
 * preflight: off. A content script must not ship a global reset — it would
 * repaint YouTube. Disabled both here and via the CLI's `--no-preflights` flag
 * that `emitUnocss({ preflights: false })` passes.
 */
export default defineSomeUiConfig(
  { preflight: false },
  {
    content: {
      filesystem: ["src/lib/content/veil-styles.ts", "src/styles/content.css"],
    },
  }
)
