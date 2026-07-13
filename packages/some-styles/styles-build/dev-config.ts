import { isAbsolute, resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin, type UserConfig } from "vite"

import { buildSourceInjection } from "./resolve-context.mjs"
import type { StyleContext } from "./types.js"

/**
 * Dev/build-server counterpart to styles-build/run.mjs, the styles analogue of
 * extensions/common/ext-build/dev-config.ts. A workspace's vite.config.ts is a
 * one-line wrapper around this, fed the SAME style.context.ts the production
 * `some-styles-build` pass reads — so the dev server and the static build scan
 * an identical source set and can't diverge.
 *
 * It returns the shared `@tailwindcss/vite` plugin plus a small transform that
 * appends the context's `@source` directives onto the Tailwind entry, so the
 * declared graph — not vite's cwd auto-detection — decides what is scanned.
 */
export function createStyleConfig(
  context: StyleContext,
  target = "default"
): UserConfig {
  const ctx = context[target] ?? context.default
  const root = process.cwd()
  const content = (ctx?.content ?? []).map((glob) =>
    isAbsolute(glob) ? glob : resolve(root, glob)
  )
  return defineConfig({
    plugins: [tailwindcss(), sourceInjector(content)],
  })
}

function sourceInjector(contentAbs: Array<string>): Plugin {
  return {
    name: "some-ui-styles:source-injector",
    enforce: "pre",
    transform(code, id): string | undefined {
      if (!id.endsWith(".css")) return undefined
      return buildSourceInjection(code, contentAbs) ?? undefined
    },
  }
}
