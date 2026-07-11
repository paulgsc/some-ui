# Remote Cache Backend & Auth Model — Decision

> Decision for TURBO-FOUND S2 (#582), part of the turbo registry epic (#596,
> milestone M17). This is the one place the backend and auth model get
> decided — TURBO-CI, TURBO-AGENT, and TURBO-WASM implement against this,
> they don't re-litigate it.

## Decision

**Backend: Vercel Remote Cache (hosted).**
**Auth model: per-consumer scoped Vercel personal access tokens, one shared
Vercel team.**

## Why hosted over self-hosted

The alternative considered was self-hosting `ducktors/turborepo-remote-cache`
(or equivalent) in front of S3/R2.

|                                       | Vercel Remote Cache                                                                                                                                                                                                                                                   | Self-hosted (`turborepo-remote-cache` + S3/R2)                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cost                                  | Free on all plans, including Hobby, subject to fair-use guidelines ([turborepo.dev/blog/free-vercel-remote-cache](https://turborepo.dev/blog/free-vercel-remote-cache), [vercel.com/docs/monorepos/remote-caching](https://vercel.com/docs/monorepos/remote-caching)) | Free software, but needs a bucket + a running server process somewhere (Fly.io/a VM/a Worker) — real infra to pay for and keep alive |
| Setup effort                          | `turbo login` + `turbo link`, or a PAT + team slug                                                                                                                                                                                                                    | Deploy a server, provision a bucket, wire IAM, pick a domain, keep it patched                                                        |
| Maintenance                           | None — Vercel's problem                                                                                                                                                                                                                                               | Ours: uptime, TLS cert, storage lifecycle/eviction, version upgrades                                                                 |
| Reachability from CI / local dev      | Standard HTTPS to `vercel.com` / `api.vercel.com`                                                                                                                                                                                                                     | Standard HTTPS to whatever domain we pick                                                                                            |
| Reachability from Claude Code sandbox | **Blocked by default today** (see below)                                                                                                                                                                                                                              | **Also blocked by default today** — same proxy, no special-cases for either                                                          |

This repo is a solo-maintainer personal project with no data-residency or
vendor-independence requirement strong enough to justify running and paying
for a second always-on service just to save artifacts turbo can already
store for free. Self-hosting would be the right call if this were a team
repo with compliance constraints; it isn't one. Vercel Remote Cache wins on
cost, effort, and maintenance with no offsetting advantage for self-hosting.

## Reachability — checked, not assumed

The epic explicitly calls out "whether Claude Code sandboxes can reach it"
as an open question. Rather than guess, this was tested directly from a
live Claude Code sandbox session in this repo:

```
$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
{
  "noProxy": "localhost,127.0.0.1,...,anthropic.com,registry.npmjs.org,
              jsr.io,pypi.org,files.pythonhosted.org,index.crates.io,
              proxy.golang.org,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,..."
}

$ curl -o /dev/null -w "HTTP %{http_code}\n" https://vercel.com/api/www/user
curl: (56) CONNECT tunnel failed, response 403
$ curl -o /dev/null -w "HTTP %{http_code}\n" https://api.vercel.com/v2/user
curl: (56) CONNECT tunnel failed, response 403
$ curl -o /dev/null -w "HTTP %{http_code}\n" https://r2.cloudflarestorage.com
curl: (56) CONNECT tunnel failed, response 403          # self-hosted candidate, same result
$ curl -o /dev/null -w "HTTP %{http_code}\n" https://registry.npmjs.org
HTTP 200                                                  # allowlisted registries work fine
```

**Finding:** this environment's outbound proxy is default-deny, allowlisting
only a short list of package registries (npm, jsr, PyPI, crates.io, Go
proxy) and Anthropic's own domains. Neither Vercel's remote-cache API nor
any self-hosted domain is reachable today — both get rejected identically
at the proxy's CONNECT layer (403), before TLS or auth ever enters the
picture. This is a property of _this specific sandbox environment's network
policy_, not of either backend choice — it doesn't differentiate the two
options, but it does mean **neither backend works from a Claude Code
sandbox until the environment's network policy allowlists the chosen
host** (`vercel.com` + `api.vercel.com` for the decision made here). That
allowlist change is an environment-configuration action for whoever owns
this Claude Code environment's settings (see
[the on-the-web docs](https://code.claude.com/docs/en/claude-code-on-the-web)),
not a code change — it's called out explicitly as follow-up work in the S3
runbook (`03-provisioning-runbook.md`) and is a hard prerequisite for
TURBO-AGENT, not for TURBO-CI (GitHub Actions runners have unrestricted
egress by default and are unaffected).

## Auth model: per-consumer scoped tokens, not one shared secret

Vercel makes creating multiple named personal access tokens against the
same team trivial (each is independently revocable/rotatable, and shows up
distinctly in the team's audit log), so there's no real cost to scoping
per-consumer instead of sharing one token everywhere:

- **Local dev (persistent, interactive):** `npx turbo login && npx turbo link`.
  This is Vercel's own OAuth-backed flow — it writes a token tied to the
  _developer's own Vercel identity_ into `~/.turbo/config.json` (outside
  the repo, never committed). No token to generate or rotate by hand for
  this consumer; per-developer identity is a better audit trail than a
  shared secret anyway.
- **CI (ephemeral, non-interactive):** a dedicated Vercel PAT
  (e.g. named `some-ui-ci`), stored as `TURBO_TOKEN` + `TURBO_TEAM` GitHub
  Actions repo secrets.
- **Claude Code agent sandbox (ephemeral, non-interactive):** a second,
  separate PAT (e.g. named `some-ui-agent`), stored as `TURBO_TOKEN` +
  `TURBO_TEAM` in the Claude Code environment's own secret store, read by
  `.claude/hooks/session-start.sh`.

Rationale: CI and the agent sandbox are different trust boundaries (CI runs
on `main`-protected pushes and PRs; the agent sandbox runs arbitrary
in-session work, including from third-party PR content in some flows) — a
leaked or over-broadly-scoped agent-sandbox token shouldn't require
rotating CI's, and vice versa. Cost of the split is zero (two PATs instead
of one, same team); benefit is real, independent revocability. A single
shared token was considered and rejected on that basis, not on setup
effort — setup effort is identical either way.

Both CI and agent tokens share the _same_ Vercel team (`TURBO_TEAM`), since
the goal is one cache both consumers read/write, not isolated caches per
consumer — splitting the team as well as the token would defeat the point
of a shared registry.

## Env vars (names fixed by turbo, not by us)

- `TURBO_TOKEN` — bearer token (Vercel PAT, scoped per consumer as above).
- `TURBO_TEAM` — the Vercel team slug, shared across CI and agent tokens.
- `TURBO_API` — **not needed.** Only required for the self-hosted path
  (custom base URL); Vercel's hosted endpoint is turbo's default.

Optional hardening, not required for v1: `TURBO_REMOTE_CACHE_SIGNATURE_KEY`
enables artifact signing so a cache entry can't be tampered with in
transit/storage. Worth revisiting once the registry has been live a while;
not a blocker for provisioning.

## What every downstream story can now assume

- Backend is Vercel Remote Cache — no `TURBO_API` to configure, ever.
- Three tokens exist or will exist (local via `turbo link`, `some-ui-ci`,
  `some-ui-agent`), one shared `TURBO_TEAM`.
- TURBO-AGENT's wiring is blocked on an environment-policy allowlist change
  for `vercel.com`/`api.vercel.com`, in addition to the token — flag this
  explicitly in that story, it is not optional plumbing.
- TURBO-CI has no reachability blocker; it only needs the two secrets set.
