#!/usr/bin/env node
// The Play-readiness review of one CI build of the Android app.
//
// Not a copy of Play's review: a check on the drift that would be costly to
// undo if the app ever goes through it (apps/mobile/README.md, "Play
// readiness"). Run by .github/workflows/_mobile-review.yml on the outputs of
// mobile-apk.yml's build job; the rules themselves are in checks.mjs and the
// values they hold the build to are in policy.json.
//
// Usage:
//   node apps/mobile/review/review.mjs <inputs-dir> [--previous <dir>]
//
// <inputs-dir> holds debug.apk, release.apk, release.aab, mapping.txt and
// lint-results.xml. --previous holds earlier builds' APKs, whose versionCode
// this one must exceed.
//
// Invariants a person checks (apps/mobile/README.md, "Play readiness"):
//   P1  policy.json's pinned applicationId and signing certificate never change.
//   P2  every reason in policy.json is true.
//
// SDK tools come from $ANDROID_HOME (the newest build-tools, and
// cmdline-tools/latest for apkanalyzer), as ubuntu-latest installs them.
import { execFileSync, spawnSync } from "node:child_process"
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import { inflateRawSync } from "node:zlib"

import {
  elfLoadAlignments,
  lintIssues,
  manifestFacts,
  parseSignerDigests,
  parseXml,
  readZip,
  reviewElf,
  reviewLint,
  reviewManifest,
  reviewSigner,
  reviewSize,
  reviewTargetSdk,
  reviewVersionCode,
  reviewZipAlignment,
  sizeBreakdown,
} from "./checks.mjs"

const args = process.argv.slice(2)
const inputs = args[0]
const previousDir = args.includes("--previous")
  ? args[args.indexOf("--previous") + 1]
  : undefined
if (!inputs)
  throw new Error("usage: review.mjs <inputs-dir> [--previous <dir>]")

const policy = JSON.parse(
  readFileSync(new URL("./policy.json", import.meta.url), "utf8")
)

// ── SDK tools ─────────────────────────────────────────────────────────────

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
if (!sdk) throw new Error("ANDROID_HOME is not set")
const versionKey = (v) =>
  v
    .split(/[.-]/)
    .map((n) => n.padStart(6, "0"))
    .join(".")
