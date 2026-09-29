// honeycomb's sfx and (optionally) an LLM-generated hangul vocab file both
// live in packages/some-content (see apps/www/.gitignore) and aren't checked
// into this app's public/ dir. CI's Pages build (pages.yml) copies sfx into
// public/ at build time - hangul is deliberately NOT part of that copy step,
// since the static GitHub Pages build has no companion data at all (see
// src/lib/hangul-vocab). For local
// `vite dev` this symlinks both instead, so the dev server serves the
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
// topiks went the same way in #1048: lessons are rows in file_host, served by
// its curriculum routes and added with its `import-curriculum` command, so
// nothing here links them. packages/some-content/public/topiks is still where
// lesson files are authored - it is that command's input. A `public/topiks`
// link an earlier run of this script left behind is removed below, so a
// stale copy can't sit in public/ looking like it is still served.
//
// No-op for any subdir that doesn't exist locally: these assets are
// curated/gitignored, not part of a fresh checkout, so a machine without
// them just runs without honeycomb sound / custom hangul vocab rather than
// failing.
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
