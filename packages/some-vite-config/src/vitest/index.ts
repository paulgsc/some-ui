import react from "@vitejs/plugin-react"
import type { ViteUserConfig } from "vitest/config"

/**
 * Shared vitest presets for the workspaces whose test config was a copy of
 * one of two shapes. Each returns a plain config object; a workspace that
 * needs anything else keeps its own `defineConfig` instead of growing an
 * option here.
 *
 * Paths are resolved by the caller (`path.resolve(import.meta.dirname, ...)`)
 * because they are relative to the workspace, not to this package.
 */
type TestPresetOptions = {
  /** `resolve.alias`, mirroring the workspace's tsconfig `paths`. */
  alias?: Record<string, string>
  /** Defaults to every `*.test.ts(x)` under the workspace. */
  include?: Array<string>
  /** Set only where the workspace asked for it; vitest's default is `false`. */
  passWithNoTests?: boolean
}

const DEFAULT_INCLUDE = ["**/*.test.{ts,tsx}"]

/** Pure logic: the node environment, with vitest's globals. */
export function defineNodeTest({
  alias,
  include = DEFAULT_INCLUDE,
  passWithNoTests,
}: TestPresetOptions = {}): ViteUserConfig {
  return {
    ...(alias === undefined ? {} : { resolve: { alias } }),
    test: {
      environment: "node",
      globals: true,
      include,
      ...(passWithNoTests === undefined ? {} : { passWithNoTests }),
    },
  }
}

type DomTestPresetOptions = TestPresetOptions & {
  /**
   * Usually `["./vitest.setup.ts"]`, which imports the shared
   * `@some-ui/vite-config/vitest/setup` (src/vitest/vitest.setup.ts).
   */
  setupFiles?: Array<string>
  /** Pre-bundle `@testing-library/react` (`deps.optimizer.client.include`). */
  optimizeTestingLibrary?: boolean
}

/** React components and hooks: jsdom, the React plugin, vitest's globals. */
export function defineDomTest({
  alias,
  include = DEFAULT_INCLUDE,
  passWithNoTests,
  setupFiles,
  optimizeTestingLibrary = false,
}: DomTestPresetOptions = {}): ViteUserConfig {
  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      ...(setupFiles === undefined ? {} : { setupFiles }),
      include,
      ...(passWithNoTests === undefined ? {} : { passWithNoTests }),
      ...(optimizeTestingLibrary
        ? {
            deps: {
              optimizer: {
                client: { include: ["@testing-library/react"] },
              },
            },
          }
        : {}),
    },
    ...(alias === undefined ? {} : { resolve: { alias } }),
  }
}
