// node --test apps/mobile/review
//
// The review's parsers and rules, on inputs built here, since the sandbox
// that writes them has no Android SDK to produce real ones. CI runs these
// before the review itself (.github/workflows/_mobile-review.yml).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  elfLoadAlignments,
  lintIssues,
  manifestFacts,
  PAGE_16K,
  parseSignerDigests,
  parseXml,
  readZip,
  reviewElf,
  reviewLint,
  reviewManifest,
  reviewSigner,
  reviewTargetSdk,
  reviewVersionCode,
  reviewZipAlignment,
  sizeBreakdown,
} from "./checks.mjs"

const policy = JSON.parse(
  readFileSync(new URL("./policy.json", import.meta.url), "utf8")
)

// A merged manifest shaped like `apkanalyzer manifest print` output.
const manifest = ({
  permissions = [],
  extraApp = "",
  appAttrs = "",
} = {}) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    android:versionCode="7" android:versionName="0.1.7+abc" package="dev.paulgsc.someui">
  <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="35" />
  ${permissions.map((p) => `<uses-permission android:name="${p}" />`).join("\n  ")}
  <application android:allowBackup="true" android:usesCleartextTraffic="true" ${appAttrs}>
    <!-- a comment with <tags> in it -->
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
      </intent-filter>
    </activity>
    <provider android:name="androidx.core.content.FileProvider" android:exported="false" />
    ${extraApp}
  </application>
