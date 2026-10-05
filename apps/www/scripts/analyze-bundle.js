import { resolve } from "path"
// A dev-tooling script, never shipped, so these are devDependencies; the
// extraneous-dependencies check has no scripts/ carve-out.
// eslint-disable-next-line import/no-extraneous-dependencies
import { visualizer } from "rollup-plugin-visualizer"
// eslint-disable-next-line import/no-extraneous-dependencies
import { build } from "vite"

// vite.config.ts reads this to keep sourcemaps and the gzip report, which the
// default build skips (#1449). Set before `build()` loads the config.
process.env.WWW_ANALYZE = "1"

async function analyzeBundles() {
  // eslint-disable-next-line no-console
  console.log("🔍 Starting bundle analysis...")

  try {
    await build({
      configFile: resolve(process.cwd(), "vite.config.ts"),
      plugins: [
        visualizer({
          filename: "dist/bundle-analysis.html",
          open: false,
          gzipSize: true,
          brotliSize: true,
          template: "treemap", // or 'sunburst', 'network'
        }),
        visualizer({
          filename: "dist/bundle-stats.json",
          json: true,
          gzipSize: true,
          brotliSize: true,
        }),
        visualizer({
          filename: "dist/bundle-network.html",
          template: "network",
          gzipSize: true,
        }),
      ],
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              if (id.includes("@yourorg/") || id.includes("packages/")) {
                const packageName =
                  id.match(/@yourorg\/([^\/]+)|packages\/([^\/]+)/)?.[1] ||
                  "authored-misc"
                return `authored-${packageName}`
              }

              if (id.includes("node_modules")) {
                const packageName = id.split("node_modules/")[1].split("/")[0]

                if (["react", "react-dom"].includes(packageName)) {
                  return "react-core"
                }
                if (packageName.startsWith("@tanstack")) {
                  return "tanstack"
                }
                if (["lodash", "date-fns", "ramda"].includes(packageName)) {
                  return "utilities"
                }
                if (packageName.startsWith("@") && packageName.includes("/")) {
                  return `vendor-${packageName.split("/")[0].slice(1)}`
                }

                return `vendor-${packageName}`
              }

              return "app"
            },
          },
          treeshake: {
            moduleSideEffects: (id) => {
              if (id.includes("@yourorg/") || id.includes("packages/")) {
                return false
              }
              return id.includes(".css") || id.includes(".scss")
            },
            propertyReadSideEffects: false,
            tryCatchDeoptimization: false,
            annotations: true,
          },
        },
        sourcemap: true,
        minify: false,
        reportCompressedSize: true,
      },
    })

    // eslint-disable-next-line no-console
    console.log("✅ Bundle analysis complete!")
    // eslint-disable-next-line no-console
    console.log("📊 Reports generated:")
    // eslint-disable-next-line no-console
    console.log("  - dist/bundle-analysis.html (interactive treemap)")
    // eslint-disable-next-line no-console
    console.log("  - dist/bundle-network.html (dependency network)")
    // eslint-disable-next-line no-console
    console.log("  - dist/bundle-stats.json (raw data)")
    // eslint-disable-next-line no-console
    console.log("")
    // eslint-disable-next-line no-console
    console.log("🔍 Tree shaking analysis:")

    const fs = await import("fs/promises")
    const stats = JSON.parse(
      await fs.readFile("dist/bundle-stats.json", "utf8")
    )

    const authoredModules = stats.filter(
      (module) =>
        module.id?.includes("@yourorg/") || module.id?.includes("packages/")
    )

    // eslint-disable-next-line no-console
    console.log(
      `📦 Found ${authoredModules.length} modules from your authored packages`
    )

    const packageStats = {}
    authoredModules.forEach((module) => {
      const packageMatch = module.id.match(
        /@yourorg\/([^\/]+)|packages\/([^\/]+)/
      )
      const packageName = packageMatch?.[1] || packageMatch?.[2] || "unknown"

      if (!packageStats[packageName]) {
        packageStats[packageName] = {
          modules: 0,
          totalSize: 0,
          gzipSize: 0,
          files: [],
        }
      }

      packageStats[packageName].modules++
      packageStats[packageName].totalSize += module.renderedLength || 0
      packageStats[packageName].gzipSize += module.gzipLength || 0
      packageStats[packageName].files.push(module.id)
    })

    // eslint-disable-next-line no-console
    console.table(
      Object.entries(packageStats).map(([name, stats]) => ({
        Package: name,
        Modules: stats.modules,
        "Size (KB)": Math.round(stats.totalSize / 1024),
        "Gzip (KB)": Math.round(stats.gzipSize / 1024),
      }))
    )

    const largeModules = authoredModules
      .filter((module) => (module.renderedLength || 0) > 10000)
      .sort((a, b) => (b.renderedLength || 0) - (a.renderedLength || 0))

    if (largeModules.length > 0) {
      // eslint-disable-next-line no-console
      console.log("\n⚠️  Large modules that might need tree shaking attention:")
      largeModules.forEach((module) => {
        // eslint-disable-next-line no-console
        console.log(
          `  - ${module.id}: ${Math.round((module.renderedLength || 0) / 1024)}KB`
        )
      })
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ Bundle analysis failed:", error)
    // CLI entry point: a non-zero exit is how failure reaches the shell.
    // eslint-disable-next-line no-process-exit
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeBundles()
}

export { analyzeBundles }
