import fs from "node:fs"
import path from "node:path"

/**
 * Find nearest package root (directory containing package.json)
 */
function getPackageRoot(file) {
  let dir = path.dirname(path.resolve(file))
  const root = path.parse(dir).root

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir
    }
    dir = path.dirname(dir)
  }

  return null
}

/**
 * Shared grouping utility
 */
function groupByPackage(files) {
  const byPackage = new Map()

  for (const file of files) {
    const packageRoot = getPackageRoot(file) ?? process.cwd()

    const existing = byPackage.get(packageRoot)
    if (existing) {
      existing.push(file)
    } else {
      byPackage.set(packageRoot, [file])
    }
  }

  return byPackage
}

const ESLINT_CHUNK_SIZE = 8

/**
 * ESLint per-package execution, chunked to cap per-invocation memory.
 */
function buildEslintCommands(files) {
  const grouped = groupByPackage(files)
  const commands = []

  for (const [pkgRoot, pkgFiles] of grouped.entries()) {
    for (let i = 0; i < pkgFiles.length; i += ESLINT_CHUNK_SIZE) {
      const chunk = pkgFiles.slice(i, i + ESLINT_CHUNK_SIZE)
      const relative = chunk
        .map((f) => `"${path.relative(pkgRoot, f)}"`)
        .join(" ")

      commands.push(
        ["sh -c", `'cd "${pkgRoot}" && eslint --fix --no-ignore ${relative}'`].join(" ")
      )
    }
  }

  return commands
}

/**
 * TypeScript per-package execution (project-based)
 *
 * Uses tsconfig.json in each package root.
 */
function buildTscCommands(files) {
  const grouped = groupByPackage(files)

  return [...grouped.keys()].map((pkgRoot) => {
    return ["sh -c", `'cd "${pkgRoot}" && tsc -p tsconfig.json --noEmit'`].join(
      " "
    )
  })
}

const config = {
  "**/*.{js,mjs,ts,tsx}": buildEslintCommands,
  "**/*.{ts,tsx}": buildTscCommands,
  "**/*.{js,mjs,ts,tsx,md,mdx,json,yml,css}": ["prettier --write"],

  "**/*.css": ["stylelint --allow-empty-input"],
}

export default config
