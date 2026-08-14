import { readFile } from "node:fs/promises"

const reportPath = process.argv[2]

if (!reportPath) {
  console.error(
    "Usage: node scripts/audit-node-licenses.mjs <pnpm-license-report.json>"
  )
  process.exit(2)
}

// Keep this list explicit so newly introduced license families still receive
// review. These are permissive, attribution-only, or file-level copyleft
// licenses that are compatible with how this repository distributes software.
const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
])

// pnpm reports Unknown when a package omits license metadata. Only add an
// exception after verifying the package's published license.
const LICENSE_EXCEPTIONS = new Map([["spawndamnit", "MIT"]])

const isAllowedExpression = (expression) =>
  expression
    .replace(/[()]/g, "")
    .split(" AND ")
    .every((part) =>
      part.split(" OR ").some((license) => ALLOWED_LICENSES.has(license.trim()))
    )

const report = JSON.parse(await readFile(reportPath, "utf8"))
const violations = []
let packageCount = 0

for (const [license, packages] of Object.entries(report)) {
  for (const packageDetails of packages) {
    packageCount += 1

    const effectiveLicense =
      license === "Unknown"
        ? LICENSE_EXCEPTIONS.get(packageDetails.name)
        : license

    if (!effectiveLicense || !isAllowedExpression(effectiveLicense)) {
      const versions = packageDetails.versions?.join(",") || "unknown version"
      violations.push(`${packageDetails.name}@${versions} (${license})`)
    }
  }
}

if (violations.length > 0) {
  console.error("License violations:")
  violations.forEach((violation) => console.error(` - ${violation}`))
  process.exit(1)
}

console.log(`All licenses OK (${packageCount} packages)`)
