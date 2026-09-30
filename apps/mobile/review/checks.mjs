// The pure half of the Play-readiness review (review.mjs is the CLI half).
//
// Every function here takes bytes or text and returns facts or findings, so
// checks.test.mjs can run each one in the Claude Code sandbox, which has no
// Android SDK. Nothing here spawns a process or reads a file.
//
// A finding is { level: "error" | "warning" | "notice", check, message }.
// "error" fails the job; the other two are reported only.

// ── XML (the merged manifest, as `apkanalyzer manifest print` prints it) ──

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X"
      return String.fromCodePoint(
        parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      )
    }
    return ENTITIES[body] ?? whole
  })

/**
 * Parses well-formed XML into `{ name, attrs, children }` elements. Enough for
 * a manifest that a tool printed (no DTD, no CDATA); text content is dropped.
 */
export function parseXml(text) {
  const root = { name: "#document", attrs: {}, children: [] }
  const stack = [root]
  const tag =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
  const attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const m of text.matchAll(tag)) {
    const [, closing, name, attrText, selfClosing] = m
    if (!name) continue // comment or processing instruction
    if (closing) {
      const open = stack.pop()
      if (open?.name !== name)
        throw new Error(`XML: </${name}> closes <${open?.name}>`)
      continue
    }
    const el = { name, attrs: {}, children: [] }
    for (const a of attrText.matchAll(attr))
      el.attrs[a[1]] = decodeEntities(a[2] ?? a[3])
    stack.at(-1).children.push(el)
    if (!selfClosing) stack.push(el)
  }
  if (stack.length !== 1)
    throw new Error(`XML: <${stack.at(-1).name}> never closed`)
  return root
}

const childrenNamed = (el, name) => el.children.filter((c) => c.name === name)

const bool = (value) => (value === undefined ? undefined : value === "true")

const COMPONENT_KINDS = [
  "activity",
  "activity-alias",
  "service",
  "receiver",
  "provider",
]

/** The facts the review needs out of a parsed merged manifest. */
export function manifestFacts(doc) {
  const [manifest] = childrenNamed(doc, "manifest")
  if (!manifest) throw new Error("no <manifest> element")
  const pkg = manifest.attrs.package
  const [usesSdk] = childrenNamed(manifest, "uses-sdk")
  const [app] = childrenNamed(manifest, "application")
  const qualify = (name) => (name?.startsWith(".") ? pkg + name : name)
  const a = app?.attrs ?? {}
  return {
    applicationId: pkg,
    versionCode: Number(manifest.attrs["android:versionCode"]),
    versionName: manifest.attrs["android:versionName"],
    minSdk: Number(usesSdk?.attrs["android:minSdkVersion"]),
    targetSdk: Number(usesSdk?.attrs["android:targetSdkVersion"]),
    permissions: [
      ...childrenNamed(manifest, "uses-permission"),
      ...childrenNamed(manifest, "uses-permission-sdk-23"),
    ].map((p) => p.attrs["android:name"]),
    declaredPermissions: childrenNamed(manifest, "permission").map((p) => ({
      name: p.attrs["android:name"],
      protectionLevel: p.attrs["android:protectionLevel"],
    })),
    application: {
      allowBackup: bool(a["android:allowBackup"]),
      usesCleartextTraffic: bool(a["android:usesCleartextTraffic"]),
      debuggable: bool(a["android:debuggable"]),
      networkSecurityConfig: a["android:networkSecurityConfig"],
    },
    components: COMPONENT_KINDS.flatMap((kind) =>
      (app ? childrenNamed(app, kind) : []).map((c) => ({
        kind,
        name: qualify(c.attrs["android:name"]),
        exported: bool(c.attrs["android:exported"]),
        hasIntentFilter: childrenNamed(c, "intent-filter").length > 0,
        permission: c.attrs["android:permission"],
      }))
    ),
  }
}

// ── Manifest review against policy.json ──────────────────────────────────

const PKG = "${applicationId}"

/** Policy keys may name the app's own package as `${applicationId}`. */
const expandKeys = (map, applicationId) =>
  new Map(
    Object.entries(map ?? {}).map(([k, v]) => [
      k.replaceAll(PKG, applicationId),
      v,
    ])
  )

const hasReason = (entry) =>
  typeof entry?.reason === "string" && entry.reason.trim().length > 0

/**
 * Identity, permissions, exported components and application flags of one
 * build's merged manifest, against policy.json. `variant` is "debug" or
 * "release"; only release must be non-debuggable.
 */
