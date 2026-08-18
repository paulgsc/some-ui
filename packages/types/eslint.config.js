import someUIEslint, { reactImportBanSelectors } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...someUIEslint,
  {
    // This package ships raw TS source (package.json "main"/"exports" point
    // straight at src/index.ts - there's no build step of its own). Every
    // consumer's bundler processes these files as part of its OWN module
    // graph, so a self-alias would need every consumer's tsconfig/vite
    // config to know about it too - unlike a vite-built package (fetch-kit,
    // speech, ws, activity-catalog) where the alias is resolved away by
    // `vite build` before the dist ships. ("@types/*" is also already the
    // real npm scope for DefinitelyTyped packages, so it isn't even a safe
    // name to claim here.) Until this package has a build step of its own,
    // "../" stays the only import form its own internals can safely use.
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Same "raw source, no self-alias" reasoning as the no-restricted-imports
    // override above, applied to the dynamic-import half of the rule
    // (react.config.ts's no-restricted-syntax - see its own doc comment for
    // why it lives there). Redeclares the React-import-ban selectors instead
    // of dropping them: flat config replaces this rule's value wholesale, so
    // omitting them would silently disable that unrelated check too.
    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...reactImportBanSelectors],
    },
  },
])
