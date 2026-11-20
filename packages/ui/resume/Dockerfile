# syntax=docker/dockerfile:1.7

# The LAN résumé render service (scripts/serve.mjs), built from this directory
# alone and published as pgathondu/resume-render by
# .github/workflows/resume-docker-release.yml.
#
# It needs only this package's Typst source and its scripts, which use Node
# built-ins and nothing from npm, so there is no install step. The pinned
# typst binary and the SHA-pinned fonts are fetched at image build by the same
# code `pnpm build` uses (scripts/typst.mjs, scripts/fonts.mjs), so a render
# here sets type exactly as CI does. poppler-utils supplies `pdftotext` for
# the ATS and layout checks the service runs on every render.
FROM node:26-alpine

RUN apk add --no-cache poppler-utils tar xz

WORKDIR /app
COPY scripts ./scripts
COPY src ./src

# Into node_modules/.cache, where scripts/typst.mjs and scripts/fonts.mjs
# look before downloading anything.
RUN node -e 'import("./scripts/typst.mjs").then((m) => m.resolveTypst())'

USER node
ENV PORT=3100
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "scripts/serve.mjs"]

# What paulgsc/server's release check reads (its scripts/check_release.py,
# docs/release.md "Constraints"), last, so no layer depends on them.
# - resume-api: what scripts/serve.mjs answers (`/health`, and `/render`
#   taking `{variant, template, pii}`), which www's /api/resume/ proxy and
#   its /resume-build page call. Raise it in the same change that breaks
#   what an older www sends; home's release then refuses a www that requires
#   more than the resume-render beside it provides.
LABEL io.paulgsc.provides="resume-api=1" \
      io.paulgsc.requires=""
