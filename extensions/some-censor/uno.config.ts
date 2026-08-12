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
 * consume it. Scanning that one file plus the irreducible raw CSS keeps the
 * output to the utilities the veil actually declares. The narrow scan is also
 * what keeps the idiom honest: a class name written anywhere else simply will
 * not be generated, so "styles live in veil-styles.ts" is enforced by the build
 * rather than by review.
 *
 * ## Why there is still a two-entry blocklist
 *
 * `styles/content.css` has to be scanned as well as concatenated, and the
 * scanner reads its *prose* along with its rules. The words "card" and
 * "container" appear in the comments explaining the pre-mask occluder, and both
 * are shortcuts in the some-ui preset — so the build emitted `.card` and
 * `.container` rules referencing `--card`, `--card-foreground`, `--border` and
 * `--radius-lg`, none of which a preflight-less sheet defines. Dangling
 * `var()`s in a stylesheet that ships into YouTube.
 *
 * This is the same failure mode as the sibling blocklists, at 1/10th the size,
 * and it is bounded by the vocabulary of one comment block rather than by the
 * whole language. `styles.test.ts` regenerates the stylesheet from these exact
 * inputs and fails on any unbacked `var()`, so a third leak is caught by the
 * suite rather than by reading `dist/`.
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
    // Shortcut names that appear as ordinary English in content.css's comments.
    // See the note above — these are not authored classes.
    blocklist: ["card", "container"],
  }
)
