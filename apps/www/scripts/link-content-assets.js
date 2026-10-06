// honeycomb's sfx and (optionally) an LLM-generated hangul vocab file live in
// packages/some-content, not this app's public/. The Pages build copies sfx
// at build time (pages.yml); for local `vite dev` this symlinks both, so the
// dev server serves them live. Run by hand (`pnpm run content:link`), never
// from an install or dev hook: auto-executing Node there is a footgun.
// vite.config.ts warns at startup if sfx is missing.
//
// Topik lessons are file_host rows now (`import-curriculum`), so a stale
// `public/topiks` link from an earlier run is removed below.
//
// A missing subdir is skipped: these assets are curated and gitignored.
import {
  existsSync,
  lstatSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const appPublicDir = resolve(__dirname, "../public")
const contentPublicDir = resolve(
  __dirname,
  "../../../packages/some-content/public"
)

const retiredTopiks = resolve(appPublicDir, "topiks")
try {
  if (
    lstatSync(retiredTopiks).isSymbolicLink() &&
    readlinkSync(retiredTopiks) === resolve(contentPublicDir, "topiks")
  ) {
    rmSync(retiredTopiks)
    // eslint-disable-next-line no-console
    console.log("[link-content-assets] removed retired public/topiks link")
  }
} catch {
  // Nothing there, which is the expected state.
}

for (const name of ["sfx", "hangul"]) {
  const src = resolve(contentPublicDir, name)
  const dest = resolve(appPublicDir, name)

  if (!existsSync(src)) continue

  let destStat = null
  try {
    destStat = lstatSync(dest)
  } catch {
    // dest doesn't exist yet - nothing to clean up before symlinking.
  }

  if (destStat) {
    if (destStat.isSymbolicLink() && readlinkSync(dest) === src) continue
    // A real dir/file (the CI copy step run locally) or a symlink elsewhere:
    // replace it, so public/{name} always resolves to src.
    rmSync(dest, { recursive: true, force: true })
  }

  symlinkSync(src, dest, "dir")
  // eslint-disable-next-line no-console
  console.log(`[link-content-assets] linked public/${name} -> ${src}`)
}
