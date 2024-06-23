import { default as baseConfig } from '../../eslint.config.mjs' // Import base configuration from JSON

import tsParser from '@typescript-eslint/parser' // TypeScript parser
import { ESLint } from 'eslint' // ESLint for recommended rules

const eslint = new ESLint() // ESLint instance for recommended rules

export default [
  {
    ...baseConfig, // Spread base configuration
    overrides: [
      {
        files: ['**/*.{js,mjs,ts,tsx,mdx}'],
        parser: tsParser,
        parserOptions: {
          ecmaVersion: 2018,
          sourceType: 'module'
        },
        rules: {
          'no-debugger': 'error',
          'no-console': 'error',
          // Uncomment or add more TypeScript-specific rules as needed
          // '@typescript-eslint/no-inferrable-types': 'off',
          // '@typescript-eslint/no-explicit-any': 'off',
          // '@typescript-eslint/no-namespace': 'off',
          '@typescript-eslint/ban-types': [
            'error',
            {
              types: {
                '{}': false
              },
              extendDefaults: true
            }
          ]
        }
      }
    ]
  }
]
