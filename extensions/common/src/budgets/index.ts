/**
 * `@some-extension/common/budgets` — the admission rule that keeps any
 * extension in this workspace from shipping code that can hang a tab.
 *
 * See `admission.ts` for what the rule states and what it does not prove,
 * and the consuming extension's own `tests/budgets/README.md` for how that
 * extension wires it up.
 *
 * Nothing in this directory knows about any particular extension. The
 * per-extension part is the ledger — which primitives that extension uses,
 * at what declared cost, owned by which module — and it lives with the
 * extension. If a change here ever needs to know an extension's name, a
 * module path or a function name, that is the signal the rule has been
 * over-fitted to one codebase and should be pushed back out.
 *
 * Entry points:
 *   - `@some-extension/common/budgets`        this barrel (framework-free)
 *   - `@some-extension/common/budgets/vitest` `describeAdmissionGate`
 */

export * from "./effect-alphabet"
export * from "./bundle-effect-scan"
export * from "./ledger"
export * from "./admission"
export * from "./selector-cost"
export * from "./dense-document"
export * from "./traversal-source-scan"
