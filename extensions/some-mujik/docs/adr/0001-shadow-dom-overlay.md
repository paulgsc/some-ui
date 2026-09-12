# ADR 0001 — Shadow DOM overlay isolation + Z_INDEX_POLICY for the visualizer

- **Status:** Accepted
- **Date:** 2026-06-23
- **Refs:** [Good-Citizen Charter §5–§6](../../common/GOOD_CITIZEN.md)

## Context

The music visualizer overlay must be rendered on top of arbitrary host pages without inheriting their styles, being styled by them, or interfering with their z-index stacking contexts. Early prototypes used a plain `div` appended to `document.body`, which was frequently overridden by host-page styles and z-index wars.

## Decision

The overlay is mounted inside a closed shadow DOM (`attachShadow({ mode: 'closed' })`). All overlay styles are scoped inside the shadow root. The shadow host element is positioned at z-index `2147483640` (the commons `Z_INDEX_POLICY` constant — 7 below `MAX_INT` to leave headroom for browser chrome).

## Trade-offs accepted

- Shadow DOM means the host page's CSS variables and themes are not automatically inherited — the overlay must explicitly replicate or import any design tokens it needs from `some-filter`'s theme system.
- `mode: 'closed'` prevents external scripts from accessing the shadow root, which is intentional but means debugging requires DevTools shadow DOM inspection.

## Alternatives rejected

- **Plain `div` with high z-index:** subject to host-page style inheritance and z-index wars. Rejected.
- **`z-index: 2147483647` (MAX_INT):** violates Charter §6 which reserves headroom. Rejected.
- **`mode: 'open'` shadow DOM:** allows host-page scripts to traverse into the shadow root, which violates the isolation contract. Rejected.
