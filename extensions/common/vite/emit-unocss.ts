import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"

/**
 * One UnoCSS stylesheet to emit. Content scripts and popup pages need standalone
 * `.css` files (referenced from the manifest / popup HTML), not JS-injected
 * styles — so UnoCSS runs as a discrete generation step rather than through the
 * Vite CSS graph. `patterns` is ordered: UnoCSS concatenates any raw `.css`
 * sources in list order, so this stays an explicit list (globbing would reorder
 * the cascade), but it now lives declaratively in `vite.config.ts` instead of a
 * shell command.
 */
export type UnocssBuild = {
  /** UnoCSS config file, relative to the extension root. */
  config: string
  /** Ordered content patterns (globs and/or raw `.css` files) to scan/concat. */
  patterns: Array<string>
  /** Output path, relative to the extension root (e.g. `dist/styles/content.css`). */
  out: string
  /** Emit preflights? Defaults to true; `false` passes `--no-preflights`. */
  preflights?: boolean
}

/**
 * Emit UnoCSS stylesheets as part of `vite build` (in `closeBundle`, after the
 * bundle and public dir are written). Shells the workspace-local `unocss` CLI
 * so output matches the CLI exactly.
 */
export function emitUnocss(builds: Array<UnocssBuild>): Plugin {
  const root = process.cwd()
  return {
    name: "ext:emit-unocss",
    enforce: "post",
    closeBundle(): void {
      const bin = resolve(root, "node_modules/.bin/unocss")
      if (!existsSync(bin)) {
        throw new Error(
          `emitUnocss: unocss CLI not found at ${bin} — add "unocss" to devDependencies`
        )
      }
      for (const { config, patterns, out, preflights } of builds) {
        const args = [
          ...patterns,
          "--config",
          config,
          ...(preflights === false ? ["--no-preflights"] : []),
          "-o",
          out,
        ]
        execFileSync(bin, args, { cwd: root, stdio: "inherit" })
      }
    },
  }
}
