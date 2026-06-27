# AMO Compliance & Extension Publishing Guide

> Applies to all extension workspaces under `extensions/`. Last updated: 2026-06.

This document is the authoritative reference for building, linting, signing, and publishing
extensions through the Mozilla Add-ons (AMO) pipeline. It exists because AMO review is
iterative and unforgiving: each sign cycle can surface a new policy violation, and fixing
one without understanding the others wastes cycles. The goal is **~99% first-pass confidence**
before any `sign:firefox` invocation.

---

## Table of Contents

1. [How AMO Reviews Unlisted Add-ons](#1-how-amo-reviews-unlisted-add-ons)
2. [The Footgun Taxonomy](#2-the-footgun-taxonomy)
3. [A — Blocking: Will Fail Review](#a--blocking-will-fail-review)
4. [B — Likely: Probable Flag on Next Cycle](#b--likely-probable-flag-on-next-cycle)
5. [C — Hygiene: Best Practice / Eventual Flag](#c--hygiene-best-practice--eventual-flag)
6. [Source Code Submission Requirements](#6-source-code-submission-requirements)
7. [Manifest Requirements by Version](#7-manifest-requirements-by-version)
8. [Permission Justification Reference](#8-permission-justification-reference)
9. [Content Security Policy](#9-content-security-policy)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Pre-Sign Checklist](#11-pre-sign-checklist)
12. [Appeal Process](#12-appeal-process)

---

## 1. How AMO Reviews Unlisted Add-ons

**"Unlisted" does not mean "unreviewed."**

When you call `web-ext sign --channel=unlisted`, your `.xpi` is uploaded to Mozilla's
infrastructure and an AMO add-on record is created. Mozilla can — and does — sweep uploaded
content at any time, listed or not. The two review scenarios you will encounter:

| Scenario | Trigger | Timeline | Outcome if violation found |
|---|---|---|---|
| Automated scan | Every upload | Minutes | Instant disable or 30-day warning |
| Manual sweep | Mozilla initiative | Days–weeks after upload | Immediate permanent disable |

The 30-day warning (as in the source-missing email) gives you time to resubmit a compliant
version. A permanent disable (as in the deceptive-content email) requires an appeal. You can
receive both for the same version: the first email may be from a scan, the second from a human
reviewing the same build.

**Unlisted vs. listed differences relevant to compliance:**

- Source code upload is required for *both* channels.
- Unlisted skips the public review queue but not policy enforcement.
- Unlisted add-ons can continue to be used by installed users even after disable (unlike listed).
- You have 6 months to appeal any enforcement action.

---

## 2. The Footgun Taxonomy

Issues are classified on the **ABC model**:

| Class | Meaning | When it fires |
|---|---|---|
| **A** | Blocking — will fail AMO review | Before or at submission; immediate action required |
| **B** | Likely — probable flag on next manual sweep | After submission; caught in 1–2 cycles |
| **C** | Hygiene — best practice; eventual flag risk | Long-term; caught as policies tighten |

Each footgun below includes: the AMO policy it maps to, a weight (1–5 severity), and the
affected extensions.

---

## A — Blocking: Will Fail Review

### A1 · Source Code Not Uploaded *(weight: 5)*

**Policy:** [Sources](https://extensionworkshop.com/documentation/publish/add-on-policies/#sources)

AMO requires that any extension containing compiled, minified, concatenated, or machine-generated
code be accompanied by a source archive and build instructions. A Vite + TypeScript build always
produces machine-generated output — every extension in this workspace is affected.

**What is required:**
- A `.zip` of the source tree (excluding `node_modules`, `dist`, `.env*`)
- A top-level `README` (or `README.build.md`) that describes, step by step, how to reproduce the
  exact `dist/` output from the source archive using only public package registries
- The archive must be uploaded via the AMO developer hub *source code upload field* at sign time;
  `web-ext sign` does not do this automatically

**Affected:** All extensions (every workspace produces compiled output)

**See also:** [§6 Source Code Submission Requirements](#6-source-code-submission-requirements)

---

### A2 · Localhost Permissions in Production Manifest *(weight: 5)*

**Policy:** [Permissions](https://extensionworkshop.com/documentation/develop/request-the-right-permissions/)

Some manifests hardcode `http://localhost:3000/*` (or similar) as a host permission or
content-script match. AMO rejects these unconditionally: production add-ons must not request
access to `localhost`.

**Affected:** `some-cycle`, `some-prompt`, `some-streak`

**Fix:** Remove localhost entries entirely from production manifests. If needed for development,
gate them behind a separate `manifest.dev.json` that is never submitted.

---

### A3 · Manifest V2 (Deprecated) *(weight: 4)*

**Policy:** [MV2 Deprecation Timeline](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

Mozilla has deprecated MV2. New MV2 submissions are unlikely to pass review beyond 2025,
and existing MV2 add-ons will eventually be forced to migrate. Starting MV3 migration now
prevents a forced, rushed migration later.

**Affected:** `some-cycle`, `some-drama`, `some-mujik`, `some-prompt`, `some-schedule`,
`some-scrobbler`, `some-streak`, `some-tab-meta`, `tab-tracker`, and the Firefox variant
of `some-filter`

**Key MV3 changes required:**
- `background.scripts` → `background.scripts` (array form, Firefox) or service worker (Chrome)
- `browser_action` → `action`
- `web_accessible_resources` gains required `matches` array
- `host_permissions` moved out of `permissions`
- No `eval()`, no remote code (already required in MV2 but enforced more strictly)

---

### A4 · CI Auto-Sign on Main Merge *(weight: 4)*

This is a process control, not a code issue. The current CI pipeline triggers `web-ext sign`
automatically on every push to `main`. Until all A/B footguns are resolved, an automatic sign
risks creating a non-compliant AMO version that then triggers a disable or 30-day warning.

**Fix:** Gate the sign workflow behind a manual `workflow_dispatch` trigger (or a protected tag)
until a compliance audit confirms the build is clean. Reinstate automatic signing once the
pre-sign checklist passes in CI.

---

## B — Likely: Probable Flag on Next Cycle

### B1 · Overly Broad Host Permissions *(weight: 4)*

**Policy:** [Request only what you need](https://extensionworkshop.com/documentation/develop/request-the-right-permissions/#request-permissions-at-runtime)

`<all_urls>` and `*://*/*` are the broadest possible host permission. AMO reviewers scrutinize
these closely and may request narrowing or a written justification.

**Affected (MV2 `<all_urls>`):** `some-drama`, `some-schedule`, `tab-tracker`
**Affected (MV3 `*://*/*` host_permissions):** `suspender-ledger`, `some-conveyor`

For tab suspenders and content scripts that genuinely need all-URL access, a written justification
in "Notes to Reviewers" at sign time is required. For extensions that only need access to
specific sites, narrow the match pattern.

---

### B2 · Overly Broad web_accessible_resources *(weight: 3)*

**Policy:** [web_accessible_resources security note](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources)

Resources declared in `web_accessible_resources` are accessible to any web page that matches
the declared patterns. Exposing `./*` (all assets) turns the extension's entire file system
into a fingerprinting surface and may raise a policy flag.

**Affected:** `some-cycle` (`["./*", "icons/*"]`)

**Fix:** List only the specific files actually embedded in page content (e.g. the suspend page,
a specific injected CSS), with narrowed `matches` arrays.

---

### B3 · Suspend Page Title/Favicon Reflection *(weight: 3)*

**Policy:** [Acceptable Use — Deceptive/misleading](https://www.mozilla.org/about/legal/acceptable-use/)

`suspender-ledger`'s `suspend.html` reflects the suspended tab's original title and favicon
verbatim onto the tab strip. To an AMO reviewer or classifier, a page at
`moz-extension://…/suspend.html` that presents another origin's identity is structurally
indistinguishable from phishing scaffolding. (This was the original block; the appeal succeeded,
but a future sweep could re-flag it.)

**Fix:**
- Prefix the document title: `[Suspended] ${originalTitle}` instead of `${originalTitle}`
- Overlay a small badge on the favicon rather than serving the site's exact icon verbatim

This keeps recognizability while making the suspended state visually unambiguous.

---

### B4 · Missing CSP in Extension HTML Surfaces *(weight: 3)*

**Policy:** [Content Security Policy](https://extensionworkshop.com/documentation/develop/content-security-policy/)

MV3 enforces a strict default CSP (`script-src 'self'`) for extension pages, but several
MV2 extensions and popup/options pages do not declare an explicit CSP. Without one, AMO
reviewers must infer what is permitted. Declaring an explicit, restrictive CSP signals
intentional security design.

**Required for all extension HTML pages (popup, options, suspend):**

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

If WebAssembly is needed (e.g. `some-conveyor`), add `'wasm-unsafe-eval'` and document the
justification in "Notes to Reviewers".

**Affected:** All extensions with HTML surfaces that lack explicit CSP declarations.

---

### B5 · lint:ext Not Uniformly Applied *(weight: 3)*

`web-ext lint` is the official validator that checks manifests, permissions, and packaging
against AMO's own rules. Currently only `suspender-ledger` has an explicit `lint:ext` script.
Other extensions rely on the CI verify step running `web-ext lint` against the built `dist/`,
but this is not enforced in local development.

**Fix:** Add `"lint:ext": "web-ext lint --source-dir dist --self-hosted"` to every extension's
`package.json`. Add it to the turbo pipeline so it runs before sign.

---

### B6 · wasm-unsafe-eval Without Documented Justification *(weight: 2)*

`some-conveyor` uses `script-src 'self' 'wasm-unsafe-eval'` in its CSP, required for
WebAssembly. This keyword is an automatic red flag for AMO automated scanners. It is
*permitted* for legitimate WASM use, but must be accompanied by a reviewer note explaining
the necessity.

**Fix:** Add a `README.reviewer.md` or populate "Notes to Reviewers" in the AMO developer hub
explaining which WASM module is loaded and why it cannot use a pre-compiled binary.

---

## C — Hygiene: Best Practice / Eventual Flag

### C1 · data_collection_permissions Not Declared in All Manifests *(weight: 2)*

Firefox MV3 supports `browser_specific_settings.gecko.data_collection_permissions`. Declaring
`"required": ["none"]` proactively signals that the extension collects nothing and suppresses
automated data-collection review flags. Currently only `suspender-ledger` declares this.

**Affected:** All MV3 extensions (after MV3 migration).

---

### C2 · No Security-Focused ESLint Rules for Extensions *(weight: 2)*

General ESLint configs do not cover extension-specific attack surfaces. Security rules that
should be enforced across all extension workspaces:

| Rule | Rationale |
|---|---|
| No `eval()` / `new Function()` | Remote code execution; immediate AMO block |
| No `document.write()` | XSS vector in content scripts |
| No hardcoded `http://` URLs in source | Plaintext network requests |
| No `chrome.tabs.executeScript` with inline strings | Code injection |
| Require `browser.*` not `chrome.*` | Cross-browser compatibility |

---

### C3 · No Explicit gecko.id in Some Manifests *(weight: 2)*

AMO requires a stable `browser_specific_settings.gecko.id` across versions. If this changes,
AMO treats the upload as a new extension and loses update history. Verify that every extension
declares a stable, unique ID and that it is never auto-generated by the build.

---

### C4 · MPL-2.0 License Header Coverage *(weight: 1)*

`suspender-ledger` enforces MPL-2.0 headers on ported files via `check:headers`. No other
extension enforces license header consistency. For OSS compliance, this should be workspace-wide.

---

### C5 · AMO Submission Checklist Not Templated Across Extensions *(weight: 1)*

`suspender-ledger` has an AMO checklist in its README. Other extensions do not. A shared
checklist (as a GitHub PR template or turbo task) would catch compliance regressions before
sign.

---

## 6. Source Code Submission Requirements

This is the most common AMO block for compile-to-JS extensions. The requirements:

### What AMO needs

1. **Source archive** — a `.zip` containing the complete source tree, reproducible to the
   exact same `dist/` output when built on a clean machine
2. **Build instructions** — either in a top-level `README` inside the archive or in the
   "Notes to Reviewers" field in the AMO developer hub
3. **All dependencies resolvable** — either bundled in the archive or downloadable via
   `npm`/`pnpm`/`yarn` from public registries (no private registries, no local paths)

### What the archive must contain

```
source.zip
├── extensions/<name>/     ← the extension workspace
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.firefox.ts
│   └── tsconfig.json
├── extensions/common/     ← shared Vite config (required dependency)
├── packages/              ← any workspace packages consumed at build time
├── package.json           ← root workspace manifest
├── pnpm-lock.yaml         ← exact lockfile (required for reproducibility)
├── pnpm-workspace.yaml
└── README.build.md        ← build instructions (see below)
```

### README.build.md template

```markdown
# Build Instructions for AMO Review

## Prerequisites
- Node.js 20+
- pnpm 9+

## Steps

```sh
pnpm install --frozen-lockfile
pnpm -F @some-extension/<name> build:firefox
```

The compiled extension will be in `extensions/<name>/dist/`.
The submitted `.xpi` was built from commit `<git-sha>` on <date>.

## Verification

The `dist/manifest.json` version must match the submitted add-on version.
All JS files in `dist/` are produced by Vite from TypeScript sources in `src/`.
No remote code is fetched at runtime.
```

### How to generate the archive in CI

Add a `package:source` script to each extension's `package.json`:

```sh
# from workspace root
git archive HEAD \
  --prefix=source/ \
  --add-file=pnpm-lock.yaml \
  -o artifacts/source-<version>.zip \
  extensions/<name> extensions/common packages
```

This produces a deterministic archive from the git tree (no node_modules, no dist).

---

## 7. Manifest Requirements by Version

### MV3 Manifest Checklist

```json
{
  "manifest_version": 3,
  "name": "...",
  "version": "x.y.z",
  "description": "Clear, accurate description of what the extension does.",

  "permissions": ["storage", "tabs"],
  "host_permissions": ["*://*/*"],

  "background": {
    "scripts": ["worker.js"]
  },

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },

  "web_accessible_resources": [{
    "resources": ["specific-file.html"],
    "matches": ["*://*/*"]
  }],

  "browser_specific_settings": {
    "gecko": {
      "id": "extension-name@yourdomain.com",
      "strict_min_version": "115.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
}
```

**Non-negotiable MV3 rules:**
- No `eval()` anywhere in extension pages or background scripts
- No remotely-hosted scripts (no CDN URLs in `<script src>`)
- `web_accessible_resources` must include `matches` array
- Background is `scripts` array (Firefox) not `service_worker` (Chrome)

### MV2 → MV3 Migration Quick Reference

| MV2 | MV3 |
|---|---|
| `manifest_version: 2` | `manifest_version: 3` |
| `background.scripts` | `background.scripts` (Firefox) |
| `browser_action` | `action` |
| `permissions: ["<all_urls>"]` | `host_permissions: ["*://*/*"]` |
| `web_accessible_resources: ["file.js"]` | `web_accessible_resources: [{"resources": ["file.js"], "matches": ["*://*/*"]}]` |
| `content_security_policy: "..."` (string) | `content_security_policy: {"extension_pages": "..."}` (object) |

---

## 8. Permission Justification Reference

When broad permissions are unavoidable, include this in "Notes to Reviewers" at AMO sign time:

| Permission | Required justification |
|---|---|
| `<all_urls>` / `*://*/*` | Extension must operate on every URL the user visits (e.g. tab manager, content filter). Cannot be narrowed without breaking core functionality. |
| `tabs` | Required to read tab URLs/titles for suspension/tracking logic. Not used to send tab data off-device. |
| `scripting` | Required to inject content scripts dynamically (MV3). Only injects to tabs matching declared host permissions. |
| `storage` | Stores user preferences locally. No sync to external servers. |
| `notifications` | Notifies user of suspension events. User-initiated; no remote triggers. |

---

## 9. Content Security Policy

### Extension pages (popup, options, suspend page)

Minimum safe CSP for all extension HTML pages:

```
script-src 'self'; object-src 'self'
```

Do not use:
- `'unsafe-inline'` — allows inline `<script>` tags (XSS risk; AMO flag)
- `'unsafe-eval'` — allows `eval()` (code injection; immediate AMO block)
- External origins (e.g. `https://cdn.example.com`) — remote code; immediate AMO block

### WebAssembly (some-conveyor only)

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

Must be documented in "Notes to Reviewers" with the specific WASM module named and its
provenance explained.

### Content scripts

Content scripts run in the page's CSP, not the extension's. They cannot load additional
scripts from AMO-managed resources without declaring them in `web_accessible_resources`.

---

## 10. CI/CD Pipeline

### Current pipeline (do not trigger sign until footguns resolved)

```
push to main
└── extension-detect (discovers changed extensions)
    └── extension-verify (per changed extension)
        ├── typecheck
        ├── lint (ESLint + check:headers)
        ├── test
        ├── build:firefox
        └── web-ext lint --source-dir dist --self-hosted --warnings-as-errors
            └── [MANUAL ONLY] extension-sign
                ├── web-ext sign --channel=unlisted
                └── upload source archive to AMO developer hub
```

### Required additions before reinstating auto-sign

1. `package:source` step — produces reproducible source `.zip` from git tree
2. `upload:source` step — uploads the archive to the AMO version page via AMO API
3. `notes:reviewers` — posts the "Notes to Reviewers" text via AMO API
4. All A+B footguns resolved (tracked in epic issue)

### Secrets required

| Secret | Description |
|---|---|
| `AMO_JWT_ISSUER` | AMO API key (issuer) |
| `AMO_JWT_SECRET` | AMO API secret |

Never commit these to the repository. Rotate if leaked.

---

## 11. Pre-Sign Checklist

Run through this before every `sign:firefox` invocation. All items must pass.

### Build integrity
- [ ] `pnpm -F @some-extension/<name> build:firefox` exits 0
- [ ] `dist/worker.js` is a single flat file — no `import`/`import()` statements
- [ ] `dist/manifest.json` version matches the intended AMO version
- [ ] `dist/manifest.json` has a stable `gecko.id` (unchanged from previous versions)

### Lint
- [ ] `pnpm -F @some-extension/<name> lint:js` exits 0
- [ ] `pnpm -F @some-extension/<name> typecheck` exits 0
- [ ] `pnpm -F @some-extension/<name> lint:ext` reports 0 errors AND 0 warnings
- [ ] `pnpm -F @some-extension/<name> test` exits 0

### Source archive
- [ ] `artifacts/source-<version>.zip` generated from `git archive`
- [ ] `README.build.md` inside archive describes exact build steps
- [ ] Build is reproducible: clean machine can produce byte-identical `dist/` from archive

### Manifest
- [ ] No `localhost` in host_permissions or content_script matches
- [ ] No externally-hosted script URLs
- [ ] Explicit `content_security_policy` declared for all HTML surfaces
- [ ] `data_collection_permissions: {"required": ["none"]}` present (MV3)
- [ ] `web_accessible_resources` entries are minimal and specific

### AMO developer hub
- [ ] Source archive uploaded to the version page before or at sign time
- [ ] "Notes to Reviewers" populated (explain broad permissions, WASM if applicable)

---

## 12. Appeal Process

If an enforcement action is received:

1. **Read the email carefully** — the "Sources missing" 30-day warning and the "Deceptive content"
   permanent disable have different remediation paths.
2. **For 30-day warnings:** fix the violation and resubmit within 30 days. A new version
   supersedes the blocked one; no appeal required.
3. **For permanent disables:** use the appeal link in the email (valid for 6 months). State:
   - What the extension does (plainly, one paragraph)
   - Why the flagged behavior is not actually a violation
   - What you are willing to change if given guidance
4. **Keep appeals factual and specific.** Mention the actual code (file names, functions).
   Generic template appeals receive slower, less useful responses.
5. **Reference:** `[ref:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]` in subject line of every reply.

### Our history

| Date | Event | Ref |
|---|---|---|
| 2026-06 | Permanent disable — "Deceptive/misleading" (title/favicon reflection) | `34e3f4df-3042-4672-9502-9096e9095ef6` |
| 2026-06 | Appeal succeeded — reinstated v0.1.0 | `c05f4fe5-f16d-433d-8e15-f39dead5c4f3` |
| 2026-06 | 30-day warning — "Sources missing" (no source archive uploaded at sign time) | pending |

The source-missing warning is the current live item. A compliant resubmission with a source
archive resolves it without an appeal.
