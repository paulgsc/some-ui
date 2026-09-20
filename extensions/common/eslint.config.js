import { extensionsRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...extensionsRecommended,
  {
    // src/budgets/ is test infrastructure, not extension runtime code. It is
    // the shared admission rule every extension's budget suite consumes, and
    // nothing in it is ever bundled into a content script or a worker — it
    // runs on the build machine, reading a built artifact off disk.
    //
    // It lives under src/ rather than tests/ because it is consumed *by other
    // packages* (`@some-extension/common/budgets`), and this package's export
    // map is rooted at src/; tests/ here is this package's own tests. Because
    // of that placement the base config treats it as library source and wants
    // typescript/@eslint/css-tree/vitest promoted to `dependencies`, which
    // would be the wrong signal entirely — it would make a compiler and a test
    // runner look like runtime dependencies of every extension that imports
    // this package.
    files: ["src/budgets/**/*.{ts,tsx,cts,mts}"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
])
