import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { sourceFiles } from "./inputs.mjs"
import { finalizePublications, policy, scoped } from "./track.mjs"

// RT1
// Claim: Node, WASM and Docker version/publish only their owned packages and
// consume only their own intents; metadata never requests another source bump.
// Family: all three tracks; foreign and mixed intents; real Changesets cascades;
// success/failure cleanup; publish subsets and stale/foreign requests; source,
// metadata and mixed multi-package pushes; manual retries and reordered runs.
// Proof: isolated Git workspaces, the installed Changesets CLI and intercepted
// registry queries below. No npm publication or GitHub mutation is performed.
// Prior checks paired CLI/action versions (CS1) and required a www bump (WR1),
// but neither checked track ownership or semantic release transitions.
const cli = createRequire(import.meta.url).resolve("@changesets/cli/bin.js")
const detector = fileURLToPath(new URL("./track.mjs", import.meta.url))
function fixture(t) {
  const previous = process.cwd()
  const env = { ...process.env }
  const cwd = mkdtempSync(join(tmpdir(), "release-tracks-"))
  process.chdir(cwd)
  t.after(() => {
    process.chdir(previous)
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key]
    Object.assign(process.env, env)
    rmSync(cwd, { recursive: true, force: true })
  })
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim()
  const write = (file, value) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      typeof value === "string" ? value : JSON.stringify(value, null, 2)
    )
  }
  const json = (file) => JSON.parse(readFileSync(file, "utf8"))
  const bump = (file, extra = {}) =>
    write(file, { ...json(file), version: "1.0.1", ...extra })
  const commit = () => {
    git("add", ".")
    git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "any title")
    return git("rev-parse", "HEAD")
  }
  git("init", "-q")
  git("config", "user.name", "Fixture")
  git("config", "user.email", "fixture@example.com")
  write(
    "pnpm-workspace.yaml",
    'packages:\n  - packages/*\n  - crates/*\n  - apps/*\noverrides:\n  dependency: "1.0.0"\n'
  )
  write("package.json", {
    name: "fixture-root",
    private: true,
    packageManager: "npm@10.0.0",
  })
  write(".changeset/config.json", {
    changelog: false,
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
    privatePackages: { version: true, tag: false },
  })
  for (const [dir, name] of [
    ["packages/a", "node-a"],
    ["packages/b", "node-b"],
    ["crates/a", "wasm-a"],
    ["crates/b", "wasm-b"],
    ["apps/www", "www"],
    ["extensions/a", "extension-a"],
  ]) {
    write(`${dir}/package.json`, {
      name,
      version: "1.0.0",
      ...(dir === "packages/a" ? { dependencies: { "wasm-a": "1.0.0" } } : {}),
    })
    write(`${dir}/source.js`, "old source\n")
    if (dir.startsWith("crates/"))
      write(`${dir}/Cargo.toml`, '[package]\nversion = "1.0.0"\n')
  }
  const base = commit()
  const intent = (id, names) =>
    write(
      `.changeset/${id}.md`,
      `---\n${names.map((name) => `"${name}": patch`).join("\n")}\n---\n\nFixture change.\n`
    )
  const plan = (track, extra = {}) => {
    const output = join(cwd, ".git", "plan")
    rmSync(output, { force: true })
    execFileSync(process.execPath, [detector, track, "detect"], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        EVENT_NAME: "push",
        BASE_SHA: base,
        ...extra,
      },
    })
    return Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const index = line.indexOf("=")
          return [line.slice(0, index), line.slice(index + 1)]
        })
    )
  }
  return { cwd, base, git, write, json, bump, commit, intent, plan }
}

for (const track of Object.keys(policy)) {
  test(`RT1: real Changesets versions only ${track}; other intents and pins survive`, async (t) => {
    const f = fixture(t)
    f.intent("node", ["node-a"])
    f.intent("wasm", ["wasm-a"])
    f.intent("docker", ["www"])
    const before = new Map(
      ["pnpm-workspace.yaml", ".changeset/config.json"].map((file) => [
        file,
        readFileSync(file, "utf8"),
      ])
    )
    await scoped(track, "version")
    const owned = { node: "packages/a", wasm: "crates/a", docker: "apps/www" }
    for (const [name, dir] of Object.entries(owned)) {
      assert.equal(
        f.json(`${dir}/package.json`).version,
        name === track ? "1.0.1" : "1.0.0"
      )
      assert.equal(existsSync(`.changeset/${name}.md`), name !== track)
    }
    assert.equal(
      f.json("packages/a/package.json").dependencies["wasm-a"],
      "1.0.0"
    )
    assert.equal(f.json("extensions/a/package.json").version, "1.0.0")
    for (const [file, value] of before)
      assert.equal(readFileSync(file, "utf8"), value)
  })
}

