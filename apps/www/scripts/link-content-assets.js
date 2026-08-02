// honeycomb's sfx and (optionally) an LLM-generated hangul vocab file or
// curated topik study material all live in packages/some-content (see
// apps/www/.gitignore) and aren't checked into this app's public/ dir. CI's
// Pages build (pages.yml) copies sfx into public/ at build time - hangul is
// deliberately NOT part of that copy step, since the static GitHub Pages
// build has no companion data at all (see src/lib/hangul-vocab). For local
// `vite dev` this symlinks all three instead, so the dev server serves the
// real files straight out of packages/some-content, live, with no rebuild
// needed. Run manually via `pnpm run content:link` when you have the actual
// asset files locally - deliberately NOT wired into a pre/postinstall or
// pre<script> hook, since auto-executing Node on install/dev is a footgun
// (surprise side effects, supply-chain scanner flags on the lifecycle script
// itself). vite.config.ts warns at dev-server startup if sfx is missing,
// pointing back at this command - hangul is excluded from that warning since
// its absence is expected/harmless (HangulHexGrid's own bundled demo pool
// covers it).
//
// leetype used to be here too, for a fetched `challenges.json` corpus and a
// tree of code samples. Both went in M20 (#887): an exercise carries its
// source inline, so no code path fetches a file to start a step, and the
// exercise shim is the one seam a future generator replaces.
//
// No-op for any subdir that doesn't exist locally: these assets are
// curated/gitignored, not part of a fresh checkout, so a machine without
// them just runs without honeycomb sound / custom hangul vocab / topik
// material rather than failing.
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

for (const name of ["sfx", "hangul", "topiks"]) {
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
    // A real (non-symlink) dir/file here is almost always a leftover from
    // the CI copy step (pages.yml) run locally, or a stale symlink pointing
    // somewhere else - replace it rather than erroring, since the whole
    // point of this script is to make public/{name} always resolve to src.
    rmSync(dest, { recursive: true, force: true })
  }

  symlinkSync(src, dest, "dir")
  // eslint-disable-next-line no-console
  console.log(`[link-content-assets] linked public/${name} -> ${src}`)
}
