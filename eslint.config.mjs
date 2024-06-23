//@ts-check
import url from 'node:url'

import eslint from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import deprecationPlugin from 'eslint-plugin-deprecation'
import jsonPlugin from 'eslint-plugin-json'
import json from 'eslint-plugin-json'
import prettierPlugin from 'eslint-plugin-prettier'
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort'
import unicornPlugin from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default [
  eslint.configs.recommended,
  // tsPlugin.configs.recommended,
  // tsPlugin.configs.strict,
  prettier,
  {
    plugins: {
      json: jsonPlugin,
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      deprecation: deprecationPlugin,
      ['simple-import-sort']: simpleImportSortPlugin,
      ['unicorn']: unicornPlugin,
      'unused-imports': unusedImports
    },
    ignores: [
      '**/jest.config.js',
      '**/node_modules/**',
      '**/dist/**',
      '**/package.json',
      '**/package-lock.json',
      '**/fixtures/**',
      '**/coverage/**',
      '**/__snapshots__/**',
      '**/.docusaurus/**',
      '**/build/**'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2024,
        ...globals.node
      },
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        cacheLifetime: {
          glob: 'Infinity'
        },
        project: ['./tsconfig.json', './packages/**/tsconfig.json'],
        tsconfigRootDir: __dirname,
        warnOnUnsupportedTypeScriptVersion: false
      }
    },
    rules: {
      ...prettier.rules,
      'unicorn/no-typeof-undefined': 'error',

      //
      // eslint-base
      //

      curly: ['error', 'all'],
      eqeqeq: [
        'error',
        'always',
        {
          null: 'never'
        }
      ],
      'logical-assignment-operators': 'error',
      'no-else-return': 'error',
      'no-mixed-operators': 'error',
      'no-console': 'error',
      'no-process-exit': 'error',
      'no-fallthrough': [
        'error',
        { commentPattern: '.*intentional fallthrough.*' }
      ],
      'one-var': ['error', 'never'],

      //
      // eslint-plugin-eslint-comment
      //

      //
      // eslint-plugin-import
      //
      // enforces consistent type specifier style for named imports
      // 'import/consistent-type-specifier-style': 'error',
      // // disallow non-import statements appearing before import statements
      // 'import/first': 'error',
      // // Require a newline after the last import/require in a group
      // 'import/newline-after-import': 'error',
      // // Forbid import of modules using absolute paths
      // 'import/no-absolute-path': 'error',
      // // disallow AMD require/define
      // 'import/no-amd': 'error',
      // // forbid default exports - we want to standardize on named exports so that imported names are consistent
      // 'import/no-default-export': 'error',
      // // disallow imports from duplicate paths
      // 'import/no-duplicates': 'error',
      // // Forbid the use of extraneous packages
      // 'import/no-extraneous-dependencies': [
      //   'error',
      //   {
      //     devDependencies: true,
      //     peerDependencies: true,
      //     optionalDependencies: false
      //   }
      // ],
      // Forbid mutable exports
      // 'import/no-mutable-exports': 'error',
      // // Prevent importing the default as if it were named
      // 'import/no-named-default': 'error',
      // // Prohibit named exports
      // 'import/no-named-export': 'off', // we want everything to be a named export
      // // Forbid a module from importing itself
      // 'import/no-self-import': 'error',
      // // Require modules with a single export to use a default export
      // 'import/prefer-default-export': 'off', // we want everything to be named

      // enforce a sort order across the codebase
      'simple-import-sort/imports': 'error',

      'unused-imports/no-unused-imports': 'error'
    },

    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['frontend/tsconfig.json']
        },
        node: true
      }
    }
  },
  {
    files: ['*.ts', '*.tsx'],
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: '**/tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin
    },
    rules: {
      'deprecation/deprecation': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 5
        }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: true }
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowIIFEs: true }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-constant-condition': 'off',
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: true }
      ],
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/prefer-literal-enum-member': [
        'error',
        {
          allowBitwiseExpressions: true
        }
      ],
      '@typescript-eslint/prefer-string-starts-ends-with': [
        'error',
        {
          allowSingleElementEquality: 'always'
        }
      ],
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
          allowAny: true,
          allowNullish: true,
          allowRegExp: true
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrors: 'all',
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^(_|e|event)'
        }
      ],
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignoreConditionalTests: true,
          ignorePrimitives: true
        }
      ],
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false
        }
      ],
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowNullableBoolean: true, allowNullableNumber: true }
      ],
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-invalid-void-type': 'off'
    }
  },
  {
    files: ['backend/**/*.ts'],
    rules: {
      eqeqeq: 'error'
    }
  },
  {
    files: ['**/*.json'],
    ...json.configs['recommended']
  }
]
