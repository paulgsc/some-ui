import type { ViteConfigOptions } from "@/types/index.js"

export function createResolveConfig(options: ViteConfigOptions): {
  alias: Record<string, string>
  tsconfigPaths: boolean
} {
  return {
    alias: options.alias ?? {},
    // Native tsconfig "paths" resolution (Vite 8+).
    tsconfigPaths: true,
  }
}