</manifest>`

const allowedPermissions = Object.keys(policy.permissions).map((p) =>
  p.replaceAll("${applicationId}", "dev.paulgsc.someui")
)

const facts = (opts) =>
  manifestFacts(
    parseXml(manifest({ permissions: allowedPermissions, ...opts }))
  )

const levels = (findings) => findings.map((f) => `${f.level}:${f.check}`)

test("parseXml reads attributes, entities and nesting, and skips comments", () => {
  const doc = parseXml(
    `<?xml version="1.0"?><a x="1 &amp; 2" y='&lt;b&gt;'><!-- <c/> --><b/><b z="&#x41;"></b></a>`
  )
  const [a] = doc.children
  assert.deepEqual(a.attrs, { x: "1 & 2", y: "<b>" })
  assert.deepEqual(
    a.children.map((c) => c.attrs),
    [{}, { z: "A" }]
  )
  assert.throws(() => parseXml("<a><b></a>"), /closes/)
  assert.throws(() => parseXml("<a>"), /never closed/)
})

test("manifestFacts qualifies names and reads the flags", () => {
  const f = facts()
  assert.equal(f.applicationId, "dev.paulgsc.someui")
  assert.equal(f.versionCode, 7)
  assert.equal(f.targetSdk, 35)
  assert.equal(f.application.allowBackup, true)
  assert.equal(f.application.debuggable, undefined)
  const main = f.components.find(
    (c) => c.name === "dev.paulgsc.someui.MainActivity"
  )
  assert.deepEqual(
    { exported: main.exported, hasIntentFilter: main.hasIntentFilter },
    { exported: true, hasIntentFilter: true }
  )
})

test("reviewManifest passes the manifest policy.json describes", () => {
  assert.deepEqual(reviewManifest(facts(), policy, "debug"), [])
})

test("reviewManifest fails an unlisted permission, a stale one, and a restricted one without a declaration", () => {
  const extra = facts({
    permissions: [
      ...allowedPermissions,
      "android.permission.SCHEDULE_EXACT_ALARM",
    ],
  })
  const findings = reviewManifest(extra, policy, "debug")
  assert.ok(
    findings.some(
      (f) => f.check === "permissions" && /not in policy\.json/.test(f.message)
    )
  )
  assert.ok(findings.some((f) => /restricted on Google Play/.test(f.message)))

  const missing = facts({ permissions: allowedPermissions.slice(1) })
  assert.ok(
    reviewManifest(missing, policy, "debug").some((f) =>
      /no longer has/.test(f.message)
    )
  )
})

test("reviewManifest matches a restricted prefix like FOREGROUND_SERVICE_*", () => {
  const withFgs = facts({
    permissions: [
      ...allowedPermissions,
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
    ],
  })
  assert.ok(
    reviewManifest(withFgs, policy, "debug").some((f) =>
      /restricted on Google Play/.test(f.message)
    )
  )
})

test("reviewManifest fails an unlisted exported component and an implicit export", () => {
  const f = facts({
    extraApp: `<receiver android:name="x.Leaky" android:exported="true" />
    <service android:name="x.Implicit"><intent-filter><action android:name="a" /></intent-filter></service>`,
  })
  const messages = reviewManifest(f, policy, "debug").map((x) => x.message)
  assert.ok(messages.some((m) => /x\.Leaky is exported/.test(m)))
  assert.ok(
    messages.some((m) =>
      /x\.Implicit has an intent-filter and no android:exported/.test(m)
    )
  )
})

test("reviewManifest holds the recorded flags in both directions, and release to non-debuggable", () => {
  const off = manifestFacts(
    parseXml(
      manifest({ permissions: allowedPermissions }).replace(
        'android:usesCleartextTraffic="true"',
        ""
      )
    )
  )
  assert.deepEqual(levels(reviewManifest(off, policy, "debug")), [
    "error:flags",
  ])

  const debuggable = facts({ appAttrs: 'android:debuggable="true"' })
  assert.deepEqual(reviewManifest(debuggable, policy, "debug"), [])
  assert.deepEqual(levels(reviewManifest(debuggable, policy, "release")), [
    "error:release",
  ])
})

test("reviewManifest fails a changed applicationId", () => {
  const f = { ...facts(), applicationId: "dev.paulgsc.other" }
  assert.deepEqual(levels(reviewManifest(f, policy, "debug")), [
    "error:identity",
  ])
})

test("reviewTargetSdk: warning inside the extension window, error after, notice ahead", () => {
  const schedule = {
    source: "s",
    rows: [
      { from: "2026-08-31", level: 36, extensionUntil: "2026-11-01" },
      { from: "2027-08-31", level: 37 },
    ],
  }
  const on = (iso) => new Date(`${iso}T12:00:00Z`)
  assert.deepEqual(levels(reviewTargetSdk(35, schedule, on("2026-09-30"))), [
    "warning:target-sdk",
    "notice:target-sdk",
  ])
  assert.deepEqual(levels(reviewTargetSdk(35, schedule, on("2026-11-02"))), [
    "error:target-sdk",
    "notice:target-sdk",
  ])
  assert.deepEqual(levels(reviewTargetSdk(36, schedule, on("2026-11-02"))), [
    "notice:target-sdk",
  ])
  assert.deepEqual(levels(reviewTargetSdk(37, schedule, on("2026-11-02"))), [])
  assert.deepEqual(levels(reviewTargetSdk(37, schedule, on("2028-09-01"))), [
    "error:target-sdk",
  ])
})

test("reviewVersionCode: must rise above every retained build, within Play's ceiling", () => {
  assert.deepEqual(reviewVersionCode(8, []), [])
  assert.deepEqual(reviewVersionCode(8, [{ versionCode: 7, label: "a" }]), [])
  assert.deepEqual(
    levels(reviewVersionCode(7, [{ versionCode: 7, label: "a" }])),
    ["error:version-code"]
  )
  assert.deepEqual(
    levels(
      reviewVersionCode(3, [
        { versionCode: 2, label: "a" },
        { versionCode: 9, label: "b" },
      ])
    ),
    ["error:version-code"]
  )
  assert.deepEqual(levels(reviewVersionCode(2_100_000_001, [])), [
    "error:version-code",
  ])
})

test("parseSignerDigests and reviewSigner", () => {
  const out = `Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
