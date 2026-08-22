#!/usr/bin/env node
// Hermetic font provisioning for the résumé build.
//
// Typst falls back to whatever fonts the host happens to have when a family
// isn't found, so a build that names a font it doesn't ship produces different
// glyphs — and different line breaks, and therefore a different page budget —
// on a dev laptop than in CI. Everything downstream of this file (the one-page
// assertion, the ATS text check) is only meaningful if the font set is fixed,
// so the families below are downloaded, content-verified, and handed to typst
// via `--font-path` with system fonts ignored.
//
// Same shape as the typst binary fetch in compile.mjs: resolve from cache,
// otherwise download once and cache under node_modules/.cache. Files are
// pinned by SHA-256 rather than by upstream revision — if Google Fonts reissues
// a face, the build fails loudly instead of silently re-flowing the page.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const cacheDir = join(packageDir, "node_modules", ".cache", "resume-fonts")
const RAW = "https://raw.githubusercontent.com/google/fonts/main"

// Families the templates may name. Keep `family` matching the font's internal
// family name — that string is what a template's `#set text(font: ...)` looks
// up, and typst matches on it rather than on the filename.
export const FONT_FAMILIES = {
  lato: {
    family: "Lato",
    files: [
      [
        "Lato-Light.ttf",
        "ofl/lato/Lato-Light.ttf",
        "cf2a774503baf418d584f49967bd160e1e03f087c13b25602f28024ec7788f08",
      ],
      [
        "Lato-Regular.ttf",
        "ofl/lato/Lato-Regular.ttf",
        "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
      ],
      [
        "Lato-Italic.ttf",
        "ofl/lato/Lato-Italic.ttf",
        "e399c44efe1387100531d26c7e4800c5d12251b890d6654a3098c7c679cb1786",
      ],
      [
        "Lato-Bold.ttf",
        "ofl/lato/Lato-Bold.ttf",
        "8a0aace75d33794eece4b28187bfc1df0bbd2888b5d8a56e01788c8d65d16be1",
      ],
      [
        "Lato-BoldItalic.ttf",
        "ofl/lato/Lato-BoldItalic.ttf",
        "62c1b7f0d2e74b45960154c3520efc337b553db0961bfdc950d5618334596cc8",
      ],
      [
        "Lato-Black.ttf",
        "ofl/lato/Lato-Black.ttf",
        "808c62839c62dbce7de689af7603666fc7f8b81e0df537d8a5212c87580d4337",
      ],
    ],
  },
  "pt-serif": {
    family: "PT Serif",
    files: [
      [
        "PT_Serif-Web-Regular.ttf",
        "ofl/ptserif/PT_Serif-Web-Regular.ttf",
        "a4951fade06ff8f09b7673aa81ffb65a8cd409e24d3289a6dc670bc4dda2557a",
      ],
      [
        "PT_Serif-Web-Italic.ttf",
        "ofl/ptserif/PT_Serif-Web-Italic.ttf",
        "f57e95ff9dc85691a3b2e193f2028db36f6663939a46c0fc4f286d618b80b7ce",
      ],
      [
        "PT_Serif-Web-Bold.ttf",
        "ofl/ptserif/PT_Serif-Web-Bold.ttf",
        "038ba7336bd7ea14f12ad155bed51a4345cac5153275d521dec3ba04021c526e",
      ],
    ],
  },
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function ensureFile(name, path, expected) {
  const target = join(cacheDir, name)
  if (existsSync(target) && digest(readFileSync(target)) === expected) return

  const url = `${RAW}/${encodeURI(path)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())

  const actual = digest(bytes)
  if (actual !== expected) {
    throw new Error(
      `${name} does not match its pinned checksum.\n` +
        `  expected ${expected}\n  actual   ${actual}\n` +
        `Upstream reissued this face. Review the change, then update the ` +
        `checksum in scripts/fonts.mjs — do not relax the check.`
    )
  }
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(target, bytes)
}

// Returns the directory to hand typst as `--font-path`.
export async function resolveFontPath() {
  const wanted = Object.values(FONT_FAMILIES).flatMap((f) => f.files)
  const missing = wanted.filter(
    ([name, , expected]) =>
      !existsSync(join(cacheDir, name)) ||
      digest(readFileSync(join(cacheDir, name))) !== expected
  )
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.log(`[resume] fetching ${missing.length} pinned font file(s)...`)
    for (const [name, path, expected] of missing) {
      await ensureFile(name, path, expected)
    }
  }
  return cacheDir
}
