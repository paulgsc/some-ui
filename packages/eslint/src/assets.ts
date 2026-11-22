// C1029 (owner, #3399): a generated asset lives only on home, served by a
// URL the code computes from its key, never in the repo, an app bundle or
// the phone's disk; only the Pages build, a static site, bundles generated
// assets into its own artifact at build time. The code that generates one
// lives here. This is the rule, as pure functions over
// the tracked files; `scripts/check-assets.ts` runs it in root `pnpm lint`
// and pr.yml's `guards` job.
//
// It fails three shapes, each counted in sites (a line that breaks it):
//
// - **(a) media**: a file whose extension is in MEDIA, unless EXEMPT names
//   its path with why the file must be in the repo. One site per file.
// - **(b) copy**: a build or dev step that copies or links files into a
//   `public/` folder, the one Vite ships whole into a bundle. In a non-test
//   script that imports `fs` or `fs-extra` and names a `public` path
//   segment in a string, each call in COPY_CALLS is a site, and so is each
//   line writing a media file under `public/` (MEDIA_WRITE). In any non-test
//   script, a shell script, a workflow, a Dockerfile or a Makefile, so is
//   each `cp`, `rsync`, `ln` or `mv` line (a `\` continuation joined) that
//   names a `public` folder; and in a `package.json`, each entry of
//   `scripts` that does the same.
// - **(c) write**: phone code (`./phone-sources.ts`) calling Capacitor's
//   `Filesystem.writeFile`, `appendFile`, `downloadFile`, `copy` or
//   `rename` (as `.x(`, `?.x(` or `["x"](`), outside WRITE_EXEMPT.
//
// Copies (b) in COPY_EXEMPT pass: the Pages build is a static site, and may
// bundle generated assets into its own artifact at build time (C1029).
// The exemption is per file: what else that file copies into `public/` is
// review's.
//
// What it cannot see, and so leaves to review: whether a copied or written
// file is generated or a person's (it fails every copy into `public/` and
// every write, and the exemptions say which are allowed); a script's write
// or rename into `public/` whose destination is not one media literal (a
// manifest's version bump writes there too, so a write alone is no site);
// in a script, which
// copy goes into `public/` (every copy call counts once a `public` string is
// in the file, a copy to `dist/` included); a destination computed in
// another file (a Vite plugin handed a path,
// `extensions/common/vite/copy-files.ts`) or held in a shell variable; a
// file Vite's `publicDir` serves without copying (one committed in
// `public/` is (a)'s if it is media); a write through an alias of
// `Filesystem` or from native Java under `apps/mobile/android`; a media file
// under an extension not in MEDIA; and whether an exemption is still
// deserved (one that matches nothing fails, but a new or wider one is
// review's: exemptions have no ratchet).
//
// Today's violations are DEBT (#3399's audit), each with its count of
// sites, and the debt only shrinks: the check fails an entry the base
// branch's copy of this file lacks or holds with fewer sites, a file with
// more sites than its entry, and an entry with more sites than its file has
// (lower it, or delete the line once none are left). The base is read at
// ASSETS_RULE_FILE, so moving this file skips the comparison for that one
// change, as `check:calls` does for its own.

import { phoneSources } from "./phone-sources.ts"

/** This file, which the check reads at the base branch for DEBT. */
export const ASSETS_RULE_FILE = "packages/eslint/src/assets.ts"

const MEDIA =
  /\.(?:png|jpe?g|gif|webp|ico|pdf|wav|mp3|m4a|ogg|webm|mp4|mov|woff2?|ttf|otf)$/i

// Not media, so no entry is needed: `favicon.svg` (hand-authored source the
// brand rasters are drawn from), the Gradle wrapper's `.jar` (a build tool,
// not an asset), and fonts, which come from npm into `node_modules` and are
// never tracked (the résumé's downloaded fonts are ignored too).

type Exemption = { readonly pattern: RegExp; readonly why: string }

/** Media the repo must carry, each with why. */
const EXEMPT: ReadonlyArray<Exemption> = [
  {
    pattern:
      /^apps\/mobile\/android\/app\/src\/main\/res\/mipmap-[a-z]+\/ic_launcher(?:_round)?\.png$/,
    why: "the APK's launcher icons: minSdk 24 reads raster mipmaps from the package (ASSETS4 makes them a generator's build-time copies)",
  },
  {
    pattern:
      /^extensions\/(?:common\/brand|[a-z-]+\/public\/assets)\/icon-(?:16|48|128)\.png$/,
    why: "an extension's icons: AMO needs them inside the XPI (ASSETS4 makes them a generator's build-time copies)",
  },
]

