/**
 * This package's theme CSS as text, for code that resolves a theme's roles
 * outside a browser (`sessionRoles`, `themeColours`): `tokens/base.css` and
 * every `themes/*.css`. Node only; the browser reads the CSS itself.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { SessionThemeId } from "./registry"
import { getSessionTheme } from "./registry"
import type { ThemeSources } from "./session-roles"
import { themeColours } from "./session-roles"

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")

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

/** Session theme `id`'s colours for `names`, as `#rrggbb` (`themeColours`). */
export function sessionColours(
  id: SessionThemeId,
  names: ReadonlyArray<string>
): Readonly<Record<string, string>> {
  const theme = getSessionTheme(id)
  if (theme === undefined) throw new Error(`no session theme ${id}`)
  return themeColours(theme, themeSources(), names)
}