const buildTools = join(
  sdk,
  "build-tools",
  readdirSync(join(sdk, "build-tools"))
    .sort((a, b) => versionKey(a).localeCompare(versionKey(b)))
    .at(-1)
)
const tool = {
  apksigner: join(buildTools, "apksigner"),
  zipalign: join(buildTools, "zipalign"),
  apkanalyzer: join(sdk, "cmdline-tools", "latest", "bin", "apkanalyzer"),
}
for (const [name, path] of Object.entries(tool)) {
  if (!existsSync(path)) throw new Error(`${name} not found at ${path}`)
}
const run = (cmd, argv) =>
  execFileSync(cmd, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

// ── Collect findings ──────────────────────────────────────────────────────

const findings = []
const add = (list) => findings.push(...list)
const summary = []

const file = (name) => join(inputs, name)
const need = (name) => {
  if (existsSync(file(name))) return true
  add([
    {
      level: "error",
      check: "inputs",
      message: `${name} is missing from the build's review inputs.`,
    },
  ])
  return false
}

const facts = {}
for (const variant of ["debug", "release"]) {
  const apk = file(`${variant}.apk`)
  if (!need(`${variant}.apk`)) continue
  const label = `${variant}.apk`

  // Manifest, as merged from the app and every library.
  facts[variant] = manifestFacts(
    parseXml(run(tool.apkanalyzer, ["manifest", "print", apk]))
  )
  add(reviewManifest(facts[variant], policy, variant))

  // Signing: the one pinned key, on both.
  const signers = spawnSync(tool.apksigner, ["verify", "--print-certs", apk], {
    encoding: "utf8",
  })
  if (signers.status !== 0) {
    add([
      {
        level: "error",
        check: "signing",
        message: `${label} does not verify: ${signers.stderr.trim()}`,
      },
    ])
  } else if (parseSignerDigests(signers.stdout).length === 0) {
    // It verified, so it is signed: an empty parse means apksigner's output
    // changed shape again, which is not the same finding as "unsigned".
    add([
      {
        level: "error",
        check: "signing",
        message: `${label} verifies, but no certificate digest could be read from apksigner's output (${tool.apksigner}): ${signers.stdout.trim().split("\n").slice(0, 4).join(" | ")}`,
      },
    ])
  } else {
    add(
      reviewSigner(
        label,
        parseSignerDigests(signers.stdout),
        policy.identity.signingCertSha256
      )
    )
  }

  // 16 KB: the libraries' own segments, and where the APK stores them.
  const bytes = readFileSync(apk)
  const entries = readZip(bytes)
  add(reviewZipAlignment(label, entries))
  const zipalign = spawnSync(
    tool.zipalign,
    ["-c", "-P", "16", "-v", "4", apk],
    { encoding: "utf8" }
  )
  if (zipalign.status !== 0) {
    const tail = zipalign.stdout.trim().split("\n").slice(-3).join(" / ")
    add([
      {
        level: "error",
        check: "16kb",
        message: `${label}: zipalign -c -P 16 fails: ${tail}`,
      },
    ])
  }
  add(reviewNativeLibs(label, bytes, entries, /^lib\/[^/]+\/[^/]+\.so$/))

  const mib = (n) => `${(n / (1024 * 1024)).toFixed(2)} MiB`
  const size = statSync(apk).size
  add(reviewSize(label, size, policy.size))
  const download = run(tool.apkanalyzer, ["apk", "download-size", apk]).trim()
  summary.push(
    `**${label}**: ${mib(size)} on disk, ${mib(Number(download))} to download; versionCode ${facts[variant].versionCode}, targetSdk ${facts[variant].targetSdk}.`,
    "",
    "| Group | Compressed |",
    "| --- | ---: |",
    ...sizeBreakdown(entries).map(
      (g) => `| \`${g.group}\` | ${mib(g.bytes)} |`
    ),
    ""
  )
}

function reviewNativeLibs(label, bytes, entries, pattern) {
  const out = []
  for (const e of entries.filter((e) => pattern.test(e.name))) {
    const raw = bytes.subarray(e.dataOffset, e.dataOffset + e.compressedSize)
    const so = e.method === 0 ? raw : inflateRawSync(raw)
    out.push(...reviewElf(label, e.name, elfLoadAlignments(so)))
  }
  return out
}

// The app bundle: what Play would take. Its libraries face the same rule.
if (need("release.aab")) {
  const bytes = readFileSync(file("release.aab"))
  add(
    reviewNativeLibs(
      "release.aab",
      bytes,
      readZip(bytes),
      /^[^/]+\/lib\/[^/]+\/[^/]+\.so$/
    )
  )
}

// R8 ran on the release build: it leaves a mapping of what it renamed.
if (need("mapping.txt") && statSync(file("mapping.txt")).size === 0) {
  add([
    {
      level: "error",
      check: "release",
      message: "mapping.txt is empty: R8 did not shrink the release build.",
    },
  ])
}

if (
  facts.debug &&
  facts.release &&
  facts.debug.versionCode !== facts.release.versionCode
) {
  add([
    {
      level: "error",
      check: "version-code",
      message: `debug and release disagree on versionCode (${facts.debug.versionCode} vs ${facts.release.versionCode}).`,
    },
  ])
}

const built = facts.release ?? facts.debug
if (built) {
  add(reviewTargetSdk(built.targetSdk, policy.targetSdk, new Date()))

  const previous = []
  if (previousDir && existsSync(previousDir)) {
    for (const name of readdirSync(previousDir).filter((n) =>
      n.endsWith(".apk")
    )) {
      const f = manifestFacts(
        parseXml(
          run(tool.apkanalyzer, ["manifest", "print", join(previousDir, name)])
        )
      )
      previous.push({ versionCode: f.versionCode, label: name })
    }
  }
  if (!previous.length) {
    add([
      {
        level: "notice",
        check: "version-code",
        message: "No earlier APK is retained to compare versionCode against.",
      },
    ])
  }
  add(reviewVersionCode(built.versionCode, previous))
}

if (existsSync(file("lint-results.xml"))) {
  const issues = lintIssues(
    parseXml(readFileSync(file("lint-results.xml"), "utf8"))
  )
  add(reviewLint(issues, policy.lint))
  const bySeverity = new Map()
  for (const i of issues)
    bySeverity.set(i.severity, (bySeverity.get(i.severity) ?? 0) + 1)
  summary.push(
    `**Android Lint**: ${[...bySeverity].map(([s, n]) => `${n} ${s}`).join(", ") || "clean"}.`,
    ""
  )
  const blocking = issues.filter(
    (i) => i.severity === "Error" || i.severity === "Fatal"
  )
  if (blocking.length) {
    summary.push(
      "| Lint error | Where |",
      "| --- | --- |",
      ...blocking.map(
        (i) =>
          `| \`${i.id}\`: ${i.message.replaceAll("|", "\\|")} | ${i.file ?? ""}${i.line ? `:${i.line}` : ""} |`
      ),
      ""
    )
  }
} else {
  // Once gated, no report is a failure too: a Lint step that crashed must not
  // pass as a clean one.
  add([
    {
      level: policy.lint.gate ? "error" : "warning",
      check: "lint",
      message:
        "lint-results.xml is missing: Android Lint did not run or did not report.",
    },
  ])
}

// ── Report ────────────────────────────────────────────────────────────────

const escape = (s) =>
  s.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")
for (const f of findings) {
  process.stdout.write(
    `::${f.level} title=Play readiness: ${f.check}::${escape(f.message)}\n`
  )
}

const icon = { error: "❌", warning: "⚠️", notice: "ℹ️" }
const lines = [
  "## Play readiness",
  "",
  findings.length
    ? findings
        .map((f) => `- ${icon[f.level]} **${f.check}**: ${f.message}`)
        .join("\n")
    : "- ✅ Nothing to report.",
  "",
  ...summary,
]
const report = `${lines.join("\n")}\n`
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
else process.stdout.write(report)

if (findings.some((f) => f.level === "error")) process.exitCode = 1