/** Phone code that writes to the phone's disk and may, each with why. */
const WRITE_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    "apps/www/src/lib/share-files/index.ts",
    "the share sheet's copy: what the person shares is written to the cache only to hand it to Android's share sheet, and the folder is cleared at the next share",
  ],
])

/** Build steps that copy into a bundle's `public/` and may, each with why. */
const COPY_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    ".github/workflows/pages.yml",
    "the Pages build: the public site is a static web app, so it may bundle assets into its own artifact at build time, never committed (C1029)",
  ],
])

type Rule = "media" | "copy" | "write"

type Debt = {
  readonly rule: Rule
  readonly path: string
  /** Its count of sites; one when left out. */
  readonly sites?: number
  readonly row: string
}

// debt:start (the check reads each entry's `rule:`, `path:` and `sites:`
// between these markers at the base branch; keep them plain literals)
const DEBT: ReadonlyArray<Debt> = [
  {
    rule: "write",
    path: "apps/www/src/lib/call-videos/files.ts",
    sites: 2,
    row: "#3399 row 1: videos cached on the phone (ASSETS2)",
  },
  {
    rule: "copy",
    path: "apps/www/scripts/sync-resume.mjs",
    row: "#3399 row 2: résumé PDFs copied into www's public/ (ASSETS3)",
  },
  {
    rule: "media",
    path: "packages/video-render/src/sample/videos/phone-card/snips/web/phone/rust-rounds-sample-7da9fd68697e.png",
    row: "#3399 row 3: a screenshot committed as a render sample (ASSETS4)",
  },
  {
    rule: "media",
    path: "packages/video-motion/sample/zoom/screens/QM-311.png",
    row: "#3399 row 3: the same screenshot, committed again (ASSETS4)",
  },
  {
    rule: "media",
    path: "packages/voice-capture/tests/real-microphone/clips/silence.wav",
    row: "#3399 row 4: a test WAV make-clips.ts generates (ASSETS4)",
  },
  {
    rule: "media",
    path: "packages/voice-capture/tests/real-microphone/clips/speech.wav",
    row: "#3399 row 4: a test WAV make-clips.ts generates (ASSETS4)",
  },
  {
    rule: "media",
    path: "apps/www/public/favicon.ico",
    row: "#3399 row 5: a brand raster with no generator (ASSETS4)",
  },
  {
    rule: "media",
    path: "apps/www/public/logo192.png",
    row: "#3399 row 5: a brand raster with no generator (ASSETS4)",
  },
  {
    rule: "media",
    path: "apps/www/public/logo512.png",
    row: "#3399 row 5: a brand raster with no generator (ASSETS4)",
  },
  {
    rule: "copy",
    path: "apps/www/scripts/link-content-assets.js",
    row: "not in #3399's audit: honeycomb's sfx linked into www's public/ for dev",
  },
]
// debt:end

const TEST =
  /(?:^|\/)(?:__tests__|tests|e2e|testing)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const SCRIPT = /\.[cm]?[jt]s$/
const SHELL =
  /(?:^|\/)\.github\/.*\.ya?ml$|\.sh$|(?:^|\/)(?:Dockerfile|Makefile)(?:\.[\w-]+)?$/
