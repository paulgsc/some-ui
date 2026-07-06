import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

import type { ViteConfigOptions } from "../types/index.js"

export type PackageJsonExportTarget = string | Record<string, string>

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

export function generatePackageJsonFields(
  options: ViteConfigOptions,
  realPackageName: string = options.packageName
): PackageJsonFields {
  const { packageName, formats = ["es", "cjs"] } = options

  const hasESM = formats.includes("es")
  const hasCJS = formats.includes("cjs")
  const hasUMD = formats.includes("umd")
  const cssFileName = `dist/${cssBaseName(realPackageName)}.css`

  // Generate file paths
  const distFiles: Array<string> = []
  const exports: Record<string, PackageJsonExportTarget> = {}

  // Main export
  if (hasESM && hasCJS) {
    // Dual package setup
    exports["."] = {
      types: `./dist/${packageName}.d.ts`,
      import: `./dist/${packageName}.es.js`,
      require: `./dist/${packageName}.cjs.js`,
      default: `./dist/${packageName}.es.js`,
    }
    // Add style.css to exports
    exports["./style.css"] = `./${cssFileName}`
    distFiles.push(
      `dist/${packageName}.es.js`,
      `dist/${packageName}.cjs.js`,
      `dist/${packageName}.d.ts`
    )
  } else if (hasESM) {
    // ESM only
    exports["."] = {
      types: `./dist/${packageName}.d.ts`,
      import: `./dist/${packageName}.es.js`,
      default: `./dist/${packageName}.es.js`,
    }
    // Add style.css to exports
    exports["./style.css"] = `./${cssFileName}`
    distFiles.push(`dist/${packageName}.es.js`, `dist/${packageName}.d.ts`)
  } else if (hasCJS) {
    // CJS only
    exports["."] = {
      types: `./dist/${packageName}.d.ts`,
      require: `./dist/${packageName}.cjs.js`,
      default: `./dist/${packageName}.cjs.js`,
    }
    // Add style.css to exports
    exports["./style.css"] = `./${cssFileName}`
    distFiles.push(`dist/${packageName}.cjs.js`, `dist/${packageName}.d.ts`)
  }

  // Add UMD if present
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

function omitUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in obj) {
    const value = obj[key]
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

export function updatePackageJson(
  options: ViteConfigOptions,
  packageRoot: string = process.cwd()
): Record<string, unknown> {
  const packageJsonPath = resolve(packageRoot, "package.json")

  try {
    // Read existing package.json
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8")
    const existingPackageJson: Record<string, unknown> =
      JSON.parse(packageJsonContent)
    const realPackageName =
      typeof existingPackageJson.name === "string"
        ? existingPackageJson.name
        : options.packageName

    // Generate new fields
    const newFields = generatePackageJsonFields(options, realPackageName)

    // Merge with existing package.json, new fields take precedence - but an
    // undefined newField (e.g. `type` when the package isn't ESM-only) must
    // not overwrite an existing value, so it's omitted rather than spread.
    const updatedPackageJson: Record<string, unknown> = {
      ...existingPackageJson,
      ...omitUndefined(newFields),
    }

    // Write back to package.json with pretty formatting
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(updatedPackageJson, null, 2)}\n`
    )

    // eslint-disable-next-line no-console
    console.log(
      `📦 Updated package.json with build configuration for ${options.packageName}`
    )
    return updatedPackageJson
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // eslint-disable-next-line no-console
    console.error(`Failed to update package.json: ${message}`)
    throw error
  }
}
