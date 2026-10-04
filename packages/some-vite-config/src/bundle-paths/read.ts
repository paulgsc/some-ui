// What a written build carries: its chunks, whether anything loads each one,
// and which source modules each one holds. Read from the output on disk, not
// from the bundler's own report, for two reasons measured on Vite 8 /
// Rolldown (an audit of www's three profiles, October 2026):
//
// - `OutputChunk.modules` lists a module, with a rendered length, when its
//   code was dropped after chunking. It is not what ships.
// - Chunk file names seen in `generateBundle` are not always the ones written.
//
// So this reads the build the way a browser meets it: from the HTML, through
// the chunk names each loaded chunk spells, with sourcemaps to say what each
// chunk is made of. The build must be made with `--manifest` (the list of
// chunks) and `--sourcemap hidden` (the same code that ships, with maps
// beside it that nothing references).
import { existsSync, readdirSync, readFileSync } from "fs"
import { basename, dirname, join, relative, resolve } from "path"
import { z } from "zod"

import { presentSources } from "./sourcemap.js"

export type EmittedChunk = {
  /** Path under the build's output directory, as the manifest names it. */
  readonly file: string
  readonly bytes: number
  /** Whether an HTML entry loads it, directly or through other chunks. */
  readonly reachable: boolean
  /** Chunks whose names its code spells: what it can load. */
  readonly refs: ReadonlyArray<string>
  /**
   * The modules it is the entry for (an HTML entry, or the target of an
   * `import()`), from the manifest. Empty for a shared chunk.
   */
  readonly facades: ReadonlyArray<string>
  /** Whether it has a sourcemap; without one, `modules` is empty. */
  readonly mapped: boolean
  /** Source modules it carries (see `moduleId`), with their bytes. */
  readonly modules: ReadonlyMap<string, number>
}

export type BuildContents = {
  readonly outDir: string
  /** Chunks an HTML file names: where loading starts. */
  readonly roots: ReadonlyArray<string>
  readonly chunks: ReadonlyArray<EmittedChunk>
}

/**
 * A module's name in rules: its path relative to `repoRoot`, or, for
 * anything inside a `node_modules`, `node_modules/` plus the path within the
 * innermost one (`node_modules/@capacitor/core/dist/index.js`, whatever pnpm's
 * store calls the directory). A query the bundler gave the id (a TanStack
 * route split, `?tsr-split=component`) is kept.
 */
export function moduleId(absolute: string, repoRoot: string): string {
  const marker = "/node_modules/"
  const inner = absolute.lastIndexOf(marker)
  if (inner >= 0) return `node_modules/${absolute.slice(inner + marker.length)}`
  const fromRoot = relative(repoRoot, absolute)
  return fromRoot.startsWith("..") ? absolute : fromRoot
}

function htmlFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return htmlFiles(path)
    return entry.name.endsWith(".html") ? [path] : []
  })
}

const Manifest = z.record(
  z.string(),
  z.object({
    file: z.string(),
    isEntry: z.boolean().optional(),
    isDynamicEntry: z.boolean().optional(),
  })
)

const SourceMap = z.object({
  sources: z.array(z.string().nullable()),
  mappings: z.string(),
  sourceRoot: z.string().optional(),
})

/**
 * `viteRoot` is the build's root (manifest keys are relative to it);
 * `repoRoot` is what module ids are relative to (`moduleId`).
 */
export function readBuild(
  outDir: string,
  repoRoot: string,
  viteRoot: string
): BuildContents {
  const manifestPath = join(outDir, ".vite/manifest.json")
  if (!existsSync(manifestPath)) {
    throw new Error(
      `${manifestPath} not found: build with --manifest so the chunks can be listed`
    )
  }
  const manifest = Manifest.parse(
    JSON.parse(readFileSync(manifestPath, "utf8"))
  )
  const files = [
    ...new Set(
      Object.values(manifest)
        .map((entry) => entry.file)
        .filter((file) => file.endsWith(".js"))
    ),
  ].sort()
  const code = new Map(
    files.map((file) => [file, readFileSync(join(outDir, file), "utf8")])
  )

  // A chunk is loaded when a loaded file spells its name: an `import` of
  // "./name.js", a preload list's "assets/name.js", a <script src>. Names are
  // content hashes, so a name appearing by accident is not a concern; a dead
  // reference keeping a chunk "reachable" is, and is what the module rules
  // are for.
  const named = (text: string): Array<string> =>
    files.filter((file) => text.includes(basename(file)))
  const roots = [
    ...new Set(
      htmlFiles(outDir).flatMap((path) => named(readFileSync(path, "utf8")))
    ),
  ]
  const refs = new Map(
    files.map((file) => [
      file,
      named(code.get(file) ?? "").filter((other) => other !== file),
    ])
  )
  const reachable = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.shift() ?? ""
    if (reachable.has(file)) continue
    reachable.add(file)
    queue.push(...(refs.get(file) ?? []))
  }

  const facades = new Map<string, Array<string>>()
  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.isEntry && !entry.isDynamicEntry) continue
    const list = facades.get(entry.file) ?? []
    list.push(moduleId(resolve(viteRoot, key), repoRoot))
    facades.set(entry.file, list)
  }

  const chunks = files.map((file): EmittedChunk => {
    const text = code.get(file) ?? ""
    const mapPath = join(outDir, `${file}.map`)
    const modules = new Map<string, number>()
    if (existsSync(mapPath)) {
      const map = SourceMap.parse(JSON.parse(readFileSync(mapPath, "utf8")))
      const base = resolve(dirname(mapPath), map.sourceRoot ?? "")
      for (const [index, bytes] of presentSources(text, map)) {
        const source = map.sources[index]
        if (source == null) continue
        const absolute = resolve(base, source)
        // A source inside the output directory (a virtual module given a
        // segment) would otherwise carry each build's own path in its id.
        const id = absolute.startsWith(`${resolve(outDir)}/`)
          ? `<out>/${relative(outDir, absolute)}`
          : moduleId(absolute, repoRoot)
        modules.set(id, (modules.get(id) ?? 0) + bytes)
      }
    }
    return {
      file,
      bytes: Buffer.byteLength(text),
      reachable: reachable.has(file),
      refs: refs.get(file) ?? [],
      facades: facades.get(file) ?? [],
      mapped: existsSync(mapPath),
      modules,
    }
  })
  return { outDir, roots, chunks }
}
