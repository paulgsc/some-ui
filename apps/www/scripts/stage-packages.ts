/**
 * The workspace packages the recording stage (`pnpm --filter www build:stage`)
 * reaches, read from its own imports, so the render image builds what the
 * stage bundles with no hand list to drift (RI3). infra/render/build.sh runs
 * it:
 *
 *   tsx apps/www/scripts/stage-packages.ts            one package a line
 *   tsx apps/www/scripts/stage-packages.ts --filters  `--filter=<pkg>...` each
 *
 * It walks www's own source from the stage's page (stage/index.html) and
 * vite.config.ts, which vite loads to build it: every import (see
 * `specifiersOf`), page script and stylesheet, and CSS `@import`, through
 * www's tsconfig paths (`@/` among them) and relative paths. Each `@some-ui/*` it meets is a package to build with everything it
 * depends on (turbo's `<pkg>...`), so nothing past www's own source is
 * walked: what a package imports, it declares. A path into www that resolves
 * to no file fails the walk, so a shape it cannot read stops it rather than
 * reading as "nothing more". Not read: `import.meta.glob` patterns, which the
 * stage uses only for packages' source CSS (none of it imports a package).
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
// eslint-disable-next-line import/no-extraneous-dependencies -- a devDependency, like vite to vite.config.ts
import ts from "typescript"

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/** What the stage build starts from: its page, and the config vite loads. */
const STAGE_ROOTS: ReadonlyArray<string> = [
  "stage/index.html",
  "vite.config.ts",
]

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"]
const WALKED_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ".css", ".html"])

type PathAlias = { prefix: string; wildcard: boolean; target: string }

/** The app's tsconfig `paths`, each to its first target. */
function pathAliases(appDir: string): Array<PathAlias> {
  const file = join(appDir, "tsconfig.json")
  const read = ts.readConfigFile(file, ts.sys.readFile)
  if (read.error !== undefined) {
    throw new Error(`stage-packages: ${file} does not parse`)
  }
  // Narrowed in place: this runs before any workspace package is built, so
  // @some-ui/core-utils' isRecord (dist/) cannot load yet.
  const config: unknown = read.config
  const options: unknown =
    typeof config === "object" && config !== null && "compilerOptions" in config
      ? config.compilerOptions
      : undefined
  const paths: unknown =
    typeof options === "object" && options !== null && "paths" in options
      ? options.paths
      : undefined
  if (typeof paths !== "object" || paths === null) return []
  return Object.entries(paths).flatMap(([key, targets]: [string, unknown]) => {
    const first: unknown = Array.isArray(targets) ? targets[0] : undefined
    if (typeof first !== "string") return []
    return [
      {
        prefix: key.replace(/\*$/, ""),
        wildcard: key.endsWith("*"),
        target: resolve(appDir, first.replace(/\*$/, "")),
      },
    ]
  })
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

function resolveFile(base: string): string | undefined {
  if (isFile(base)) return base
  for (const ext of SOURCE_EXTENSIONS) {
    if (isFile(base + ext)) return base + ext
  }
  for (const ext of SOURCE_EXTENSIONS) {
    const index = join(base, `index${ext}`)
    if (isFile(index)) return index
  }
  return undefined
}

/** The package a `@some-ui/<name>[/sub]` specifier names. */
function packageOf(specifier: string): string | undefined {
  return /^(@some-ui\/[\w.-]+)/.exec(specifier)?.[1]
}

function inside(dir: string, path: string): boolean {
  const rel = relative(dir, path)
  return rel !== "" && !rel.startsWith("..")
}

/**
 * What a source, style or page file loads at build time. Source is parsed:
 * every import and re-export declaration and every dynamic `import()`,
 * wherever it sits, but an `import type` or `export type`, which the build
 * drops. Under www's `verbatimModuleSyntax` an `import { type A }` keeps its
 * module, so it counts. A dynamic `import()` of anything but a string, a
 * bare `require()` and an `import x = require()` each fail it; a require
 * under another name (`createRequire`'s) is not seen.
 */
export function specifiersOf(text: string, ext: string): Array<string> {
  if (ext === ".css") {
    return [
      ...text.matchAll(
        /^\s*@(?:import|plugin|reference)\s+(?:url\()?["']([^"']+)["']/gm
      ),
    ].map(([, spec]) => spec)
  }
  if (ext === ".html") {
    return [
      ...text.matchAll(
        /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g
      ),
    ].map(([, spec]) => spec)
  }
  const found: Array<string> = []
  const visit = (node: ts.Node): void => {
    const typeOnly = ts.isImportDeclaration(node)
      ? node.importClause?.isTypeOnly === true
      : ts.isExportDeclaration(node) && node.isTypeOnly
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      !typeOnly &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text)
    } else if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require")
    ) {
      throw new Error(
        `stage-packages: a require, which this walk does not read: ${node.getText()}`
      )
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const spec = node.arguments.at(0)
      if (spec === undefined || !ts.isStringLiteralLike(spec)) {
        throw new Error(
          `stage-packages: a dynamic import of no plain string: ${node.getText()}`
        )
      }
      found.push(spec.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(ts.createSourceFile(`file${ext}`, text, ts.ScriptTarget.Latest, true))
  return found
}

/**
 * The `@some-ui/*` packages the stage build reaches, sorted. The app and its
 * roots are parameters so a test can walk a tree of its own.
 */
export function stagePackages(
  appDir: string = APP_DIR,
  roots: ReadonlyArray<string> = STAGE_ROOTS
): Array<string> {
  const aliases = pathAliases(appDir)
  const packages = new Set<string>()
  const seen = new Set<string>()
  const queue = roots.map((root) => resolve(appDir, root))

  const target = (spec: string, from: string): string | undefined => {
    const bare = spec.replace(/[?#].*$/, "")
    if (bare.startsWith(".")) return resolve(dirname(from), bare)
    if (bare.startsWith("/")) return resolve(appDir, `.${bare}`)
    for (const { prefix, wildcard, target: to } of aliases) {
      if (wildcard && bare.startsWith(prefix)) {
        return join(to, bare.slice(prefix.length))
      }
      if (!wildcard && bare === prefix) return to
    }
    return undefined
  }

  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue
    seen.add(file)
    const ext = extname(file)
    if (!WALKED_EXTENSIONS.has(ext)) continue
    for (const spec of specifiersOf(readFileSync(file, "utf8"), ext)) {
      const to = target(spec, file)
      const pkg = packageOf(spec)
      // A path alias out of the app (www's tsconfig maps
      // @some-ui/content-registry to its source) still names that package.
      if (pkg !== undefined && (to === undefined || !inside(appDir, to))) {
        packages.add(pkg)
        continue
      }
      if (to === undefined) continue // a package from npm
      const resolved = resolveFile(to)
      if (resolved === undefined) {
        throw new Error(
          `stage-packages: "${spec}" in ${relative(appDir, file)} resolves to no file`
        )
      }
      queue.push(resolved)
    }
  }
  return [...packages].sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const asFilters = process.argv.includes("--filters")
  for (const pkg of stagePackages()) {
    console.log(asFilters ? `--filter=${pkg}...` : pkg)
  }
}
