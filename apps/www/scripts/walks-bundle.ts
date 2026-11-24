/**
 * A run's walks bundle (#3476, `docs/snips.md`, "How walks reach home"):
 * reads each app's folder the APK's walks left (`<app>/walk.json` beside
 * `<app>/snips/`), and writes, into `<out>`, each walked app's pictures at
 * `<app>/snips/<NN>.png`, `walks.json` (`some-ui.walks/1`, `walksBundleOf`)
 * and `SHA256SUMS` over them. A walk that failed left no `walk.json` and is
 * left out. Run by `.github/workflows/snips-capture.yml`'s bundle job:
 *
 *   pnpm --filter www exec tsx scripts/walks-bundle.ts <walks> <out> <commit> <run>
 *
 * Writes nothing when no walk was made; fails, writing nothing, on a walk
 * its folder doesn't hold whole.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { sha256Hex } from "@some-ui/core-utils"

import { checksumsOf, walksBundleOf } from "@/lib/snips"

const [from = "", out = "", commit = "", run = ""] = process.argv.slice(2)
if (!from || !out || !commit || !run) {
  throw new Error("usage: walks-bundle.ts <walks> <out> <commit> <run>")
}

const apps = existsSync(from)
  ? readdirSync(from).filter((app) => existsSync(join(from, app, "walk.json")))
  : []
if (apps.length === 0)
  console.log(
    "::notice::No walk was made in this run, so there is no walks bundle."
  )
else await bundle(apps)

async function bundle(apps: ReadonlyArray<string>): Promise<void> {
  const walks = await Promise.all(
    [...apps].sort().map(async (app) => {
      const snips = join(from, app, "snips")
      const pictures = new Map<string, { bytes: number; sha256: string }>()
      for (const name of existsSync(snips) ? readdirSync(snips) : []) {
        const bytes = readFileSync(join(snips, name))
        pictures.set(name, {
          bytes: bytes.length,
          sha256: await sha256Hex(new Uint8Array(bytes).buffer),
        })
      }
      return {
        app,
        walk: JSON.parse(readFileSync(join(from, app, "walk.json"), "utf8")),
        pictures,
      }
    })
  )
  const bundle = walksBundleOf(walks, { commit, run })

  for (const { pictures } of bundle.walks)
    for (const { name } of pictures) {
      mkdirSync(join(out, name, ".."), { recursive: true })
      copyFileSync(join(from, name), join(out, name))
    }
  const manifest = `${JSON.stringify(bundle, null, 2)}\n`
  writeFileSync(join(out, "walks.json"), manifest)
  writeFileSync(
    join(out, "SHA256SUMS"),
    checksumsOf([
      ...bundle.walks.flatMap((w) => w.pictures),
      {
        name: "walks.json",
        sha256: await sha256Hex(new TextEncoder().encode(manifest).buffer),
      },
    ])
  )
  console.log(
    `walks bundle: ${bundle.walks.map((w) => `${w.app} (${String(w.walk.snips.length)} steps)`).join(", ")}`
  )
}
