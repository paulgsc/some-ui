import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

import type { ViteConfigOptions } from "../../types/index.js"
import { resolveEntryPath } from "../build-config.js"
import { generatePackageJsonFields } from "./generate.js"

/**
 * Refuses to touch a package.json that does not belong to the package being
 * built. The manifest we rewrite must sit next to the library entry point the
 * same options describe - if `packageRoot` is pointed somewhere else (a stale
 * cwd, a workspace root, a sibling package) the entry will not be there.
 *
 * On the legitimate path this can never fire: the build that triggers the
 * sync already compiled that exact entry file. It only speaks up when the
 * caller is wrong, which is precisely when a silent write does real damage.
 */
function assertPackageRoot(
  options: ViteConfigOptions,
  packageRoot: string,
  packageJsonPath: string
): void {
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `No package.json at ${packageJsonPath} - refusing to create one. ` +
        `Check the packageRoot passed for ${options.packageName}.`
    )
  }

  const entryPath = resolveEntryPath(options, packageRoot)
  if (!existsSync(entryPath)) {
    throw new Error(
      `Refusing to rewrite ${packageJsonPath}: it does not look like the ` +
        `package for ${options.packageName}, whose entry point ` +
        `(${entryPath}) does not exist. This usually means packageRoot is ` +
        `pointing at the wrong directory.`
    )
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

/**
 * SIDE EFFECT: rewrites <packageRoot>/package.json in place.
 *
 * Call this ONLY from a build lifecycle hook (see ./plugin.ts) or from an
 * explicit, user-invoked sync command. It must never run as a consequence of
 * a module being imported or a vite.config.ts being evaluated: tools that
 * merely *load* config to analyze it - knip, eslint config resolution, IDE
 * tooling, `vite --help` - would then silently rewrite the manifest of
 * whatever workspace they happened to be pointed at. That is exactly the bug
 * this file's separation from ./generate.ts exists to prevent; keep the
 * pure derivation there and the write here.
 *
 * `packageRoot` is REQUIRED and has deliberately no `process.cwd()` fallback.
 * A cwd default silently retargets the write at whatever directory the
 * process happens to sit in, so a caller that forgot the argument corrupts an
 * unrelated manifest instead of failing. Callers must name the package they
 * mean; `assertPackageRoot` then verifies the claim.
 */
export function updatePackageJson(
  options: ViteConfigOptions,
  packageRoot: string
): Record<string, unknown> {
  const packageJsonPath = resolve(packageRoot, "package.json")

  try {
    assertPackageRoot(options, packageRoot, packageJsonPath)

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
