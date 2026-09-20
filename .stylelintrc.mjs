/*
 * This file contains code adapted from the Node.js website repository,
 * available at: https://github.com/nodejs/nodejs.org
 * The original code is licensed under the MIT License.
 */

// These are all the custom `@` (at) rules that we use within our custom PostCSS plugins
const CUSTOM_AT_RULES = [
  // Tailwind-specific at-rules
  "apply",
  "layer",
  "responsive",
  "screen",
  "tailwind",
  "variants",
  "variant",
  "utility",
  "theme",
  "custom-variant",
  "source",
  "plugin",
]

// Enforces certain selectors to be only in camelCase notation
// We use these for id selectors and classname selectors
// const ONLY_ALLOW_CAMEL_CASE_SELECTORS = [
//   /^(?:[a-z]+(?:[A-Z][a-z]*)*)$/,
//   { message: (s) => `Expected '${s}' to be in camelCase` },
// ]
//
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-order", "stylelint-selector-bem-pattern"],
  rules: {
    // Enforces Element Class Names to be camelCase
    "selector-class-pattern": null,
    // Enforces Element IDs to be camelCase
    "selector-id-pattern": null,
    // Allow Tailwind-based CSS Rules
    "at-rule-no-unknown": [true, { ignoreAtRules: CUSTOM_AT_RULES }],
    // Allow the Global CSS Selector
    "selector-pseudo-class-no-unknown": [
      true,
      { ignorePseudoClasses: ["global"] },
    ],
    // Enforces the order of the CSS properties to be in alphabetical order
    "order/properties-alphabetical-order": true,
    "no-descending-specificity": null,
    // Disables the Level-4 Media Queries; Since they're more exotic and less known
    "media-feature-range-notation": "prefix",
    // Adopts the import notation from `postcss-import`
    "import-notation": "string",
    // stylelint-config-standard turns this on, but it is wrong for this repo
    // on both counts.
    //
    // Correctness: the autofix only strips the prefix, it does not merge the
    // declaration with the unprefixed one that usually sits next to it. On
    // `.dc-title-pill` it turned
    //     backdrop-filter: var(--dc-blur);
    //     -webkit-backdrop-filter: var(--dc-blur);
    // into the same declaration twice.
    //
    // Coverage: the premise of the rule is that autoprefixer re-adds whatever
    // it removes. It does for background-clip, user-select and appearance, but
    // not for backdrop-filter — unprefixed backdrop-filter only shipped in
    // Safari 18, and `-webkit-backdrop-filter` is what makes every glass
    // surface in umag/makjang render on anything older. Deleting the twelve
    // hand-written prefixes still in the tree would be a silent visual
    // regression on Safari and iOS, not a cleanup.
    "property-no-vendor-prefix": null,
  },
  overrides: [
    {
      // CSS this repo injects into *other people's pages*.
      //
      // A browser extension's content-script CSS is matched against every
      // element of a document whose size nobody here chose — a GitHub "Files
      // changed" view for a large pull request is routinely north of 100,000
      // elements. A selector whose match or invalidation cost scales with
      // document size does not degrade gracefully there, it hangs the tab,
      // and it does so on every page the extension is enabled for rather
      // than on a page someone can be told to avoid.
      //
      // Scoped deliberately to page-injected sheets. The extension's own
      // popup and debug chrome (popup.css, debug.css) are fixed-size
      // documents this repo authors end to end; popup.css's `*, *::before,
      // *::after` reset is correct there and banning it would be noise.
      // extensions/some-filter/tests/budgets/ carries the same budget, with
      // the same reasoning, for the sheets built as TypeScript strings that
      // stylelint structurally cannot see.
      files: ["extensions/*/public/*.css"],
      rules: {
        // Every element in the document, on every style recalculation.
        "selector-max-universal": [
          0,
          {
            message:
              "Universal selectors match every element in the visited page's tree on every style recalculation — see extensions/some-filter/tests/budgets/selector-cost.ts. Constrain the subject instead.",
          },
        ],
        "selector-max-compound-selectors": [
          3,
          {
            message:
              "Each compound level is another per-candidate check on an unbounded candidate set. Keep injected selectors shallow.",
          },
        ],
        "selector-disallowed-list": [
          [
            // `*:not(...)` — filtering an unbounded candidate set is not the
            // same as constraining it; the subject is still every element.
            "/\\*\\s*:not/",
            // Sibling-counting pseudo-classes: an element's match result
            // depends on how many siblings it has, so one child insertion
            // re-evaluates the whole sibling list. A diff view streaming
            // files in turns each mutation into a tree-wide restyle.
            "/:(only-child|only-of-type|nth-child|nth-of-type|nth-last-child|nth-last-of-type)\\b/",
            // :has() invalidates on any mutation within its argument's reach.
            "/:has\\(/",
          ],
          {
            message:
              "This selector's cost scales with the visited page's size or mutation rate. See extensions/some-filter/tests/budgets/selector-cost.ts for the cost model; :first-child/:last-child are constant-time and are not banned.",
          },
        ],
      },
    },
  ],
}
