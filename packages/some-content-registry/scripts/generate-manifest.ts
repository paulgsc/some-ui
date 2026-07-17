/**
 * Build Script: Generate Manifest
 *
 * Run this during your build process to generate /public/scenes/manifest.json
 *
 * Usage:
 *   node scripts/generate-manifest.js
 *
 * Or add to package.json:
 *   "scripts": {
 *     "build:manifest": "tsx scripts/generate-manifest.ts",
 *     "prebuild": "npm run build:manifest"
 *   }
 */

import { readdirSync, writeFileSync } from "fs"
import { join } from "path"

type ManifestConfig = {
  /** Directory to scan (relative to project root) */
  scanDir: string

  /** Output manifest path (relative to project root) */
  outputPath: string

  /** File extensions to include */
  extensions: Array<string>

  /** Path prefix for URLs (how files will be requested at runtime) */
  urlPrefix: string
}

/**
 * Recursively walk directory and collect file paths
 */
function walkDirectory(dir: string): Array<string> {
  const entries = readdirSync(dir, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      return walkDirectory(fullPath)
    }

    return fullPath
  })
}

/**
 * Generate manifest file
 */
function generateManifest(config: ManifestConfig): void {
  // eslint-disable-next-line no-console
  console.log(`Scanning directory: ${config.scanDir}`)

  // Walk directory tree
  const allFiles = walkDirectory(config.scanDir)

  // Filter by extensions
  const filteredFiles = allFiles.filter((file) =>
    config.extensions.some((ext) => file.endsWith(ext))
  )

  // Convert to URL paths
  const urlPaths = filteredFiles.map((file) => {
    // Remove the scan directory prefix
    const relativePath = file.replace(config.scanDir, "")
    // Ensure starts with /
    const normalized = relativePath.startsWith("/")
      ? relativePath
      : `/${relativePath}`
    // Add URL prefix
    return `${config.urlPrefix}${normalized}`
  })

  // Write manifest
  writeFileSync(config.outputPath, JSON.stringify(urlPaths, null, 2), "utf-8")

  // eslint-disable-next-line no-console
  console.log(`✓ Generated manifest: ${config.outputPath}`)
  // eslint-disable-next-line no-console
  console.log(`  Files found: ${urlPaths.length}`)
  // eslint-disable-next-line no-console
  urlPaths.forEach((path) => console.log(`    - ${path}`))
}

// -----------------------------
// Configuration
// -----------------------------

const config: ManifestConfig = {
  scanDir: "public/topiks",
  outputPath: "public/topiks/manifest.json",
  extensions: [".json"],
  urlPrefix: "/topiks",
}

// -----------------------------
// Execute
// -----------------------------

try {
  generateManifest(config)
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("Failed to generate manifest:", error)
  throw new Error("Failed to generate manifest", { cause: error })
}
