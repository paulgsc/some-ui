import someUIEslint from "./dist/esm/index.js"

const config = [
  ...someUIEslint,
  {
    // tests/lint-fixtures/** is fixture input, not source of this package's
    // own: every "violation" in there is deliberate - typescript.lint.test.ts
    // and react.lint.test.ts feed these files to ESLint programmatically and
    // assert on the exact messages produced. Linting them here too would
    // just report those intentional violations as if they were real bugs.
    ignores: ["tests/lint-fixtures/**"],
  },
]

export default config
