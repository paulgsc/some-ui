import { defineNodeTest } from "@some-ui/vite-config/vitest"

// The build scripts' pure parts (scripts/agent-documents.mjs). Everything the
// scripts check against the rendered PDFs runs in `pnpm build` instead.
export default defineNodeTest({ include: ["scripts/**/*.test.mjs"] })
