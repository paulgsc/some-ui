import type { ViteConfigOptions } from "@/types/index.js"
import { DEFAULT_FORMATS, libraryEntries } from "@/lib/build-config.js"

type PackageJsonExportTarget = string | Record<string, string>

export type PackageJsonFields = {
  name?: string
  main?: string
  module?: string
  types?: string
  style?: string
  exports?: Record<string, PackageJsonExportTarget>
  files?: Array<string>
  type?: "module" | "commonjs"
  sideEffects?: boolean | Array<string>
}

/**
 * Vite's JS/d.ts bundling nests output under the `packageName` option
 * verbatim, e.g. dist/@some-ui/chat.es.js. Its CSS extraction doesn't - it
 * names the bundle from package.json's actual (possibly scoped) `name`
 * field and always flattens that to the last path segment, e.g.
 * dist/chat.css, *regardless* of what `packageName` option a given
 * package's vite.config.ts happens to pass (several packages pass an
 * unscoped alias here, e.g. packageName: "some-ui-honeycomb" for a
 * package.json named "@some-ui/honeycomb"). Always derive this from the
 * real package.json name, not the packageName option, so generated
 * package.json fields point at a file that actually exists.
 */
function cssBaseName(realPackageName: string): string {
  const parts = realPackageName.split("/")
  return parts[parts.length - 1] ?? realPackageName
}

/**
 * Pure: derives the build-output package.json fields from the vite options.
 * No filesystem access, no logging - safe to call from anywhere, including
 * static-analysis tooling. The filesystem write lives in ./write.ts.
 */
export function generatePackageJsonFields(
  options: ViteConfigOptions,
  realPackageName: string = options.packageName
): PackageJsonFields {
  const { packageName, formats = DEFAULT_FORMATS } = options

  const hasESM = formats.includes("es")
  const hasCJS = formats.includes("cjs")
  const hasUMD = formats.includes("umd")
  const cssFileName = `dist/${cssBaseName(realPackageName)}.css`

  // Generate file paths
  const distFiles: Array<string> = []
  const exports: Record<string, PackageJsonExportTarget> = {}

  // Every entry the build emits gets the same conditions, keyed by its
  // subpath; the stylesheet is the package's one, after the main entry.
  for (const entry of libraryEntries(options)) {
    const name = entry.outputName
    if (hasESM && hasCJS) {
      exports[entry.subpath] = {
        types: `./dist/${name}.d.ts`,
        import: `./dist/${name}.es.js`,
        require: `./dist/${name}.cjs.js`,
        default: `./dist/${name}.es.js`,
      }
      distFiles.push(
        `dist/${name}.es.js`,
        `dist/${name}.cjs.js`,
        `dist/${name}.d.ts`
      )
    } else if (hasESM) {
      exports[entry.subpath] = {
        types: `./dist/${name}.d.ts`,
        import: `./dist/${name}.es.js`,
        default: `./dist/${name}.es.js`,
      }
      distFiles.push(`dist/${name}.es.js`, `dist/${name}.d.ts`)
    } else if (hasCJS) {
      exports[entry.subpath] = {
        types: `./dist/${name}.d.ts`,
        require: `./dist/${name}.cjs.js`,
        default: `./dist/${name}.cjs.js`,
      }
      distFiles.push(`dist/${name}.cjs.js`, `dist/${name}.d.ts`)
    }
    if (entry.subpath === "." && (hasESM || hasCJS)) {
      exports["./style.css"] = `./${cssFileName}`
    }
  }

  if (hasUMD) {
    distFiles.push(`dist/${packageName}.umd.js`)
  }

  return {
    main: hasCJS
      ? `./dist/${packageName}.cjs.js`
      : hasESM
        ? `./dist/${packageName}.es.js`
        : undefined,
    module: hasESM ? `./dist/${packageName}.es.js` : undefined,
    types: `./dist/${packageName}.d.ts`,
    style: `./${cssFileName}`,
    exports: Object.keys(exports).length > 0 ? exports : undefined,
    files: ["dist"],
    type: hasESM && !hasCJS ? "module" : undefined,
    sideEffects: ["*.css"],
  }
}