const MANIFEST = /(?:^|\/)package\.json$/
const NODE_FS = /["'](?:node:)?fs(?:\/promises)?["']|["']fs-extra["']/
const COPY_CALLS =
  /(?<![\w$])(?:(?:[\w$]+\.)*(?:copyFile|cp|symlink|link)|(?:[\w$]+\.)+copy)(?:Sync)?\s*\(/g
const PUBLIC_STRING = /["'`/]public["'`/]/
const MEDIA_WRITE =
  /\b(?:writeFile|outputFile)(?:Sync)?\s*\(.*["'`/]public\/[^"'`]*\.(?:png|jpe?g|gif|webp|ico|pdf|wav|mp3|m4a|ogg|webm|mp4|mov|woff2?|ttf|otf)["'`]/gi
const SHELL_COPY = /(?<![\w-])(?:cp|rsync|ln|mv)\s/
const PUBLIC_PATH = /(?:^|[\s"'/=$}])public(?:\/|["'\s;)]|$)/
const DISK_WRITE =
  /\bFilesystem\s*(?:\??\.\s*(?:writeFile|appendFile|downloadFile|copy|rename)|\[\s*["'](?:writeFile|appendFile|downloadFile|copy|rename)["']\s*\])\s*\(/g

export type AssetViolation =
  | {
      readonly kind: Rule
      readonly file: string
      readonly line: number
      readonly sites: number
    }
  | {
      readonly kind: "grewDebt" | "staleDebt" | "newDebt"
      readonly file: string
      readonly rule: Rule
      readonly sites: number
      readonly owed: number
    }
  | { readonly kind: "staleExemption"; readonly file: string }

type Found = {
  readonly rule: Rule
  readonly file: string
  readonly lines: ReadonlyArray<number>
}

/** The 1-based line of each match of the global `pattern` in `text`. */
function matchLines(text: string, pattern: RegExp): Array<number> {
  return [...text.matchAll(pattern)].map(
    ({ index }) => text.slice(0, index).split("\n").length
  )
}

/** The lines (a `\` continuation joined) that copy into a `public` folder. */
function shellCopyLines(text: string): Array<number> {
  const lines: Array<number> = []
  const raw = text.split("\n")
  for (let at = 0; at < raw.length; at += 1) {
    const first = at
    let joined = raw[at] ?? ""
    while (joined.endsWith("\\") && at + 1 < raw.length) {
      at += 1
      joined = `${joined.slice(0, -1)} ${raw[at] ?? ""}`
    }
    if (/^\s*#/.test(joined)) continue
    if (SHELL_COPY.test(joined) && PUBLIC_PATH.test(joined))
      lines.push(first + 1)
  }
  return lines
}

/** The lines of a manifest's `scripts` entries that copy into `public`. */
function manifestCopyLines(text: string): Array<number> {
  let scripts: unknown
  try {
    const manifest: unknown = JSON.parse(text)
    scripts =
      typeof manifest === "object" && manifest !== null
        ? Reflect.get(manifest, "scripts")
        : undefined
  } catch {
    return []
  }
  if (typeof scripts !== "object" || scripts === null) return []
  const raw = text.split("\n")
  const lines: Array<number> = []
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== "string") continue
    if (!(SHELL_COPY.test(command) && PUBLIC_PATH.test(command))) continue
    const index = raw.findIndex((line) =>
      line.includes(`${JSON.stringify(name)}:`)
    )
    lines.push(index + 1)
  }
  return lines
}

function copyLines(file: string, text: string): Array<number> {
  if (MANIFEST.test(file)) return manifestCopyLines(text)
  if (SHELL.test(file)) return shellCopyLines(text)
  if (!SCRIPT.test(file) || TEST.test(file)) return []
  const lines = new Set([
    ...shellCopyLines(text),
    ...matchLines(text, MEDIA_WRITE),
  ])
  if (NODE_FS.test(text) && PUBLIC_STRING.test(text)) {
    for (const line of matchLines(text, COPY_CALLS)) lines.add(line)
  }
  return [...lines].sort((a, b) => a - b)
}

/** Every file breaking the rule, before the debt is taken off. */
function findAll(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): { found: Array<Found>; stale: Array<string> } {
  const found: Array<Found> = []
  const onThePhone = phoneSources(tracked, read)
  const usedExemptions = new Set<Exemption>()
  const usedWriteExemptions = new Set<string>()
  const usedCopyExemptions = new Set<string>()
  for (const file of [...tracked].sort()) {
    if (MEDIA.test(file)) {
      const exemption = EXEMPT.find(({ pattern }) => pattern.test(file))
      if (exemption === undefined)
        found.push({ rule: "media", file, lines: [0] })
      else usedExemptions.add(exemption)
      continue
    }
    const copies = SCRIPT.test(file) || SHELL.test(file) || MANIFEST.test(file)
    const phone = onThePhone(file)
    if (!copies && !phone) continue
    const text = read(file)
    if (copies) {
      const lines = copyLines(file, text)
      if (lines.length > 0) {
        if (COPY_EXEMPT.has(file)) usedCopyExemptions.add(file)
        else found.push({ rule: "copy", file, lines })
      }
    }
    if (phone) {
      const lines = matchLines(text, DISK_WRITE)
      if (lines.length === 0) continue
      if (WRITE_EXEMPT.has(file)) usedWriteExemptions.add(file)
      else found.push({ rule: "write", file, lines })
    }
  }
  const stale = [
    ...EXEMPT.filter((exemption) => !usedExemptions.has(exemption)).map(
      ({ pattern }) => String(pattern)
    ),
    ...[...WRITE_EXEMPT.keys()].filter(
      (file) => !usedWriteExemptions.has(file)
    ),
    ...[...COPY_EXEMPT.keys()].filter((file) => !usedCopyExemptions.has(file)),
  ]
  return { found, stale }
}

function keyOf(rule: string, path: string): string {
  return `${rule} ${path}`
}

/**
 * The DEBT entries in a copy of this file, as `<rule> <path>` keys to their
 * sites: what the ratchet holds the tree's DEBT against. Each `{ … }` in the
 * block is read for its `rule:`, `path:` and `sites:`, in any order. Null
 * when the text has no markers. An entry it cannot read is missing from the
 * map, so it fails as new debt, never passes.
 */
export function debtKeysIn(text: string): Map<string, number> | null {
  const start = text.indexOf("// debt:start")
  const end = text.indexOf("// debt:end")
  if (start === -1 || end === -1 || end < start) return null
  const keys = new Map<string, number>()
  for (const [entry] of text.slice(start, end).matchAll(/\{[^{}]*\}/g)) {
    const rule = /\brule:\s*"(media|copy|write)"/.exec(entry)?.[1]
    const path = /\bpath:\s*"([^"]+)"/.exec(entry)?.[1]
    const sites = /\bsites:\s*(\d+)/.exec(entry)?.[1]
    if (rule === undefined || path === undefined) continue
    keys.set(keyOf(rule, path), sites === undefined ? 1 : Number(sites))
  }
  return keys
}

/**
 * The violations among `tracked` (repo-relative paths), in path order.
 * `read` gives a file's text. `baseDebt` is `debtKeysIn` over the base
 * branch's copy of this file, or null where there is none to hold against.
 * `debt` is for tests; the check passes this file's own.
 */
export function findAssetViolations(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string,
  baseDebt: ReadonlyMap<string, number> | null,
  debt: ReadonlyArray<Debt> = DEBT
): Array<AssetViolation> {
  const owed = new Map(
    debt.map(({ rule, path, sites }) => [keyOf(rule, path), sites ?? 1])
  )
  const { found } = findAll(tracked, read)
  const violations: Array<AssetViolation> = []
  const have = new Map<string, number>()
  for (const { rule, file, lines } of found) {
    const key = keyOf(rule, file)
    const debtSites = owed.get(key)
    have.set(key, lines.length)
    if (debtSites === undefined)
      violations.push({
        kind: rule,
        file,
        line: lines[0] ?? 0,
        sites: lines.length,
      })
    else if (lines.length > debtSites)
      violations.push({
        kind: "grewDebt",
        file,
        rule,
        sites: lines.length,
        owed: debtSites,
      })
  }
  for (const { rule, path, sites = 1 } of debt) {
    const key = keyOf(rule, path)
    const now = have.get(key) ?? 0
    const base = baseDebt?.get(key)
    if (now < sites)
      violations.push({
        kind: "staleDebt",
        file: path,
        rule,
        sites: now,
        owed: sites,
      })
    else if (baseDebt !== null && (base === undefined || base < sites))
      violations.push({
        kind: "newDebt",
        file: path,
        rule,
        sites,
        owed: base ?? 0,
      })
  }
  return violations
}

/**
 * The exemptions in EXEMPT, WRITE_EXEMPT and COPY_EXEMPT that match nothing they exempt
 * among `tracked`: each fails, so one outlives its reason by no change.
 */
export function findStaleExemptions(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): Array<AssetViolation> {
  return findAll(tracked, read).stale.map((file) => ({
    kind: "staleExemption",
    file,
  }))
}

const HOME =
  "A generated asset lives on home and is served by a URL from its key (C1029)"

/** One human-readable line per violation, naming the fix. */
export function describeAssetViolation(violation: AssetViolation): string {
  switch (violation.kind) {
    case "media": {
      return `${violation.file}: a media file in the repo. ${HOME}; commit the code that makes it, or add an exemption with its reason to ${ASSETS_RULE_FILE} if the package truly needs it inside.`
    }
    case "copy": {
      return `${violation.file}:${violation.line}: copies files into a public/ folder, which ships in a bundle (${violation.sites} site(s)). ${HOME}, not a bundle; only a step of the Pages build may, as an exemption with its reason in ${ASSETS_RULE_FILE}.`
    }
    case "write": {
      return `${violation.file}:${violation.line}: writes bytes to the phone's disk (${violation.sites} site(s)). ${HOME}; stream it from there instead of saving it.`
    }
    case "grewDebt": {
      return `${violation.file}: ${violation.sites} ${violation.rule} site(s), more than the ${violation.owed} its DEBT line in ${ASSETS_RULE_FILE} allows. The debt only shrinks: remove the new one.`
    }
    case "staleDebt": {
      return `${violation.file}: ${violation.sites} ${violation.rule} site(s), fewer than the ${violation.owed} its DEBT line in ${ASSETS_RULE_FILE} allows. Lower its sites, or delete the line once none are left.`
    }
    case "newDebt": {
      return `${violation.file}: its ${violation.rule} DEBT line allows ${violation.sites} site(s), and the base branch's ${violation.owed}. The debt only shrinks: fix the file instead.`
    }
    case "staleExemption": {
      return `${ASSETS_RULE_FILE}: the exemption ${violation.file} matches nothing that needs it. Delete it.`
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled asset violation: ${String(unhandled)}`)
    }
  }
}