Signer #1 certificate DN: CN=some-ui
Signer #1 certificate SHA-256 digest: AB12cd
Signer #1 certificate SHA-1 digest: ffff
`
  const digests = parseSignerDigests(out)
  assert.deepEqual(digests, ["ab12cd"])
  assert.deepEqual(reviewSigner("x", digests, "AB:12:CD"), [])
  assert.deepEqual(levels(reviewSigner("x", digests, "00")), ["error:signing"])
  assert.deepEqual(levels(reviewSigner("x", digests, null)), ["error:signing"])
})

// ── ZIP: a stored entry whose data offset we control through the extra field.

function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data, method = 0, pad = 0 } of files) {
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(pad, 28)
    locals.push(local, nameBytes, Buffer.alloc(pad), data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + pad + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]))
}

test("readZip finds each entry's data offset; reviewZipAlignment wants stored and 16 KB-aligned", () => {
  const name = "lib/arm64-v8a/libx.so"
  const first = { name: "AndroidManifest.xml", data: Buffer.alloc(100) }
  const firstLen = 30 + first.name.length + 100
  const aligned = PAGE_16K - firstLen - 30 - name.length
  const entries = readZip(
    zip([first, { name, data: Buffer.alloc(8), pad: aligned }])
  )
  assert.equal(entries[1].dataOffset, PAGE_16K)
  assert.deepEqual(reviewZipAlignment("apk", entries), [])

  const off = readZip(
    zip([first, { name, data: Buffer.alloc(8), pad: aligned - 4 }])
  )
  assert.deepEqual(levels(reviewZipAlignment("apk", off)), ["error:16kb"])

  const deflated = readZip(zip([{ name, data: Buffer.alloc(8), method: 8 }]))
  assert.deepEqual(levels(reviewZipAlignment("apk", deflated)), ["error:16kb"])
})

test("sizeBreakdown groups by top-level directory, dex files together", () => {
  const groups = sizeBreakdown([
    { name: "lib/arm64-v8a/a.so", compressedSize: 5 },
    { name: "assets/public/x.js", compressedSize: 3 },
    { name: "assets/public/y.js", compressedSize: 4 },
    { name: "classes.dex", compressedSize: 1 },
    { name: "classes2.dex", compressedSize: 1 },
  ])
  assert.deepEqual(groups, [
    { group: "assets/", bytes: 7 },
    { group: "lib/", bytes: 5 },
    { group: "classes*.dex", bytes: 2 },
  ])
})

// ── ELF: a header plus program headers, 64- and 32-bit.

function elf({ is64, aligns }) {
  const ehsize = is64 ? 64 : 52
  const phentsize = is64 ? 56 : 32
  const buf = Buffer.alloc(ehsize + phentsize * aligns.length)
  buf.writeUInt32BE(0x7f454c46, 0)
  buf[4] = is64 ? 2 : 1
  buf[5] = 1
  if (is64) {
    buf.writeBigUInt64LE(BigInt(ehsize), 0x20)
    buf.writeUInt16LE(phentsize, 0x36)
    buf.writeUInt16LE(aligns.length, 0x38)
  } else {
    buf.writeUInt32LE(ehsize, 0x1c)
    buf.writeUInt16LE(phentsize, 0x2a)
    buf.writeUInt16LE(aligns.length, 0x2c)
  }
  aligns.forEach(([type, align], i) => {
    const h = ehsize + i * phentsize
    buf.writeUInt32LE(type, h)
    if (is64) buf.writeBigUInt64LE(BigInt(align), h + 0x30)
    else buf.writeUInt32LE(align, h + 0x1c)
  })
  return new Uint8Array(buf)
}

test("elfLoadAlignments reads PT_LOAD alignment only, 64- and 32-bit", () => {
  assert.deepEqual(
    elfLoadAlignments(
      elf({
        is64: true,
        aligns: [
          [1, 0x4000],
          [2, 8],
          [1, 0x1000],
        ],
      })
    ),
    [0x4000, 0x1000]
  )
  assert.deepEqual(
    elfLoadAlignments(elf({ is64: false, aligns: [[1, 0x1000]] })),
    [0x1000]
  )
  assert.throws(() => elfLoadAlignments(new Uint8Array(64)), /not an ELF/)
})

test("reviewElf holds 64-bit ABIs to 16 KB and leaves 32-bit ones alone", () => {
  assert.deepEqual(
    reviewElf("apk", "lib/arm64-v8a/a.so", [0x4000, 0x10000]),
    []
  )
  assert.deepEqual(
    levels(reviewElf("apk", "lib/arm64-v8a/a.so", [0x4000, 0x1000])),
    ["error:16kb"]
  )
  assert.deepEqual(levels(reviewElf("aab", "base/lib/x86_64/a.so", [])), [
    "error:16kb",
  ])
  assert.deepEqual(reviewElf("apk", "lib/armeabi-v7a/a.so", [0x1000]), [])
})

test("lintIssues and reviewLint: report-only until gated", () => {
  const issues = lintIssues(
    parseXml(`<issues format="6" by="lint 8.7.2">
  <issue id="ExpiredTargetSdkVersion" severity="Fatal" message="m" category="Compliance">
    <location file="build.gradle" line="3" column="1"/>
  </issue>
  <issue id="GradleDependency" severity="Warning" message="w"><location file="b"/></issue>
</issues>`)
  )
  assert.deepEqual(issues[0], {
    id: "ExpiredTargetSdkVersion",
    severity: "Fatal",
    message: "m",
    file: "build.gradle",
    line: "3",
  })
  assert.deepEqual(levels(reviewLint(issues, { gate: false })), [
    "warning:lint",
  ])
  assert.deepEqual(levels(reviewLint(issues, { gate: true })), ["error:lint"])
  assert.deepEqual(reviewLint(issues.slice(1), { gate: true }), [])
})