test("RT1: mixed-track intent is rejected before any workspace change", async (t) => {
  const f = fixture(t)
  f.intent("mixed", ["node-a", "wasm-a"])
  const workspace = readFileSync("pnpm-workspace.yaml", "utf8")
  await assert.rejects(scoped("wasm", "version"), /mixes release tracks/)
  assert.equal(readFileSync("pnpm-workspace.yaml", "utf8"), workspace)
  assert.ok(existsSync(".changeset/mixed.md"))
})

test("RT1: foreign-only intent is not consumed", async (t) => {
  const f = fixture(t)
  f.intent("foreign", ["wasm-a"])
  await scoped("node", "version", () =>
    assert.fail("No owned intent should execute Changesets")
  )
  assert.ok(existsSync(".changeset/foreign.md"))
})

test("RT1: failure restores hidden intents, workspace and config exactly", async (t) => {
  const f = fixture(t)
  f.intent("own", ["wasm-a"])
  f.intent("foreign", ["node-a"])
  const before = new Map(
    [
      "pnpm-workspace.yaml",
      ".changeset/config.json",
      ".changeset/foreign.md",
    ].map((file) => [file, readFileSync(file, "utf8")])
  )
  await assert.rejects(
    scoped("wasm", "version", ({ owned }) => {
      assert.deepEqual(
        owned.map((pkg) => pkg.name),
        ["wasm-a", "wasm-b"]
      )
      assert.ok(!existsSync(".changeset/foreign.md"))
      throw new Error("Injected failure")
    }),
    /Injected failure/
  )
  for (const [file, value] of before)
    assert.equal(readFileSync(file, "utf8"), value)
})

for (const request of [
  [{ name: "node-a", version: "1.0.0" }],
  [{ name: "wasm-a", version: "9.0.0" }],
]) {
  test(`RT1: reject foreign/stale WASM publish ${JSON.stringify(request)}`, async (t) => {
    fixture(t)
    process.env.PUBLISH_PACKAGES = JSON.stringify(request)
    await assert.rejects(
      scoped("wasm", "publish", () => assert.fail("must not publish")),
      /outside wasm or has a stale version/
    )
  })
}

test("RT1: real CLI registry queries stay inside the requested publish subset", async (t) => {
  const f = fixture(t)
  // All requested versions already exist: the real CLI queries the fake npm,
  // sees no publication needed, and cannot reach a registry or publish a tag.
  f.write(
    "bin/pnpm",
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 12.9.0; exit; fi\nprintf "%s\\n" "$*" >> "$QUERY_LOG"\nprintf \'{"version":"1.0.0","versions":["1.0.0"],"dist-tags":{"latest":"1.0.0"}}\\n\'\n'
  )
  chmodSync("bin/pnpm", 0o755)
  process.env.PATH = `${join(f.cwd, "bin")}:${process.env.PATH}`
  process.env.QUERY_LOG = join(f.cwd, "queries")
  process.env.PUBLISH_PACKAGES = JSON.stringify([
    { name: "wasm-a", version: "1.0.0" },
  ])
  await scoped("wasm", "publish", () =>
    execFileSync(process.execPath, [cli, "publish"], { stdio: "inherit" })
  )
  const queries = readFileSync("queries", "utf8").trim().split("\n")
  assert.ok(queries.length > 0)
  assert.ok(
    queries.every((query) => /^info wasm-a(?:@1\.0\.0)? --json$/.test(query)),
    queries.join("\n")
  )
})

test("RT1: all tracks' version/changelog bookkeeping is semantically empty", (t) => {
  const f = fixture(t)
  for (const dir of ["packages/a", "crates/a", "apps/www"]) {
    f.bump(`${dir}/package.json`)
    f.write(`${dir}/CHANGELOG.md`, "New release\n")
  }
  f.commit()
  assert.deepEqual(sourceFiles(f.base), [])
  assert.equal(f.plan("docker").release_mode, "publish")
  assert.equal(f.plan("node").release_mode, "publish")
  assert.equal(f.plan("wasm").has_sources, "false")
})

