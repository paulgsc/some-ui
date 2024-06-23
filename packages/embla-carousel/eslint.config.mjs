import { default as baseConfig } from '../../eslint.config.mjs' // Import base configuration from JSON

import tsParser from '@typescript-eslint/parser' // TypeScript parser

export default [
  ...baseConfig // Spread base configuration
]
