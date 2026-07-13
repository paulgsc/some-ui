import { createDevConfig } from "@some-extension/common/build/dev-config"

import context from "./build.context"

// Production output is built by `some-ext-build` (extensions/common/build),
// driven by build.context.ts. This file only wires the `pnpm dev` server to
// the same alias context. Firefox is the default target, matching the prior
// vite.config.ts re-export of vite.config.firefox.ts.
export default createDevConfig(context, "firefox")
