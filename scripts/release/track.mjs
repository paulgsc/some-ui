import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  bumpedPackages,
  changedFiles,
  git,
  hasBase,
  sourceFiles,
} from "./inputs.mjs"

export const policy = JSON.parse(
  readFileSync(new URL("./policy.json", import.meta.url))
)
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
export function packagesFor(track) {
  const rule = policy[track]
  if (!rule) throw new Error(`Unknown release track: ${track}`)
  return git("ls-files", "-z", "*/package.json")
    .split("\0")
    .filter(Boolean)
    .filter(
      (file) =>
        rule.roots.some((root) => file.startsWith(root)) &&
        !(rule.exclude ?? []).some((root) => file.startsWith(root))
    )
    .filter(
      (file) => !rule.requires || existsSync(join(dirname(file), rule.requires))
    )
    .map((file) => ({ ...readJson(file), file, dir: dirname(file) }))
}
export function output(values) {
  const text = Object.entries(values)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === "string" ? value : JSON.stringify(value)}\n`
    )
    .join("")
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text)
  else process.stdout.write(text)
}

export function detect(track) {
  const packages = packagesFor(track)
  const base = process.env.BASE_SHA
  const head = process.env.HEAD_SHA || "HEAD"
  const manual = process.env.EVENT_NAME === "workflow_dispatch"
  const retry = manual && process.env.PUBLISH_ONLY === "true"
  const bumped = bumpedPackages(packages, base, head)
  const sources = sourceFiles(base, head)
  const publish = retry ? packages : bumped
  // The workflow refreshes origin/main. A later merged version already covers
  // the source in an older queued run; that run must not request another bump.
  const covered =
    process.env.CHECK_LATEST === "true" && !manual
      ? new Set(
          bumpedPackages(packages, head, "origin/main").map((pkg) => pkg.name)
        )
      : new Set()
  const source = packages.filter(
    (pkg) =>
      !publish.includes(pkg) &&
      !covered.has(pkg.name) &&
      (manual ||
        sources === null ||
        sources.some(
          (file) =>
            file.startsWith(`${pkg.dir}/`) ||
            (track === "wasm" && ["Cargo.lock", "Cargo.toml"].includes(file))
        ))
  )
  if (track === "wasm") {
    const include = [
      ...publish.map((pkg) => ({
        crate_name: pkg.dir.split("/").at(-1),
        mode: "publish",
      })),
      ...source.map((pkg) => ({
        crate_name: pkg.dir.split("/").at(-1),
        mode: "source",
      })),
    ]
    output({
      matrix: { include },
      has_changes: String(include.length > 0),
      has_sources: String(source.length > 0),
      has_releases: String(publish.length > 0),
      publish_packages: publish.map(({ name, version }) => ({ name, version })),
    })
  } else {
    const newIntent =
      track === "node" &&
      hasBase(base) &&
      changedFiles(base, head).some(
        (file) =>
          /^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(file) &&
          existsSync(file)
      )
    output({
      release_mode: publish.length
        ? "publish"
        : manual || sources === null || sources.length || newIntent
          ? "release-pr"
          : "skip",
      publish_packages: publish.map(({ name, version }) => ({ name, version })),
      branch: policy[track].branch,
    })
  }
}

// Resolve Changesets' own parser through the declared CLI dependency. Detection
// needs only Node/Git; versioning uses the exact parser the installed CLI uses.
async function changesetsRuntime() {
  const require = createRequire(import.meta.url)
  const cli = require.resolve("@changesets/cli/bin.js")
  const cliRequire = createRequire(cli)
  const { readChangesets } = await import(
    pathToFileURL(cliRequire.resolve("@changesets/read"))
  )
  return {
    cli,
    readChangesets,
    greater: cliRequire("semver/functions/gt.js"),
    difference: cliRequire("semver/functions/diff.js"),
  }
}

export async function scoped(track, command, run) {
  const owned = packagesFor(track)
  if (!owned.length) throw new Error(`No packages belong to ${track}`)
  const { cli, readChangesets, greater, difference } = await changesetsRuntime()
  let intents = await readChangesets(process.cwd())
  // Generated WASM intents live only in their source run. Carry the pending
  // branch's still-unmerged bumps forward when a later crate refreshes it.
  // Main having reached that version means the old request is already merged.
  if (
    track === "wasm" &&
    command === "version" &&
    process.env.PREVIOUS_RELEASE_REF
  ) {
    const previous = process.env.PREVIOUS_RELEASE_REF
    for (const pkg of owned) {
      if (!git("ls-tree", "--name-only", previous, "--", pkg.file)) continue
      const prior = JSON.parse(git("show", `${previous}:${pkg.file}`))
      if (!greater(prior.version, pkg.version)) continue
      const type = difference(pkg.version, prior.version)?.replace(/^pre/, "")
      if (!["major", "minor", "patch"].includes(type))
        throw new Error(
          `Cannot reconstruct pending prerelease for ${pkg.name}; keep its explicit changeset.`
        )
      const id = `wasm-pending-${randomUUID()}`
      writeFileSync(
        `.changeset/${id}.md`,
        `---\n${JSON.stringify(pkg.name)}: ${type}\n---\n\nPreserve source changes already awaiting this WASM release.\n`
      )
    }
    intents = await readChangesets(process.cwd())
  }
  const names = new Set(owned.map((pkg) => pkg.name))
  const selected = []
  const hidden = []
  for (const intent of intents) {
    const own = intent.releases.filter((release) => names.has(release.name))
    if (own.length && own.length !== intent.releases.length)
      throw new Error(
        `Changeset ${intent.id} mixes release tracks; split it into one intent per track.`
      )
    if (own.length) selected.push(intent)
    else hidden.push(intent)
  }
  if (command === "version" && !selected.length) {
    output({ changed: "false" })
    return
  }
  const workspace = "pnpm-workspace.yaml"
  const configPath = ".changeset/config.json"
  const originalWorkspace = readFileSync(workspace, "utf8")
  const originalConfig = readFileSync(configPath, "utf8")
  const config = JSON.parse(originalConfig)
  const staging = mkdtempSync(join(tmpdir(), "release-track-"))
  const moved = []
  try {
    // Keep catalog/override settings, replacing only package discovery. A
    // foreign registry dependency is absent from this workspace, so Changesets
    // cannot cascade a version bump or rewrite its consumer's pin.
    const rest = originalWorkspace.replace(
      /^packages:\s*\n(?:[ \t].*\n|\s*\n)*/m,
      ""
    )
    if (rest === originalWorkspace)
      throw new Error(
        "Expected a block-style packages list in pnpm-workspace.yaml"
      )
    writeFileSync(
      workspace,
      `packages: ${JSON.stringify(owned.map((pkg) => pkg.dir))}\n${rest}`
    )
    if (command === "publish") {
      const requested = process.env.PUBLISH_PACKAGES
        ? JSON.parse(process.env.PUBLISH_PACKAGES)
        : owned.map(({ name, version }) => ({ name, version }))
      for (const pkg of requested) {
        if (
          !owned.some(
            (item) => item.name === pkg.name && item.version === pkg.version
          )
        )
          throw new Error(
            `Publish request is outside ${track} or has a stale version: ${pkg.name}@${pkg.version}`
          )
      }
      config.ignore = [
        ...new Set([
          ...(config.ignore ?? []),
          ...owned
            .filter((pkg) => !requested.some((item) => item.name === pkg.name))
            .map((pkg) => pkg.name),
        ]),
      ]
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    }
    for (const intent of hidden) {
      const file = `.changeset/${intent.id}.md`
      copyFileSync(file, join(staging, `${intent.id}.md`))
      unlinkSync(file)
      moved.push(file)
    }
    const execute =
      run ??
      (() =>
        execFileSync(process.execPath, [cli, command], { stdio: "inherit" }))
    await execute({ owned, selected, config: readJson(configPath) })
    if (command === "version")
      output({
        changed: String(
          owned.some((pkg) => readJson(pkg.file).version !== pkg.version)
        ),
      })
    if (command === "publish" && !run) {
      const requested = process.env.PUBLISH_PACKAGES
        ? JSON.parse(process.env.PUBLISH_PACKAGES)
        : owned
      finalizePublications(owned, requested)
    }
  } finally {
    writeFileSync(workspace, originalWorkspace)
    writeFileSync(configPath, originalConfig)
    for (const file of moved)
      copyFileSync(join(staging, file.split("/").at(-1)), file)
    rmSync(staging, { recursive: true, force: true })
  }
}

// Keep publication retries idempotent, including a previous run that published
// to npm but stopped before pushing its tag or creating its GitHub Release.
export function finalizePublications(owned, requested, execute = execFileSync) {
  for (const pkg of requested) {
    const owner = owned.find(
      (item) => item.name === pkg.name && item.version === pkg.version
    )
    if (!owner)
      throw new Error(`Publication is outside the requested track: ${pkg.name}`)
    if (owner.private) continue
    const tag = `${pkg.name}@${pkg.version}`
    const ref = `refs/tags/${tag}`
    const remote = execute("git", ["ls-remote", "--tags", "origin", ref], {
      encoding: "utf8",
    })
    if (remote.trim())
      execute("git", ["fetch", "--quiet", "origin", `${ref}:${ref}`], {
        stdio: "inherit",
      })
    else if (
      !execute("git", ["tag", "--list", tag], { encoding: "utf8" }).trim()
    )
      execute("git", ["tag", tag], { stdio: "inherit" })
    execute("git", ["push", "origin", ref], { stdio: "inherit" })
    try {
      execute("gh", ["release", "view", tag], { stdio: "ignore" })
    } catch {
      execute(
        "gh",
        ["release", "create", tag, "--verify-tag", "--generate-notes"],
        { stdio: "inherit" }
      )
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [track, command] = process.argv.slice(2)
  if (command === "detect") detect(track)
  else if (["version", "publish"].includes(command))
    await scoped(track, command)
  else if (command === "inputs") {
    const files = sourceFiles(process.env.BASE_SHA)
    output({ changed: String(files === null || files.length > 0) })
  } else throw new Error(`Unknown release command: ${command}`)
}