test("RT1: foreign metadata creates no Docker or WASM source release", (t) => {
  const f = fixture(t)
  f.bump("packages/a/package.json")
  f.write("packages/a/CHANGELOG.md", "Release\n")
  f.commit()
  assert.equal(f.plan("docker").release_mode, "skip")
  assert.equal(f.plan("wasm").has_changes, "false")
})

test("RT1: dependency adoption still requests a source release", (t) => {
  const f = fixture(t)
  f.write("packages/a/package.json", {
    ...f.json("packages/a/package.json"),
    dependencies: { "wasm-a": "1.0.1" },
  })
  f.commit()
  assert.equal(f.plan("docker").release_mode, "release-pr")
  assert.deepEqual(sourceFiles(f.base), ["packages/a/package.json"])
})

test("RT1: a mixed push publishes bumped crates and versions source-only crates", (t) => {
  const f = fixture(t)
  f.bump("crates/a/package.json")
  f.commit()
  f.write("crates/b/source.js", "new source\n")
  f.commit()
  const plan = f.plan("wasm")
  assert.deepEqual(JSON.parse(plan.matrix).include, [
    { crate_name: "a", mode: "publish" },
    { crate_name: "b", mode: "source" },
  ])
  assert.equal(plan.has_sources, "true")
  assert.equal(plan.has_releases, "true")
  assert.deepEqual(JSON.parse(plan.publish_packages), [
    { name: "wasm-a", version: "1.0.1" },
  ])
})

test("RT1: Node intent additions request versioning; consumed intent removals do not", (t) => {
  const f = fixture(t)
  f.intent("node", ["node-a"])
  const withIntent = f.commit()
  assert.equal(f.plan("node").release_mode, "release-pr")
  f.git("rm", ".changeset/node.md")
  f.commit()
  assert.equal(f.plan("node", { BASE_SHA: withIntent }).release_mode, "skip")
})

test("RT1: a later version suppresses an older queued WASM source run", (t) => {
  const f = fixture(t)
  f.write("crates/a/source.js", "new source\n")
  const source = f.commit()
  f.bump("crates/a/package.json")
  const released = f.commit()
  f.git("update-ref", "refs/remotes/origin/main", released)
  f.git("checkout", "--quiet", source)
  assert.equal(
    f.plan("wasm", { CHECK_LATEST: "true", HEAD_SHA: source }).has_changes,
    "false"
  )
})

test("RT1: dispatch and publish-only retry have distinct owned scopes", (t) => {
  const f = fixture(t)
  assert.equal(
    f.plan("wasm", { EVENT_NAME: "workflow_dispatch", BASE_SHA: "" })
      .has_sources,
    "true"
  )
  const retry = f.plan("wasm", {
    EVENT_NAME: "workflow_dispatch",
    BASE_SHA: "",
    PUBLISH_ONLY: "true",
  })
  assert.equal(retry.has_sources, "false")
  assert.equal(retry.has_releases, "true")
  assert.deepEqual(
    JSON.parse(retry.publish_packages).map((pkg) => pkg.name),
    ["wasm-a", "wasm-b"]
  )
})

test("RT1: policy branches and writer groups are distinct and fixed across refs", () => {
  assert.equal(
    new Set(Object.values(policy).map((rule) => rule.branch)).size,
    3
  )
  const root = fileURLToPath(new URL("../../", import.meta.url))
  const groups = []
  for (const [track, workflow] of [
    ["node", "release"],
    ["wasm", "wasm-release"],
    ["docker", "www-docker-release"],
  ]) {
    const text = readFileSync(
      join(root, `.github/workflows/${workflow}.yml`),
      "utf8"
    )
    assert.ok(text.includes(policy[track].branch))
    const group = text.match(/^concurrency:\n +group: ([^\n]+)/m)?.[1]
    assert.ok(
      group && !group.includes("${{"),
      "A fixed release branch needs a group shared across dispatch refs"
    )
    groups.push(group)
  }
  assert.equal(new Set(groups).size, 3)
})