export function reviewManifest(facts, policy, variant) {
  const findings = []
  const error = (check, message) =>
    findings.push({ level: "error", check, message })
  const { applicationId } = policy.identity

  if (facts.applicationId !== applicationId) {
    error(
      "identity",
      `${variant}: applicationId is ${facts.applicationId}, but policy.json freezes ${applicationId}. ` +
        "Play treats a new applicationId as a different app; it can never change once published."
    )
  }

  // Permissions: every one requested or declared needs a reason, and a
  // restricted one also needs the Play declaration it would take.
  const allowed = expandKeys(policy.permissions, applicationId)
  const restricted = new Map(
    Object.entries(policy.restrictedPermissions ?? {}).filter(
      ([k]) => !k.startsWith("$")
    )
  )
  const present = new Set([
    ...facts.permissions,
    ...facts.declaredPermissions.map((p) => p.name),
  ])
  for (const name of present) {
    const entry = allowed.get(name)
    const restriction = [...restricted].find(
      ([prefix]) =>
        name === prefix ||
        (prefix.endsWith("*") && name.startsWith(prefix.slice(0, -1)))
    )
    if (!entry) {
      error(
        "permissions",
        `${variant}: ${name} is in the merged manifest but not in policy.json "permissions". ` +
          'A dependency may have added it; allowlist it with a reason, or remove it with tools:node="remove".'
      )
    } else if (!hasReason(entry)) {
      error(
        "permissions",
        `${variant}: policy.json allows ${name} with no reason.`
      )
    }
    if (
      restriction &&
      !(
        typeof entry?.playDeclaration === "string" &&
        entry.playDeclaration.trim()
      )
    ) {
      error(
        "permissions",
        `${variant}: ${name} is restricted on Google Play (${restriction[1]}). ` +
          'Its policy.json entry needs a "playDeclaration" saying which use case would qualify it.'
      )
    }
  }
  for (const name of allowed.keys()) {
    if (!present.has(name)) {
      error(
        "permissions",
        `${variant}: policy.json allows ${name}, which the build no longer has. Remove the entry.`
      )
    }
  }

  // Exported components: explicit, allowlisted, and with a reason.
  const exportedAllowed = expandKeys(policy.exportedComponents, applicationId)
  const exported = new Set()
  for (const c of facts.components) {
    if (c.exported === undefined && c.hasIntentFilter) {
      error(
        "exported",
        `${variant}: ${c.kind} ${c.name} has an intent-filter and no android:exported. ` +
          "Android 12+ refuses to install that; declare it."
      )
    }
    if (!c.exported) continue
    exported.add(c.name)
    const entry = exportedAllowed.get(c.name)
    if (!entry) {
      error(
        "exported",
        `${variant}: ${c.kind} ${c.name} is exported${c.permission ? ` (guarded by ${c.permission})` : ""} ` +
          'but not in policy.json "exportedComponents".'
      )
    } else if (!hasReason(entry)) {
      error(
        "exported",
        `${variant}: policy.json exports ${c.name} with no reason.`
      )
    }
  }
  for (const name of exportedAllowed.keys()) {
    if (!exported.has(name)) {
      error(
        "exported",
        `${variant}: policy.json allows exporting ${name}, which the build no longer exports. Remove the entry.`
      )
    }
  }

  // Application flags that are decisions (the departures list).
  for (const [flag, entry] of Object.entries(policy.applicationFlags ?? {})) {
    const actual = facts.application[flag]
    if (actual !== entry.expect) {
      error(
        "flags",
        `${variant}: android:${flag} is ${actual ?? "unset"}, policy.json records ${entry.expect}` +
          `${entry.departure ? ` (departure ${entry.departure})` : ""}. ` +
          "Change the entry and the README's departures list with it, or restore the flag."
      )
    } else if (!hasReason(entry)) {
      error(
        "flags",
        `${variant}: policy.json records android:${flag} with no reason.`
      )
    }
  }

  if (variant === "release" && facts.application.debuggable) {
    error(
      "release",
      "release: android:debuggable is true. Play rejects a debuggable upload."
    )
  }
  return findings
}

// ── Target API level ─────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000
const date = (iso) => new Date(`${iso}T00:00:00Z`)

/**
 * The target API level Google Play requires of an app update on `today`,
 * from policy.json's dated schedule. An error only once the extension window
 * a developer could ask for has also closed; a warning inside it.
 */
