/**
 * @module cli
 *
 * `pnpm contract` — the whole point of the package.
 *
 * Two checks run, in increasing order of cost and decreasing order of
 * certainty:
 *
 * 1. **Drift** compares the contracts against the server's checked-in route
 *    inventory. No network, no server, always runs.
 * 2. **Conformance** sends each contract's request to a real server and
 *    compares the response to what the contract says it should be. Needs a
 *    server, so it is skipped when `--drift-only` is passed or nothing is
 *    listening.
 *
 * Read-only by default. Contracts marked `mutates` sit out unless
 * `--include-mutations` is passed, so pointing this at a server that holds data
 * you care about is safe by default rather than safe by remembering.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { fullPath } from "./contract"
import type { RouteInventory } from "./drift"
import {
  checkDrift,
  InventoryShapeError,
  InventoryVersionError,
  parseInventory,
} from "./drift"
import type { ContractOutcome } from "./probe"
import { probeContract } from "./probe"
import { allContracts, assertUniqueIds, selectContracts } from "./registry"
import type { RunReport } from "./report"
import {
  exitCode,
  renderDrift,
  renderOutcomes,
  renderSummary,
  summarize,
} from "./report"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_INVENTORY = resolve(HERE, "..", "routes.server.json")
const DEFAULT_BASE_URL = "http://nixos.local:3000"

type Options = {
  baseUrl: string
  inventoryPath: string
  only: string | undefined
  driftOnly: boolean
  includeMutations: boolean
  showUncovered: boolean
  json: boolean
  timeoutMs: number
}

function parseArgs(argv: ReadonlyArray<string>): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    if (index === -1) return undefined
    return argv[index + 1]
  }
  const has = (flag: string): boolean => argv.includes(flag)

  const timeoutRaw = value("--timeout")
  const parsedTimeout =
    timeoutRaw === undefined ? Number.NaN : Number(timeoutRaw)

  return {
    baseUrl:
      value("--base-url") ??
      process.env["CONTRACT_BASE_URL"] ??
      DEFAULT_BASE_URL,
    inventoryPath: value("--routes") ?? DEFAULT_INVENTORY,
    only: value("--only"),
    driftOnly: has("--drift-only"),
    includeMutations: has("--include-mutations"),
    showUncovered: has("--show-uncovered"),
    json: has("--json"),
    timeoutMs: Number.isFinite(parsedTimeout) ? parsedTimeout : 10_000,
  }
}

const HELP = `
pnpm --filter @some-ui/contract-harness contract [options]

  --base-url <url>        server to probe (default ${DEFAULT_BASE_URL}, or $CONTRACT_BASE_URL)
  --routes <path>         route inventory snapshot (default routes.server.json)
  --only <ids|modules>    comma-separated contract ids or module names
  --drift-only            skip the live probes; compare contracts to the snapshot only
  --include-mutations     also run contracts marked as mutating (they are skipped by default)
  --show-uncovered        list server routes that no contract covers
  --timeout <ms>          per-request timeout (default 10000)
  --json                  emit the raw run report as JSON instead of text
  --help                  this

Regenerate the snapshot from the server repo with:
  DATABASE_URL=sqlite://$PWD/dev.db make routes
and copy routes.server.json into this package.
`.trim()

function loadInventory(path: string): RouteInventory {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    throw new Error(
      `could not read route inventory at ${path}. Generate it in the server repo with \`make routes\` and copy it here.`
    )
  }
  return parseInventory(JSON.parse(raw))
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${HELP}\n`)
    return 0
  }

  const options = parseArgs(argv)
  assertUniqueIds(allContracts)

  const selected = selectContracts(allContracts, options.only)
  if (selected.length === 0) {
    process.stderr.write(`No contracts matched --only ${options.only ?? ""}\n`)
    return 1
  }

  const inventory = loadInventory(options.inventoryPath)

  // Drift is checked against every contract, not just the selected ones:
  // coverage numbers for a filtered run would be misleading.
  const drift = checkDrift(allContracts, inventory)

  const outcomes: Array<ContractOutcome> = []

  if (!options.driftOnly) {
    for (const contract of selected) {
      const runnable = contract.mutates !== true || options.includeMutations
      if (!runnable) {
        outcomes.push({
          id: contract.id,
          module: contract.module,
          summary: contract.summary,
          method: contract.method,
          path: fullPath(contract),
          status: "skipped",
          findings: [
            {
              code: "mutation-skipped",
              severity: "info",
              message: "mutating contract; pass --include-mutations to run it",
            },
          ],
        })
        continue
      }

      // Sequential on purpose. The server has a concurrency limiter and a rate
      // limiter in front of every versioned route, and a parallel run would be
      // measuring those instead of the handshakes.
      outcomes.push(
        await probeContract(contract, {
          baseUrl: options.baseUrl,
          timeoutMs: options.timeoutMs,
        })
      )
    }
  }

  const report: RunReport = {
    drift,
    outcomes,
    baseUrl: options.driftOnly ? undefined : options.baseUrl,
    probed: !options.driftOnly,
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return exitCode(summarize(report))
  }

  const summary = summarize(report)
  const sections = [renderDrift(drift, options.showUncovered)]
  if (report.probed) {
    sections.push("", `Probing ${options.baseUrl}`, renderOutcomes(outcomes))
  }
  sections.push("", renderSummary(summary, report.probed))

  process.stdout.write(`${sections.join("\n")}\n`)
  return exitCode(summary)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    if (error instanceof InventoryVersionError) {
      process.stderr.write(`Inventory version mismatch: ${error.message}\n`)
    } else if (error instanceof InventoryShapeError) {
      process.stderr.write(`Unreadable route inventory: ${error.message}\n`)
    } else {
      process.stderr.write(
        `contract harness failed: ${error instanceof Error ? error.message : String(error)}\n`
      )
    }
    process.exitCode = 1
  })