for (const change of ["script", "addition", "deletion", "rename"]) {
  test(`RT1: release metadata mixed with ${change} remains a source change`, (t) => {
    const f = fixture(t)
    f.bump("apps/www/package.json")
    if (change === "script")
      f.bump("apps/www/package.json", { scripts: { build: "new build" } })
    if (change === "addition") f.write("apps/www/new.js", "new source\n")
    if (change === "deletion") f.git("rm", "crates/a/package.json")
    if (change === "rename")
      f.git("mv", "packages/a/source.js", "packages/a/renamed.js")
    f.commit()
    assert.ok(sourceFiles(f.base).length > 0)
  })
}

test("RT1: initial pushes remain conservative and unavailable history fails", (t) => {
  const f = fixture(t)
  assert.equal(sourceFiles("0".repeat(40)), null)
  assert.throws(() => sourceFiles("1".repeat(40)))
  assert.equal(
    f.plan("docker", { BASE_SHA: "0".repeat(40) }).release_mode,
    "release-pr"
  )
})

test("RT1: publication finalization preserves remote tags and recovers a missing GitHub Release", () => {
  const calls = []
  finalizePublications(
    [{ name: "wasm-a", version: "1.0.1" }],
    [{ name: "wasm-a", version: "1.0.1" }],
    (command, args) => {
      calls.push([command, ...args])
      if (args[0] === "ls-remote") return "existing-tag\n"
      if (command === "gh" && args[1] === "view")
        throw new Error("Not yet created")
      return ""
    }
  )
  assert.ok(calls.some((call) => call[1] === "fetch"))
  assert.ok(!calls.some((call) => call[1] === "tag"))
  assert.deepEqual(calls.at(-1), [
    "gh",
    "release",
    "create",
    "wasm-a@1.0.1",
    "--verify-tag",
    "--generate-notes",
  ])
})

test("RT1: publication finalization restores a missing tag and skips private packages", () => {
  const calls = []
  finalizePublications(
    [
      { name: "wasm-a", version: "1.0.1" },
      { name: "private", version: "1.0.1", private: true },
    ],
    [
      { name: "wasm-a", version: "1.0.1" },
      { name: "private", version: "1.0.1" },
    ],
    (command, args) => {
      calls.push([command, ...args])
      return ""
    }
  )
  assert.ok(calls.some((call) => call.join(" ") === "git tag wasm-a@1.0.1"))
  assert.ok(calls.every((call) => !call.some((arg) => arg.includes("private"))))
  assert.throws(
    () => finalizePublications([], [{ name: "foreign", version: "1" }]),
    /outside the requested track/
  )
})

test("RT1: refreshing a WASM release preserves earlier pending crate bumps", async (t) => {
  const f = fixture(t)
  f.intent("first", ["wasm-a"])
  await scoped("wasm", "version")
  const pending = f.commit()
  f.git("update-ref", "refs/remotes/origin/changeset-release/wasm", pending)
  f.git("reset", "--hard", f.base)
  f.intent("second", ["wasm-b"])
  process.env.PREVIOUS_RELEASE_REF =
    "refs/remotes/origin/changeset-release/wasm"
  await scoped("wasm", "version")
  assert.equal(f.json("crates/a/package.json").version, "1.0.1")
  assert.equal(f.json("crates/b/package.json").version, "1.0.1")
})

test("RT1: already-merged pending versions are not requested again", async (t) => {
  const f = fixture(t)
  f.bump("crates/a/package.json")
  const merged = f.commit()
  f.git("update-ref", "refs/remotes/origin/changeset-release/wasm", merged)
  f.intent("next", ["wasm-b"])
  process.env.PREVIOUS_RELEASE_REF =
    "refs/remotes/origin/changeset-release/wasm"
  await scoped("wasm", "version")
  assert.equal(f.json("crates/a/package.json").version, "1.0.1")
  assert.equal(f.json("crates/b/package.json").version, "1.0.1")
})

test("RT1: a new patch intent cannot lower a pending WASM minor release", async (t) => {
  const f = fixture(t)
  f.write(
    ".changeset/minor.md",
    '---\n"wasm-a": minor\n---\n\nMinor release.\n'
  )
  await scoped("wasm", "version")
  const pending = f.commit()
  f.git("update-ref", "refs/remotes/origin/changeset-release/wasm", pending)
  f.git("reset", "--hard", f.base)
  f.intent("patch", ["wasm-a"])
  process.env.PREVIOUS_RELEASE_REF =
    "refs/remotes/origin/changeset-release/wasm"
  await scoped("wasm", "version")
  assert.equal(f.json("crates/a/package.json").version, "1.1.0")
})