export function reviewTargetSdk(targetSdk, schedule, today) {
  const findings = []
  const rows = [...schedule.rows].sort((a, b) => date(a.from) - date(b.from))
  const current = rows.filter((r) => date(r.from) <= today).at(-1)
  if (current && targetSdk < current.level) {
    const inExtension =
      current.extensionUntil && today < date(current.extensionUntil)
    const grace = inExtension
      ? `, with extensions to ${current.extensionUntil}. This becomes an error then.`
      : "."
    findings.push({
      level: inExtension ? "warning" : "error",
      check: "target-sdk",
      message: `targetSdk is ${targetSdk}; Google Play has required ${current.level} of app updates since ${current.from}${grace} Source: ${schedule.source}`,
    })
  }
  const upcoming = rows.find((r) => date(r.from) > today)
  if (upcoming && targetSdk < upcoming.level) {
    findings.push({
      level: "notice",
      check: "target-sdk",
      message: `Google Play will require targetSdk ${upcoming.level} from ${upcoming.from}.`,
    })
  }
  // Google publishes each year's level months ahead. A schedule whose last
  // row is a year old has missed one, and would pass forever.
  const last = rows.at(-1)
  if (last && today - date(last.from) > 365 * DAY) {
    findings.push({
      level: "error",
      check: "target-sdk",
      message: `policy.json's target-SDK schedule ends at ${last.from}, over a year ago, so it has missed a yearly requirement. Add the current one from ${schedule.source}.`,
    })
  }
  return findings
}

// ── versionCode ──────────────────────────────────────────────────────────

/** Play's ceiling, https://developer.android.com/studio/publish/versioning */
export const MAX_VERSION_CODE = 2_100_000_000

export function reviewVersionCode(versionCode, previous) {
  const findings = []
  if (
    !Number.isInteger(versionCode) ||
    versionCode < 1 ||
    versionCode > MAX_VERSION_CODE
  ) {
    findings.push({
      level: "error",
      check: "version-code",
      message: `versionCode ${versionCode} is outside 1..${MAX_VERSION_CODE}.`,
    })
  }
  const highest = Math.max(...previous.map((p) => p.versionCode))
  if (previous.length && !(versionCode > highest)) {
    const from = previous.find((p) => p.versionCode === highest)
    findings.push({
      level: "error",
      check: "version-code",
      message:
        `versionCode ${versionCode} is not above ${highest}, the versionCode of ${from.label}. ` +
        "A phone refuses it as an update, and Play refuses a reused or lower code.",
    })
  }
  return findings
}

// ── Signing certificate (apksigner verify --print-certs) ────────────────

// The line's prefix changed across build-tools: 35.0.0 prints
// "Signer #1 certificate SHA-256 digest: <hex>", 37.0.0 prints
// "V2 Signer: certificate SHA-256 digest: <hex>", one line per signature
// scheme. The review runs the runner's newest build-tools, so both are
// accepted, and a certificate listed once per scheme counts once.
export function parseSignerDigests(text) {
  const digests = [
    ...text.matchAll(
      /^[^\n]*\bSigner\b[^\n]*\bcertificate SHA-256 digest:\s*([0-9a-f]+)\s*$/gim
    ),
  ].map((m) => m[1].toLowerCase())
  return [...new Set(digests)]
}

export function reviewSigner(label, digests, expected) {
  const pinned = expected?.toLowerCase().replaceAll(":", "")
  if (!pinned) {
    return [
      {
        level: "error",
        check: "signing",
        message:
          `${label} is signed by ${digests.join(", ") || "nothing"}, and policy.json pins no ` +
          '"signingCertSha256". Pin that digest: it is the future Play upload key.',
      },
    ]
  }
  if (digests.length !== 1 || digests[0] !== pinned) {
    return [
      {
        level: "error",
        check: "signing",
        message:
          `${label} is signed by ${digests.join(", ") || "nothing"}, not the pinned key ${pinned}. ` +
          "A different key cannot update the installed app, and would not be the Play upload key.",
      },
    ]
  }
  return []
}

// ── ZIP (APK and AAB) ────────────────────────────────────────────────────

/**
 * Reads a ZIP's central directory: each entry's name, method, sizes, and the
 * offset its data starts at (which is what 16 KB alignment is about).
 */
