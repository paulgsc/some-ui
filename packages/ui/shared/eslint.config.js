import {
  compiledPackageStyleImportBanPattern,
  reactImportBanSelectors,
  routerDynamicImportSelectors,
  routerImportBanPattern,
  themeProviderBanPattern,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,
  {
    // This package ships raw TS source (package.json "main"/"exports" point
    // straight at src/index.ts - there's no build step of its own). Every
    // consumer's bundler processes these files as part of its OWN module
    // graph, so a self-alias would need every consumer's tsconfig/vite
    // config to know about it too - unlike a vite-built package (fetch-kit,
    // speech, ws, activity-catalog) where the alias is resolved away by
    // `vite build` before the dist ships. Until this package has a build
    // step of its own, "../" stays the only import form its own internals
    // can safely use. Blanket safety net for every file base.config.ts's
    // rule reaches (stories/test/spec .ts/.tsx, plus .js/.mjs/.jsx); the
    // block below narrows this back on for the one subset that also needs
    // to keep a different check alive.
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // theme-protocol.config.ts's own no-restricted-imports (the theme-
    // provider, style-import, and router bans - uiRecommended's whole point
    // for this package) applies to exactly this files/ignores combination,
    // and flat config replaces a rule's value wholesale - so without
    // restating all three here, the blanket "off" above would silently
    // re-permit importing an app's theme provider, a sibling package's
    // compiled style.css, or a router from this reusable-UI package too.
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "**/*.stories.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            themeProviderBanPattern,
            compiledPackageStyleImportBanPattern,
            routerImportBanPattern,
          ],
        },
      ],
    },
  },
  {
    // Same "raw source, no self-alias" reasoning as the no-restricted-imports
    // override above, applied to the dynamic-import half of the rule
    // (react.config.ts's no-restricted-syntax - see its own doc comment for
    // why it lives there). Redeclares the React-import-ban selectors and the
    // router-dynamic-import ban instead of dropping them: flat config
    // replaces this rule's value wholesale, so omitting them would silently
    // disable those unrelated checks too.
    // parentRelativeDynamicImportSelectors is deliberately NOT restated here
    // - the "off" override above exists precisely because this raw-source
    // package's own internals must keep using "../", and that reasoning
    // applies to the dynamic form too.
    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...reactImportBanSelectors,
        ...routerDynamicImportSelectors,
      ],
    },
  },
])
