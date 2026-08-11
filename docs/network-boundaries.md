# Network dependency boundaries

Application and shared-library HTTP calls use `@some-ui/fetch-kit`. Its client
declares a ten-second default timeout, accepts a caller lifecycle signal, and
does not retry unless the call site opts in. In particular, writes are never
retried by default: this repository has no idempotency keys with which to make
an ambiguous `POST` response safe to repeat.

`network-boundary/no-raw-fetch` enforces this for `apps/**` and `packages/**`.
Its temporary, reason-commented allowlist is in `base.config.ts` and is intended
to shrink before the rule is promoted from warning to error.

## Extensions

Extensions are deliberately outside this rule's scope. They execute in browser
extension contexts with host-permission, CSP, and background/content-script
constraints that a shared application HTTP client must not silently broaden.
Their current localhost transports therefore declare their own ten-second
`AbortSignal.timeout` at the raw call site:

- `some-censor`'s API client is development-only (`_assertDev`), throws from
  production builds, and bounds every localhost debugging request.
- `some-conveyor`'s effect bus talks to its localhost companion from a content
  script and bounds that effect where it is executed.

They remain visible in the raw-fetch census, but are bounded extension-specific
transports rather than unresolved exceptions and must not be copied into an app
or shared package.