export function readZip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (
    let i = buf.length - 22;
    i >= Math.max(0, buf.length - 22 - 0xffff);
    i--
  ) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("not a ZIP: no end-of-central-directory record")
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50)
      throw new Error("ZIP: bad central directory entry")
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(
      buf.subarray(p + 46, p + 46 + nameLen)
    )
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen
    entries.push({ name, method, compressedSize, size, dataOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

export const PAGE_16K = 16 * 1024

/**
 * Native libraries in an APK: each must be stored (not deflated) at a 16 KB
 * boundary, so the loader can map it in place on a 16 KB-page device.
 * https://developer.android.com/guide/practices/page-sizes
 */
export function reviewZipAlignment(label, entries) {
  const findings = []
  for (const e of entries.filter((e) =>
    /^lib\/[^/]+\/[^/]+\.so$/.test(e.name)
  )) {
    if (e.method !== 0) {
      findings.push({
        level: "error",
        check: "16kb",
        message: `${label}: ${e.name} is compressed. Libraries must be stored uncompressed and 16 KB-aligned (AGP 8.5.1+ does both).`,
      })
    } else if (e.dataOffset % PAGE_16K !== 0) {
      findings.push({
        level: "error",
        check: "16kb",
        message: `${label}: ${e.name} starts at byte ${e.dataOffset}, not on a 16 KB boundary.`,
      })
    }
  }
  return findings
}

// ── ELF (the native libraries themselves) ────────────────────────────────

/** The alignment of every PT_LOAD segment in an ELF shared object. */
export function elfLoadAlignments(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (view.getUint32(0, false) !== 0x7f454c46)
    throw new Error("not an ELF file")
  const is64 = buf[4] === 2
  const le = buf[5] === 1
  const phoff = is64
    ? Number(view.getBigUint64(0x20, le))
    : view.getUint32(0x1c, le)
  const phentsize = view.getUint16(is64 ? 0x36 : 0x2a, le)
  const phnum = view.getUint16(is64 ? 0x38 : 0x2c, le)
  const aligns = []
  for (let i = 0; i < phnum; i++) {
    const h = phoff + i * phentsize
    if (view.getUint32(h, le) !== 1) continue // PT_LOAD
    aligns.push(
      is64
        ? Number(view.getBigUint64(h + 0x30, le))
        : view.getUint32(h + 0x1c, le)
    )
  }
  return aligns
}

/** Only 64-bit ABIs carry the requirement; Play checks arm64-v8a and x86_64. */
export function reviewElf(label, path, aligns) {
  if (!/\/(arm64-v8a|x86_64)\//.test(path)) return []
  const low = aligns.filter((a) => a < PAGE_16K)
  if (!aligns.length || low.length) {
    return [
      {
        level: "error",
        check: "16kb",
        message:
          `${label}: ${path} has LOAD segments aligned to ${low.map((a) => `0x${a.toString(16)}`).join(", ") || "nothing"}; ` +
          "16 KB-page devices need 0x4000 or more. The library must be rebuilt (or replaced).",
      },
    ]
  }
  return []
}

// ── Size ─────────────────────────────────────────────────────────────────

/** Compressed bytes per top-level group, largest first. */
export function sizeBreakdown(entries) {
  const groups = new Map()
  for (const e of entries) {
    const top = e.name.includes("/")
      ? `${e.name.split("/")[0]}/`
      : /^classes\d*\.dex$/.test(e.name)
        ? "classes*.dex"
        : e.name
    groups.set(top, (groups.get(top) ?? 0) + e.compressedSize)
  }
  return [...groups]
    .map(([group, bytes]) => ({ group, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
}

export function reviewSize(label, bytes, budget) {
  const mib = bytes / (1024 * 1024)
  if (mib > budget.warnMiB) {
    return [
      {
        level: "warning",
        check: "size",
        message: `${label} is ${mib.toFixed(1)} MiB, over the ${budget.warnMiB} MiB budget in policy.json.`,
      },
    ]
  }
  return []
}

// ── Android Lint (its XML report) ────────────────────────────────────────

export function lintIssues(doc) {
  const [issues] = childrenNamed(doc, "issues")
  return (issues ? childrenNamed(issues, "issue") : []).map((i) => {
    const [loc] = childrenNamed(i, "location")
    return {
      id: i.attrs.id,
      severity: i.attrs.severity,
      message: i.attrs.message,
      file: loc?.attrs.file,
      line: loc?.attrs.line,
    }
  })
}

/** Report-only until policy.json's `lint.gate` is set, then errors fail. */
export function reviewLint(issues, lintPolicy) {
  const blocking = issues.filter(
    (i) => i.severity === "Error" || i.severity === "Fatal"
  )
  if (!blocking.length) return []
  const ids = [...new Set(blocking.map((i) => i.id))].join(", ")
  return [
    {
      level: lintPolicy.gate ? "error" : "warning",
      check: "lint",
      message: `Android Lint: ${blocking.length} error(s) (${ids}).${lintPolicy.gate ? "" : " Report-only until policy.json sets lint.gate."}`,
    },
  ]
}
