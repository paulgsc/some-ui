import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"
import someUIEslint from "maishatu-eslint-kit"
import tseslint from "typescript-eslint"

const inputConfig = [
  ...someUIEslint,
  // vitest-shims/*.ts re-export real source from sibling packages purely
  // for Vite's runtime module resolution (see the files themselves) and
  // are deliberately outside tsconfig.json's `include` so their
  // cross-package relative imports don't trip tsc's rootDir check. Same
  // "not found by project service" shape as vitest.config.ts above —
  // disable type-aware parsing instead of adding them to the tsc project.
  {
    files: ["vitest-shims/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    settings: {
      // Workspace packages this input package imports (some-ui-shared,
      // some-ui-utils, @some-ui/slideshow, and the wasm-bindgen crates) ship
      // dist output that only exists after a build. tsconfig.eslint.json
      // maps those specifiers to source/stubs so ESLint can resolve them
      // without requiring a build — kept out of tsconfig.json so it has no
      // effect on the real tsc project (rootDir/include membership).
      //
      // Overrides the base config's `import-x/resolver-next` entirely
      // (settings merge per-key, and resolver-next always wins over the
      // legacy `resolver` key if both are present) — so this package's own
      // tsconfig.json still needs its own resolver instance here too, not
      // just the tsconfig.eslint.json one.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
        createTypeScriptImportResolver({
          project: "./tsconfig.eslint.json",
          alwaysTryTypes: true,
        }),
      ],
    },
  },
]

export default inputConfig
