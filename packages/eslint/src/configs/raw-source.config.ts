import { defineConfig } from "eslint/config"

import { reactImportBanSelectors } from "./react.config.js"

/**
 * For a workspace that ships raw TS source with no build step of its own
 * (package.json "main"/"exports" point straight at src/). Every consumer's
 * bundler processes these files as part of its OWN module graph, so a
 * self-alias would need every consumer's tsconfig/vite config to know about
 * it too - unlike a vite-built package (fetch-kit, speech, activity-catalog)
 * where the alias is resolved away by `vite build` before the dist ships.
 * Until such a package has a build step of its own, "../" stays the only
 * import form its own internals can safely use.
 *
 * Spread after a preset (`rawSourceRecommended` is `maishatuRecommended`
 * plus this): it turns off base.config.ts's "../" ban, then restates the
 * dynamic-import half of the rule (react.config.ts's no-restricted-syntax)
 * without `parentRelativeDynamicImportSelectors`. The React-import-ban
 * selectors are redeclared, not dropped: flat config replaces this rule's
 * value wholesale, so omitting them would silently disable that unrelated
 * check too.
 */
export default defineConfig(
  {
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...reactImportBanSelectors],
    },
  }
)
