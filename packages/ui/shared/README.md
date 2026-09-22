# @some-ui/shared

Shared React components for `packages/ui/*` and `apps/www`. Consumed as **source**
(`"main": "./src/index.ts"`) — there is no build step; consumers compile these files.

## Relationship to shadcn/ui

`src/components/ui/*` was originally vendored from [shadcn/ui](https://ui.shadcn.com)
and has since diverged. **This package is a fork, not a shadcn install.** There is no
`components.json`, and `npx shadcn add` is not part of any workflow here.

That `components.json` was deleted deliberately rather than repaired. Every field in it
had become false, and a stale config is worse than none — it invites `npx shadcn add`,
which would then write a file in a dialect this repo does not speak:

| field it declared  | why it was false                                             |
| ------------------ | ------------------------------------------------------------ |
| `tailwind.config`  | Tailwind v4 — no `tailwind.config.ts` exists                 |
| `tailwind.css`     | pointed at `src/globals.css`, which does not exist           |
| `rsc: true`        | no Next.js; `apps/www` is Vite                               |
| `style: "default"` | retired upstream style name                                  |
| `aliases`          | `@shared/*` does not resolve as a tsconfig path in this repo |

### What diverged, and why that is fine

These components render against **this repo's** token contract, not shadcn's defaults:
`@some-ui/styles` owns the semantic variables (`--background`, `--primary`, …) via
`@theme inline` in `packages/some-styles/tailwind.css`, and `ThemeScope` in
`packages/some-styles/src/theme/registry.ts` states what a reusable component may do
with a theme. Upstream has no equivalent. Adopting upstream source wholesale would
regress that.

`cn` is likewise already centralised — `src/lib/utils.ts` re-exports it from
`@some-ui/core-utils`, so upstream's 2026 move to a published `cn` package is a
no-op here.

### Using upstream as a reference

Upstream remains a useful **reference**, and its composition primitives — `Field`,
`Item`, `Empty`, `Spinner`, `Kbd`, `ButtonGroup`, `InputGroup`, `Pagination` — are
plain Tailwind + `cn` + `cva` with no Radix or Base UI import, so they can be adopted
by hand without any primitive-library decision. Copy the source, repoint `cn` at
`../../lib/utils`, and check the classes against the tokens above.

Note that upstream now ships three primitive bases (Radix, Base UI, React Aria) and
defaults new projects to Base UI. **This package stays on Radix**, which is actively
maintained and carries no deprecation. Migrating is a per-component decision with a
real API delta (`asChild` → `render`), not a version bump.

### Component generations

`src/components/ui/*.tsx` currently holds two vintages side by side:

- **`data-slot` generation** (the 2025+ rewrite): `command`, `dialog`, `label`,
  `popover`, `progress`, `scroll-area`, `switch`, `textarea`.
- **`forwardRef` generation** (pre-2025): everything else.

Both compile and both are correct Tailwind v4 — `ring-offset-background` does resolve
to `ring-offset-color: var(--background)`. They differ in focus-ring idiom
(`ring-2 ring-offset-2` vs `ring-[3px] ring-ring/50` plus `aria-invalid:` variants) and
in default control height (`h-10` vs `h-9`). Normalising toward one idiom is worth doing
opportunistically, in PRs that already touch the file; it is not a standing migration.
