import url from 'node:url'
import eslint from '@eslint/js'
import deprecationPlugin from 'eslint-plugin-deprecation'
import prettier from 'eslint-config-prettier'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import jsonPlugin from 'eslint-plugin-json'
import prettierPlugin from 'eslint-plugin-prettier'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default [
  // eslint.configs.recommended,
  // tsPlugin.configs.recommended,
  // tsPlugin.configs.strict,
  // prettier
  // {
  //   plugins: {
  //     json: jsonPlugin,
  //     '@typescript-eslint': tsPlugin,
  //     prettier: prettierPlugin,
  //     deprecation: deprecationPlugin
  //   },
  //   ignores: [
  //     '**/jest.config.js',
  //     '**/node_modules/**',
  //     '**/dist/**',
  //     '**/package.json',
  //     '**/package-lock.json',
  //     '**/fixtures/**',
  //     '**/coverage/**',
  //     '**/__snapshots__/**',
  //     '**/.docusaurus/**',
  //     '**/build/**'
  //   ],
  //   languageOptions: {
  //     parser: tsParser,
  //     ecmaVersion: 'latest',
  //     sourceType: 'module',
  //     globals: {
  //       $: 'readonly',
  //       jQuery: 'readonly',
  //       html2canvas: 'readonly',
  //       ClipboardItem: 'readonly',
  //       grecaptcha: 'readonly'
  //     },
  //     parserOptions: {
  //       allowAutomaticSingleRunInference: true,
  //       cacheLifetime: {
  //         glob: 'Infinity'
  //       },
  //       project: ['./tsconfig.json', './packages/**/tsconfig.json'],
  //       tsconfigRootDir: __dirname,
  //       warnOnUnsupportedTypeScriptVersion: false
  //     }
  //   },
  //   rules: {
  //     'deprecation/deprecation': 'error',
  //     '@typescript-eslint/no-confusing-void-expression': 'off',
  //     '@typescript-eslint/ban-ts-comment': [
  //       'error',
  //       {
  //         'ts-expect-error': 'allow-with-description',
  //         'ts-ignore': true,
  //         'ts-nocheck': true,
  //         'ts-check': false,
  //         minimumDescriptionLength: 5
  //       }
  //     ],
  //     '@typescript-eslint/consistent-type-imports': [
  //       'error',
  //       { prefer: 'type-imports', disallowTypeAnnotations: true }
  //     ],
  //     '@typescript-eslint/explicit-function-return-type': [
  //       'error',
  //       { allowIIFEs: true }
  //     ],
  //     '@typescript-eslint/no-explicit-any': 'error',
  //     'no-constant-condition': 'off',
  //     '@typescript-eslint/no-unnecessary-condition': [
  //       'error',
  //       { allowConstantLoopConditions: true }
  //     ],
  //     '@typescript-eslint/no-var-requires': 'off',
  //     '@typescript-eslint/prefer-literal-enum-member': [
  //       'error',
  //       {
  //         allowBitwiseExpressions: true
  //       }
  //     ],
  //     '@typescript-eslint/prefer-string-starts-ends-with': [
  //       'error',
  //       {
  //         allowSingleElementEquality: 'always'
  //       }
  //     ],
  //     '@typescript-eslint/unbound-method': 'off',
  //     '@typescript-eslint/restrict-template-expressions': [
  //       'error',
  //       {
  //         allowNumber: true,
  //         allowBoolean: true,
  //         allowAny: true,
  //         allowNullish: true,
  //         allowRegExp: true
  //       }
  //     ],
  //     '@typescript-eslint/no-unused-vars': [
  //       'error',
  //       {
  //         caughtErrors: 'all',
  //         varsIgnorePattern: '^_',
  //         argsIgnorePattern: '^_'
  //       }
  //     ],
  //     '@typescript-eslint/prefer-nullish-coalescing': [
  //       'error',
  //       {
  //         ignoreConditionalTests: true,
  //         ignorePrimitives: true
  //       }
  //     ]
  //   },
  //   settings: {
  //     'import/resolver': {
  //       typescript: {
  //         alwaysTryTypes: true,
  //         project: ['frontend/tsconfig.json']
  //       },
  //       node: true
  //     }
  //   }
  // },
  // {
  //   files: ['*.ts', '*.tsx'],
  //   languageOptions: {
  //     parser: tsParser,
  //     parserOptions: {
  //       ecmaVersion: 'latest',
  //       sourceType: 'module',
  //       project: '**/tsconfig.json'
  //     }
  //   },
  //   plugins: {
  //     '@typescript-eslint': tsPlugin,
  //     prettier: prettierPlugin
  //   },
  //   rules: {
  //     '@typescript-eslint/explicit-function-return-type': ['error'],
  //     '@typescript-eslint/no-empty-function': 'error',
  //     '@typescript-eslint/no-unused-vars': [
  //       'error',
  //       { argsIgnorePattern: '^(_|e|event)', varsIgnorePattern: '^_' }
  //     ],
  //     '@typescript-eslint/no-var-requires': 'error',
  //     '@typescript-eslint/no-this-alias': 'off',
  //     '@typescript-eslint/no-misused-promises': [
  //       'error',
  //       {
  //         checksVoidReturn: false
  //       }
  //     ],
  //     '@typescript-eslint/promise-function-async': 'error',
  //     '@typescript-eslint/no-floating-promises': 'error',
  //     '@typescript-eslint/strict-boolean-expressions': [
  //       'error',
  //       { allowNullableBoolean: true, allowNullableNumber: true }
  //     ],
  //     '@typescript-eslint/non-nullable-type-assertion-style': 'off',
  //     '@typescript-eslint/no-unnecessary-condition': 'off',
  //     '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  //     '@typescript-eslint/no-invalid-void-type': 'off'
  //   }
  // },
  // {
  //   files: ['backend/**/*.ts'],
  //   rules: {
  //     eqeqeq: 'error'
  //   }
  // }
]
