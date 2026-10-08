/**
 * Writes `themes/feeling.css` from `src/theme/feeling.ts` and the session
 * themes' own CSS. Run it after changing a feeling's point or a session
 * theme's roles: `pnpm --filter @some-ui/styles generate:feelings`.
 * `src/theme/__tests__/feeling.test.ts` fails until the file matches.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { feelingStylesheet } from "../src/theme/feeling"
import { SESSION_THEMES } from "../src/theme/registry"
import type { ThemeSources } from "../src/theme/session-roles"
import { sessionRoles } from "../src/theme/session-roles"

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export const FEELING_CSS_PATH = join(PACKAGE_ROOT, "themes/feeling.css")

/** `tokens/base.css` and every `themes/*.css`, as the resolver reads them. */
export function themeSources(): ThemeSources {
  const dir = join(PACKAGE_ROOT, "themes")
  return {
    base: readFileSync(join(PACKAGE_ROOT, "tokens/base.css"), "utf8"),
    themes: Object.fromEntries(
      readdirSync(dir)
        .filter((file) => file.endsWith(".css"))
        .map((file) => [
          file.replace(/\.css$/, ""),
          readFileSync(join(dir, file), "utf8"),
        ])
    ),
  }
}

/** What `themes/feeling.css` should hold. */
export function feelingCss(): string {
  const sources = themeSources()
  return feelingStylesheet(
    SESSION_THEMES.map((theme) => ({
      theme,
      roles: sessionRoles(theme, sources),
    }))
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(FEELING_CSS_PATH, feelingCss())
}
