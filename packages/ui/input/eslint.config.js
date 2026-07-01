import someUIEslint from "maishatu-eslint-kit"

const inputConfig = [
  ...someUIEslint,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    settings: {
      // Workspace packages this input package imports (some-ui-shared,
      // some-ui-utils, some-ui-slideshow, and the wasm-bindgen crates) ship
      // dist output that only exists after a build. tsconfig.eslint.json
      // maps those specifiers to source/stubs so ESLint can resolve them
      // without requiring a build — kept out of tsconfig.json so it has no
      // effect on the real tsc project (rootDir/include membership).
      "import-x/resolver": {
        typescript: { project: "./tsconfig.eslint.json" },
        node: true,
      },
    },
  },
]

export default inputConfig
