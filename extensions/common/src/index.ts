/**
 * @some-extension/common — shared typestate and primitives for all extension workspaces.
 *
 * Start here: {@link https://github.com/paulgsc/some-ui/blob/main/extensions/common/GOOD_CITIZEN.md | The Good-Citizen Charter}
 *
 * Two mandates drive everything in this package:
 *   1. **Disjointness** — a diff in one workspace must never break another.
 *   2. **No reinvention** — shared contracts live here; applications stay isolated per workspace.
 *
 * ## Exports
 * - {@link ./lib/layers} — overlay-root / page-layer DOM helpers
 * - {@link ./lib/migration-ledger} — per-workspace, isolated, idempotent migration ledger
 * - {@link ./lib/keybindings} — keybinding/command typestate (ModifierSet, KeyBinding, CommandRegistry, attachKeyBindings)
 */

export * from "./lib/layers"
export * from "./lib/migration-ledger"
export * from "./lib/keybindings/index"
export * from "./utils"
