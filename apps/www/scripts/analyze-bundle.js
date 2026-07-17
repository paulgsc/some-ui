import { resolve } from "path"
// This is a standalone dev-tooling script (run via `pnpm run analyze`),
// never shipped in the app bundle, so these really are devDependencies —
// eslint's extraneous-dependencies check doesn't have a scripts/ carve-out.
// eslint-disable-next-line import/no-extraneous-dependencies
import { visualizer } from "rollup-plugin-visualizer"
// eslint-disable-next-line import/no-extraneous-dependencies
import { build } from "vite"

async function analyzeBundles() {
  // eslint-disable-next-line no-console
  console.log("🔍 Starting bundle analysis...")

  try {
    // Build with analysis plugins
    await build({
      configFile: resolve(process.cwd(), "vite.config.ts"),
      plugins: [
        // Generate interactive HTML treemap
        visualizer({
          filename: "dist/bundle-analysis.html",
          open: false,
          gzipSize: true,
          brotliSize: true,
          template: "treemap", // or 'sunburst', 'network'
        }),
        // Generate detailed JSON stats
        visualizer({
          filename: "dist/bundle-stats.json",
          json: true,
          gzipSize: true,
          brotliSize: true,
        }),
        // Generate network graph
        visualizer({
          filename: "dist/bundle-network.html",
          template: "network",
          gzipSize: true,
        }),
      ],
      build: {
        // Override for analysis
        rollupOptions: {
          output: {
            // More granular chunking for analysis
            manualChunks: (id) => {
              // Your authored packages
              if (id.includes("@yourorg/") || id.includes("packages/")) {
                const packageName =
                  id.match(/@yourorg\/([^\/]+)|packages\/([^\/]+)/)?.[1] ||
                  "authored-misc"
                return `authored-${packageName}`
              }

              // Node modules
              if (id.includes("node_modules")) {
                const packageName = id.split("node_modules/")[1].split("/")[0]

                // Group common packages
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

              // App code
              return "app"
            },
          },
          // Enhanced tree shaking for analysis
          treeshake: {
            moduleSideEffects: (id) => {
              // Your packages should be tree-shakable
              if (id.includes("@yourorg/") || id.includes("packages/")) {
                return false
              }
              // CSS and other assets have side effects
              return id.includes(".css") || id.includes(".scss")
            },
            propertyReadSideEffects: false,
            tryCatchDeoptimization: false,
            annotations: true,
          },
        },
        // Generate sourcemaps for analysis
        sourcemap: true,
        // Preserve module structure for analysis
        minify: false,
        // Detailed reporting
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

    // Read and analyze the stats
    const fs = await import("fs/promises")
    const stats = JSON.parse(
      await fs.readFile("dist/bundle-stats.json", "utf8")
    )

    // Analyze your authored packages
    const authoredModules = stats.filter(
      (module) =>
        module.id?.includes("@yourorg/") || module.id?.includes("packages/")
    )

    // eslint-disable-next-line no-console
    console.log(
      `📦 Found ${authoredModules.length} modules from your authored packages`
    )

    // Group by package
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

    // Report tree shaking effectiveness
    // eslint-disable-next-line no-console
    console.table(
      Object.entries(packageStats).map(([name, stats]) => ({
        Package: name,
        Modules: stats.modules,
        "Size (KB)": Math.round(stats.totalSize / 1024),
        "Gzip (KB)": Math.round(stats.gzipSize / 1024),
      }))
    )

    // Check for potential tree shaking issues
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
    // CLI entry point: exiting non-zero is how this script reports failure
    // to the invoking shell (pnpm run analyze:ci) — throwing here would just
    // become an unhandled rejection with exit code 1 anyway, but less clearly.
    // eslint-disable-next-line no-process-exit
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeBundles()
}

export { analyzeBundles }
