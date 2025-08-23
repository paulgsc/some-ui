import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

import type { ViteConfigOptions } from "../types/index.js"

export type PackageJsonFields = {
  name?: string
  main?: string
  module?: string
  types?: string
  exports?: Record<string, any>
  files?: Array<string>
  type?: "module" | "commonjs"
  sideEffects?: boolean
}

export function generatePackageJsonFields(
  options: ViteConfigOptions
): PackageJsonFields {
  const { packageName, formats = ["es", "cjs"] } = options

  const hasESM = formats.includes("es")
  const hasCJS = formats.includes("cjs")
  const hasUMD = formats.includes("umd")

  // Generate file paths
  const distFiles: Array<string> = []
  const exports: Record<string, any> = {}

  // Main export
  if (hasESM && hasCJS) {
    // Dual package setup
    exports["."] = {
      types: `./dist/${packageName}.d.ts`,
      import: `./dist/${packageName}.es.js`,
      require: `./dist/${packageName}.cjs.js`,
      default: `./dist/${packageName}.es.js`,
    }
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
    distFiles.push(`dist/${packageName}.es.js`, `dist/${packageName}.d.ts`)
  } else if (hasCJS) {
    // CJS only
    exports["."] = {
      types: `./dist/${packageName}.d.ts`,
      require: `./dist/${packageName}.cjs.js`,
      default: `./dist/${packageName}.cjs.js`,
    }
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
    exports: Object.keys(exports).length > 0 ? exports : undefined,
    files: ["dist"],
    type: hasESM && !hasCJS ? "module" : undefined,
    sideEffects: false,
  }
}

export function updatePackageJson(
  options: ViteConfigOptions,
  packageRoot: string = process.cwd()
) {
  const packageJsonPath = resolve(packageRoot, "package.json")

  try {
    // Read existing package.json
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8")
    const existingPackageJson = JSON.parse(packageJsonContent)

    // Generate new fields
    const newFields = generatePackageJsonFields(options)

    // Merge with existing package.json, new fields take precedence
    const updatedPackageJson = {
      ...existingPackageJson,
      ...Object.fromEntries(
        Object.entries(newFields).filter(([, value]) => value !== undefined)
      ),
    }

    // Write back to package.json with pretty formatting
    writeFileSync(
      packageJsonPath,
      JSON.stringify(updatedPackageJson, null, 2) + "\n"
    )

    console.log(
      `📦 Updated package.json with build configuration for ${options.packageName}`
    )
    return updatedPackageJson
  } catch (error) {
    console.error(`Failed to update package.json: ${error}`)
    throw error
  }
}
