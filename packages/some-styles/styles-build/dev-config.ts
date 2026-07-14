import { isAbsolute, resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin, type UserConfig } from "vite"

import { injectSourcesForCssId } from "./resolve-context.mjs"
import type { StyleContext } from "./types.js"

/**
 * The shared `@tailwindcss/vite` plugin plus a transform that appends the
 * declared context's `@source` directives onto the Tailwind entry — so the
 * declared graph, not vite's cwd auto-detection, decides what a single pass
 * scans. Return the array so a workspace with an existing vite config (e.g.
 * apps/www, with its router/react plugins and build options) can spread these
 * into its own `plugins` instead of replacing the whole config.
 */
export function createStylePlugins(
  context: StyleContext,
  target = "default"
): Array<Plugin> {
  const ctx = context[target] ?? context.default
  const root = process.cwd()
  const content = (ctx?.content ?? []).map((glob) =>
    isAbsolute(glob) ? glob : resolve(root, glob)
  )
  // The injector must transform the Tailwind entry BEFORE @tailwindcss/vite
  // reads it, so it comes first. `tailwindcss()` returns several plugins;
  // flatten so the caller gets one uniform array.
  return [sourceInjector(content), tailwindcss()].flat()
}

/**
 * Dev/build-server counterpart to styles-build/run.mjs, the styles analogue of
 * extensions/common/ext-build/dev-config.ts. A workspace whose vite.config.ts
 * needs nothing but the style pipeline uses this one-liner; a workspace with a
 * richer config spreads {@link createStylePlugins} instead. Either way it reads
 * the SAME style.context.ts the production `some-styles-build` pass reads, so
 * the dev server and the static build scan an identical source set.
 */
export function createStyleConfig(
  context: StyleContext,
  target = "default"
): UserConfig {
  return defineConfig({
    plugins: createStylePlugins(context, target),
  })
}

function sourceInjector(contentAbs: Array<string>): Plugin {
  return {
    name: "some-ui-styles:source-injector",
    enforce: "pre",
    transform(code, id): string | undefined {
      return injectSourcesForCssId(code, id, contentAbs) ?? undefined
    },
  }
}
