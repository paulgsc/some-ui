import { extensionsRecommended } from "maishatu-eslint-kit"

// vitest.config.ts references vitest/config which bundles vite@5 internally,
// while the workspace uses vite@6. Including it in tsconfig.json causes
// TypeScript to surface an irresolvable Plugin type mismatch between the two
// vite versions. Excluding it from tsconfig.json keeps typecheck clean, but
// the typescript-eslint project service then errors with "not found by project
// service". allowDefaultProject inside projectService bridges the gap: ESLint
// checks the file with a lightweight default program instead of the full
// tsconfig.json project.
const withAllowDefaultProject = extensionsRecommended.map((entry) => {
  if (entry.languageOptions?.parserOptions?.projectService !== true)
    return entry
  return {
    ...entry,
    languageOptions: {
      ...entry.languageOptions,
      parserOptions: {
        ...entry.languageOptions.parserOptions,
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
        },
      },
    },
  }
})

export default withAllowDefaultProject
