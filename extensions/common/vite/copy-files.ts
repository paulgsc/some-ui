import { copyFileSync, cpSync, existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Plugin } from "vite"

/** A file or directory copied into `dist/` after the bundle is written. */
export type CopyStep = {
  /** Source, relative to the extension root (or repo root via "../.."), or absolute. */
  from: string
  /** Destination, relative to `dist/`. */
  to: string
}

/**
 * Copy extra files into `dist/` after Vite has written the bundle and the
 * public dir. Used for browser-specific manifest overrides (Vite's public-dir
 * copy lands the default manifest; this overwrites it for the other target)
 * for pre-built sibling artifacts such as a wasm crate's `dist/`, and for the
 * shared brand icons (`extensionConfig({ brandIcons: true })`).
 */
export function copyFiles(steps: Array<CopyStep>): Plugin {
  const root = process.cwd()
  return {
    name: "ext:copy-files",
    enforce: "post",
    // closeBundle runs after Vite's public-dir copy, so manifest overrides win.
    closeBundle(): void {
      for (const { from, to } of steps) {
        const src = resolve(root, from)
        const dst = resolve(root, "dist", to)
        if (!existsSync(src)) {
          throw new Error(`copyFiles: source missing: ${src}`)
        }
        if (statSync(src).isDirectory()) {
          cpSync(src, dst, { recursive: true, force: true })
        } else {
          mkdirSync(dirname(dst), { recursive: true })
          copyFileSync(src, dst)
        }
      }
    },
  }
}
