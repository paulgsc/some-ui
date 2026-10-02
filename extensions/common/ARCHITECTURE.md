# Architecture — `@some-extension/common`

**Artifact:** Shared TypeScript library imported by all extension workspaces.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

The shared commons that balances two mandates: **disjointness** (a diff in one workspace must never break another) and **no reinvention** (contracts, primitives, and idioms are defined once). It hoists contracts and typestate; keeps application logic per-workspace; enforces idioms via a shared linter.

---

## Entry points

| Export | Path | Purpose |
|---|---|---|
| Keybindings | `src/lib/keybindings/index.ts` | `ModifierSet`, `KeyBinding`, `Command` registry |
| Layers | `src/lib/layers.ts` | `getOverlayRoot`, `EXT_ATTR`, overlay/page-layer helpers |
| MigrationLedger | `src/lib/migration-ledger.ts` | Per-workspace isolated storage migrations |

All re-exported from `src/index.ts`.

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **Good-Citizen Charter** | `GOOD_CITIZEN.md` — the normative reference every workspace reads before touching content scripts. Covers shadow DOM, z-index policy, fullscreen, resource budgets, storage namespacing, logic/effects separation. |
| **Keybinding typestate** | `ModifierSet` × `KeyboardEvent.code` → typed `KeyBinding`; platform-normalized matcher; `isInputContext` guard. Defined once; each workspace defines its own handler table. |
| **MigrationLedger** | Per-workspace, isolated, idempotent schema migrations. Workspace `w` has its own counter independent of every other workspace. |
| **Layers** | `getOverlayRoot()` / page-layer helpers that enforce structural isolation (extension UI is never a descendant of the filtered page content). |
| **Coexistence primitives** | `ShadowHost`, `PageMonitor`/`AttentionMode`, `DisposableRegistry` — planned for extraction from `some-conveyor` (issues #280–#282). |
| **Z-index policy** | Single constant `Z_INDEX_POLICY = 2147483640` with deliberate headroom below `MAX_INT`. Planned for extraction (#282). |
| **Governance table** | Five classes: typestate / primitive / lint-rule / migration / copy-inline reference encyclopedia (CMN-UTILS, #357–#362). |

---

## Module map

```
src/
  index.ts                      — re-exports everything
  lib/
    keybindings/
      index.ts                  — ModifierSet, KeyBinding, Command, matcher, isInputContext
    layers.ts                   — getOverlayRoot, EXT_ATTR, page-layer helpers
    migration-ledger.ts         — MigrationLedger class
GOOD_CITIZEN.md                 — normative charter (start here)
README.md                       — overview + governance table
```

---

## Critical invariants

| # | Invariant |
|---|---|
| C1 | Every workspace that imports this package must import only the contract/typestate, never application logic. |
| C2 | `MigrationLedger` migrations are namespaced per workspace; workspace `w`'s migration counter is never modified by workspace `u`. |
| C3 | No commons export has side effects at import time — the package is a pure library. |
| C4 | The z-index constant `2147483640` (not `2147483647`) is the only allowed overlay z-index; workspaces that use `MAX_INT` violate Charter §6. |

---

## See also

- [Good-Citizen Charter](./GOOD_CITIZEN.md)
- Epics: [CMN-KB #271](https://github.com/paulgsc/some-ui/issues/271) · [CMN-COEXIST #272](https://github.com/paulgsc/some-ui/issues/272) · [CMN-UTILS #357](https://github.com/paulgsc/some-ui/issues/357)
