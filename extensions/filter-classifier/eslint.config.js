import { extensionsRecommended, rawSourceConfig } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// Standalone Playwright corpus/harness package with no build step or bundler
// of its own (see package.json description): its source is consumed directly
// by the Playwright/Storybook runners, so "../" stays allowed. See the kit's
// raw-source.config.ts.
export default defineConfig([...extensionsRecommended, ...rawSourceConfig])
