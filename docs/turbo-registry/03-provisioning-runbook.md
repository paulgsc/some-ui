# Provisioning the Registry & Distributing Credentials — Runbook

> Runbook for TURBO-FOUND S3 (#583), part of the turbo registry epic (#596,
> milestone M17). Implements the decision in `02-registry-decision.md`
> (Vercel Remote Cache, per-consumer scoped tokens).
>
> **Status: prep complete, live provisioning still open.** Everything in
> this repo that can be done without an external account has been done and
> verified. Creating the Vercel team/tokens and the GitHub Actions secrets
> requires a human with an actual Vercel login and this repo's GitHub admin
> access — an agent session has neither, so those steps are written up here
> as exact commands rather than executed. Whoever runs this should be able
> to go top to bottom and finish in under ten minutes.

## What's already true (no action needed)

- `turbo` 2.10.0 is the installed CLI (`package.json`'s `"turbo": "^2.5.6"`
  resolves to it here). Vercel Remote Cache support has shipped in turbo
  for years — no version bump needed.
- `TURBO_API` does not need to be set — Vercel's endpoint is turbo's
  default when `TURBO_TOKEN`/`TURBO_TEAM` are present without it.
- The task graph this registry will cache against was audited and fixed in
  S1 (#581) — see `01-task-graph-audit.md`. Provisioning against an
  unaudited graph would have meant re-verifying all of this after the fact;
  it's already done.
- A local-cache round trip (write, then hit) was already verified end to
  end during the S1 fix — see that doc's "Verified the fix" section. The
  only thing provisioning changes is _where_ the cache lives (Vercel
  instead of `node_modules/.cache/turbo` / `.turbo/`), not the mechanics.

## Step 1 — Create the Vercel team (human, ~2 min)

If there's not already a Vercel team to use for this:

1. Sign in at vercel.com (or create an account) with the repo owner's
   identity.
2. Create a team (or use an existing personal scope — a team is
   recommended even for a single maintainer, since `TURBO_TEAM` is required
   for multi-consumer sharing and a personal-scope token doesn't have a
   stable slug to hand to CI).
3. Note the team slug — this is the `TURBO_TEAM` value everywhere below.

## Step 2 — Generate two scoped tokens (human, ~2 min)

Per the auth model in `02-registry-decision.md`, create two Vercel personal
access tokens, both scoped to the team from Step 1:

1. Vercel dashboard → Account Settings → Tokens → Create Token.
   - Name: `some-ui-ci`. Scope: the team from Step 1. No expiry, or a long
     one with a calendar reminder to rotate — your call.
   - Name: `some-ui-agent`. Same team, same scoping.
2. Copy each token value immediately — Vercel only shows it once.

(Local dev doesn't need a token generated here — it uses `turbo login &&
turbo link` per-developer, which is interactive and has nothing to
provision ahead of time.)

## Step 3 — Add GitHub Actions secrets (human with repo admin, ~1 min)

In `paulgsc/some-ui` → Settings → Secrets and variables → Actions, add:

| Secret name   | Value                              |
| ------------- | ---------------------------------- |
| `TURBO_TOKEN` | the `some-ui-ci` token from Step 2 |
| `TURBO_TEAM`  | the team slug from Step 1          |

Wiring an actual workflow to read these is explicitly **out of scope**
here — that's TURBO-CI. This step only makes the secrets exist so TURBO-CI
has something to reference.

## Step 4 — Document the agent-sandbox credential path (this repo, done)

`.claude/hooks/session-start.sh` doesn't read `TURBO_TOKEN`/`TURBO_TEAM`
today, and won't be changed to in this story (that's TURBO-AGENT's job per
the epic's non-goals). What's recorded here, so TURBO-AGENT doesn't have to
rediscover it:

- Credential: the `some-ui-agent` token from Step 2, plus the same
  `TURBO_TEAM` slug.
- Injection point: this Claude Code environment's own secret/env
  configuration (set outside the repo, the same way `CLAUDE_CODE_REMOTE`
  is already implicitly available to `session-start.sh` today) — **not** a
  file committed to the repo, and not a nix shellHook (that shell is for
  local dev, not this sandbox).
- **Hard prerequisite, not just plumbing:** per `02-registry-decision.md`,
  this sandbox's outbound proxy is default-deny and currently rejects both
  `vercel.com` and `api.vercel.com` with a 403 at the CONNECT layer (tested
  and reproduced in this session — see that doc for the exact commands).
  Setting the env vars alone will not make the cache reachable; the
  environment's network policy also needs `vercel.com` and `api.vercel.com`
  allowlisted. Confirmed today's default denies both:

  ```
  $ curl -o /dev/null -w "HTTP %{http_code}\n" https://api.vercel.com/v2/user
  curl: (56) CONNECT tunnel failed, response 403
  ```

## Step 5 — Local dev (this repo, done)

No provisioning needed. Any developer runs, once:

```
npx turbo login
npx turbo link
```

This writes their own Vercel-identity-scoped token to `~/.turbo/config.json`
(outside the repo). Nothing to add to `flake.nix`'s `default`/`ci`
shellHooks for this — `turbo login`/`link` state lives outside the repo and
outside the nix store on purpose (per-developer, not per-machine-config).

## Step 6 — Smoke test (human, after Steps 1–3; ~2 min)

Run by hand, once, from a machine with normal internet access (local dev or
a GitHub Actions runner — **not** this Claude Code sandbox until Step 4's
allowlist change lands):

```bash
export TURBO_TOKEN=<the some-ui-ci token>
export TURBO_TEAM=<team slug>

# first run: should MISS and write to the remote cache
npx turbo run build --filter=some-ui-mdx --force

# second run: should report a remote cache HIT
npx turbo run build --filter=some-ui-mdx
```

Confirm the second run's summary shows `Cached: 1 cached, 1 total` with
`>>> FULL TURBO`, and that it was a _remote_ hit — clear the local
`.turbo`/`node_modules/.cache/turbo` cache between runs
(`rm -rf packages/mdx-generator/.turbo`) or run from a second, clean
checkout to rule out a local-only hit.

## Acceptance criteria status

- [x] Findings/decision docs merged (this doc + the two others in
      `docs/turbo-registry/`).
- [ ] Registry live and reachable from a GitHub Actions runner — blocked on
      Steps 1–3 (human action, external accounts).
- [ ] Registry reachable from a Claude Code sandbox — blocked on Step 4's
      environment network-policy change, in addition to Steps 1–2.
- [ ] Credentials exist as GH secrets — blocked on Steps 1–3.
- [ ] Manual `turbo run build` round-trip against the live registry —
      blocked on the above; the _mechanics_ (cache write then hit) are
      already verified locally in S1's fix-verification and will work
      identically once `TURBO_TOKEN`/`TURBO_TEAM` point at a real team.
