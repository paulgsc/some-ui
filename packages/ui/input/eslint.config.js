import {
  structuralColorRatchet,
  switchLintConfig,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"
import tseslint from "typescript-eslint"

const inputConfig = [
  ...uiRecommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    settings: {
      // Workspace packages this input package imports (@some-ui/shared,
      // some-ui-utils, @some-ui/dice-card, and the wasm-bindgen crates) ship
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

  // Not yet migrated to semantic tokens for structural roles. See
  // `structuralColorRatchet` in @some-ui/eslint-kit for what this defers and
  // what it deliberately does not: `theme-protocol/no-theme-boundary` stays
  // on. Delete this block once the fixed neutrals in this package have been
  // read role by role and replaced.
  ...structuralColorRatchet(),
]

export default inputConfig
