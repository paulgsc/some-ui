import type { ViteConfigOptions } from "../types/index.js"

export function createRollupOptions(
  options: ViteConfigOptions,
  externalDeps: Array<string>
) {
  const { additionalExternals = [] } = options

  const external = [
    "react",
    "react-dom",
    ...externalDeps,
    ...additionalExternals,
  ]

  return {
    external,
    output: {
      globals: {
        react: "React",
        "react-dom": "ReactDOM",
      },
    },
  }
}
