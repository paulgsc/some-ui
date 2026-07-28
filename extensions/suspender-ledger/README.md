# Suspender Ledger

> Firefox MV3 tab suspender — pause background tabs to reclaim RAM without
> losing history. A TypeScript port of [auto-tab-discard](https://github.com/rNeomy/auto-tab-discard)
> v3, rebuilt for the Manifest V3 background-script model.

---

## Overview

Suspender Ledger watches your open tabs and, after a configurable idle
period, _discards_ (suspends) the ones you are not using. A discarded tab
keeps its place in the tab strip and its position in history, but releases
the memory its page was holding. Activating the tab transparently reloads
it.

The extension never closes tabs. Suspension is always reversible: a
suspended tab restores in place via the browser's native discard mechanism —
activating it transparently reloads the original page.

---

## Architecture

The extension is split into three runtime surfaces, each built as a flat
entry point by `vite.config.ts` (the shared `extensionConfig` build):

| Surface        | Entry                               | Output      | Role                                                                         |
| -------------- | ----------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Service worker | `src/worker/worker.ts`              | `worker.js` | Background logic: discard scheduling, prefs, context menu, keyboard commands |
| Content script | `src/content/watch.ts`              | `watch.js`  | Per-page activity detection (input/scroll/visibility) reported to the worker |
| Popup          | `popup.html` → `src/popup/index.ts` | `popup.js`  | Toolbar UI: per-tab actions, whitelist toggle, settings form                 |
| Diagnostics    | `debug.html` → `src/debug/index.ts` | `debug.js`  | Local health, metrics and event timeline ([docs](docs/observability.md))     |

Supporting modules:

- `src/worker/core/` — `discard`, `navigate`, `prefs`, `startup`, `utils`,
  `observability` (the local flight recorder — see `docs/observability.md`)
  (the suspension engine and storage layer)
- `src/worker/menu.ts`, `src/worker/modes/number.ts` — context menu and the
  "keep N most-recent tabs loaded" mode
- `src/lib/platform/firefox.ts` — the platform shim (aliased as
  `@suspender/platform`) isolating browser-API differences
- `src/lib/safe-url.ts` — favicon URL scheme validation used by the popup
- `src/types/messages.ts` — the typed, validated message protocol used at
  every popup ↔ worker ↔ content boundary

### MV3 build constraints

Firefox MV3 background scripts cannot be code-split, so the worker is
emitted as a single flat file (`manualChunks: () => {}` in the Vite
config). The manifest uses `background.scripts: ["worker.js"]` (array
form). The popup HTML surface is ESM; only the worker must be flat.

### Key invariants

- **Never close a tab.** There is no `tabs.remove()` anywhere in the
  source — suspension is always reversible.
- **Storage resilience.** Missing or corrupted preferences fall back to
  defaults rather than throwing.
- **Message isolation.** All cross-surface messages are typed and
  validated at the boundary (`src/types/messages.ts`).

---

## Development

```bash
# from the repo root (workspace deps must be built once)
pnpm install

# build the Firefox bundle into dist/
pnpm -F @some-extension/suspender-ledger build:firefox

# unit tests (Vitest)
pnpm -F @some-extension/suspender-ledger test

# full local gate: eslint, web-ext lint, MPL headers, typecheck
pnpm -F @some-extension/suspender-ledger lint
```

Individual checks:

| Command         | Checks                                         |
| --------------- | ---------------------------------------------- |
| `typecheck`     | `tsc --noEmit`                                 |
| `test`          | Vitest unit suite                              |
| `lint:js`       | ESLint                                         |
| `check:headers` | MPL-2.0 headers present on ported files        |
| `build:firefox` | Production Vite build → `dist/`                |
| `lint:ext`      | `web-ext lint --source-dir dist --self-hosted` |

To load the unsigned build for manual testing: Firefox →
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
select `dist/manifest.json`. Temporary add-ons do not survive a restart —
for persistence, sign and install the `.xpi` (below).

---

## Signing for Firefox (private unlisted)

Firefox only persists an extension across restarts if it is signed. For a
private, unlisted add-on, signing goes through AMO with
`--channel=unlisted`: no public listing and no review queue — just a
cryptographically signed `.xpi` returned within minutes.

1. Get AMO API credentials:
   https://addons.mozilla.org/en-US/developers/addon/api/key/
2. Copy `.env.example` → `.env.local` and fill in `WEB_EXT_API_KEY` /
   `WEB_EXT_API_SECRET`.
3. Build: `pnpm -F @some-extension/suspender-ledger build:firefox`
4. Sign: `pnpm -F @some-extension/suspender-ledger sign:firefox`
   (writes the signed `.xpi` to `artifacts/`)
5. Install: Firefox → `about:addons` → gear icon → **Install Add-on From
   File** → select `artifacts/*.xpi`
6. Verify: restart Firefox completely and confirm the extension is still
   listed in `about:addons` with status **Enabled**, and that tab
   suspension still works.

> **Never commit `.env.local` or signed `.xpi` files.** Both are
> gitignored. AMO API credentials must never enter the repository.
>
> The extension ID (`browser_specific_settings.gecko.id`) is
> **`suspender-ledger@paulgsc.com`** and must stay stable across signs —
> changing it makes AMO treat the upload as a brand-new extension.

`sign:firefox` is intentionally **not** wired into `turbo.json` or CI: it
requires credentials and is a manual, local-only step.

---

## AMO submission checklist

- [ ] `pnpm -F @some-extension/suspender-ledger build:firefox` exits 0
- [ ] `pnpm -F @some-extension/suspender-ledger lint:ext` reports 0 errors
      and 0 warnings
- [ ] `dist/worker.js` is a single flat file with no `import`/`import()`
- [ ] `dist/manifest.json` is Firefox MV3 (`background.scripts`, explicit
      `content_security_policy`, stable `gecko.id`)
- [ ] Typecheck, unit tests, ESLint, and MPL-header check all pass
- [ ] `.env.local` populated with valid AMO credentials (local only)
- [ ] `sign:firefox` produces a signed `.xpi` in `artifacts/`
- [ ] Signed `.xpi` installs via `about:addons` and persists across a full
      Firefox restart

---

## License

Dual-licensed **MPL-2.0 AND MIT**. Files ported from auto-tab-discard v3
carry MPL-2.0 headers; all original code is MIT. See [`NOTICE`](./NOTICE)
and [`COPYING.MPL-2.0`](./COPYING.MPL-2.0) for the full breakdown.
