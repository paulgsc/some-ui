import type { ViteConfigOptions } from "@/types/index.js"

export function createRollupOptions(
  options: ViteConfigOptions,
  externalDeps: Array<string>
) {
  const { additionalExternals = [] } = options

  const exactExternals = new Set([
    "react",
    "react-dom",
    ...externalDeps,
    ...additionalExternals,
  ])

  return {
    // Function form (not a plain string array) so React's JSX-runtime subpaths
    // are externalized too. Under jsx:"react-jsx" the compiler injects imports
    // from `react/jsx-runtime` (and `react/jsx-dev-runtime`); those don't
    // string-match "react", so with an exact-match array Rolldown bundles the
    // JSX runtime inline — and that inlined CJS runtime reaches for a
    // `require("react")` shim that throws in the browser ("Calling `require`
    // ... in an environment that doesn't expose the `require` function").
    // Externalizing the subpaths turns them back into clean ESM imports.
    external: (id: string): boolean => {
      if (exactExternals.has(id)) return true
      if (id.startsWith("react/") || id.startsWith("react-dom/")) return true
      return false
    },
    output: {
      globals: {
        react: "React",
        "react-dom": "ReactDOM",
        "react/jsx-runtime": "React",
        "react/jsx-dev-runtime": "React",
      },
    },
  }
}
