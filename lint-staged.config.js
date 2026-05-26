// lint-staged.config.js
import fs from "node:fs"
import path from "node:path"

/**
 * Walk upward from a file until a package.json is found.
 */
function getPackageRoot(file) {
  let currentDir = path.dirname(path.resolve(file))
  const filesystemRoot = path.parse(currentDir).root

  while (currentDir !== filesystemRoot) {
    const packageJsonPath = path.join(currentDir, "package.json")

    if (fs.existsSync(packageJsonPath)) {
      return currentDir
    }

    currentDir = path.dirname(currentDir)
  }

  return null
}

/**
 * Group staged files by nearest package root.
 */
function groupFilesByPackage(files) {
  /** @type {Map<string, string[]>} */
  const grouped = new Map()

  for (const file of files) {
    const packageRoot = getPackageRoot(file) ?? process.cwd()
    const existing = grouped.get(packageRoot)

    if (existing !== undefined) {
      existing.push(file)
      continue
    }

    grouped.set(packageRoot, [file])
  }

  return grouped
}

/**
 * Build one ESLint command per package.
 *
 * Running ESLint from the package root ensures:
 * - local eslint.config.* resolution
 * - local tsconfig resolution
 * - workspace-relative import resolution
 */
function buildEslintCommands(files) {
  const grouped = groupFilesByPackage(files)

  return [...grouped.entries()].map(([packageRoot, packageFiles]) => {
    const relativeFiles = packageFiles
      .map((file) => `"${path.relative(packageRoot, file)}"`)
      .join(" ")

    return [
      "sh -c",
      `'cd "${packageRoot}" && NODE_OPTIONS=--max_old_space_size=4096 eslint --fix --no-ignore ${relativeFiles}'`,
    ].join(" ")
  })
}

const lintStagedConfig = {
  "**/*.{js,mjs,ts,tsx}": buildEslintCommands,
}

export default lintStagedConfig
