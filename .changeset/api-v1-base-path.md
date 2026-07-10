---
"@some-ui/fetch-kit": minor
---

Add `apiUrl`/`API_V1_PREFIX`/`DEFAULT_API_BASE_URL` helpers for building requests against `file_host`'s versioned `/api/v1` base path, and move built-in call sites off hardcoded per-endpoint URLs onto them.
