import prettier from 'eslint-config-prettier'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import jsonPlugin from 'eslint-plugin-json'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
// import importTypescript from 'eslint-import-resolver-typescript'

export default [
  {
    ignores: [
      '**/__tests__/**/*',
      '**/node_modules/**',
      '**/package.json',
      '**/package-lock.json'
    ],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        $: 'readonly',
        jQuery: 'readonly',
        html2canvas: 'readonly',
        ClipboardItem: 'readonly',
        grecaptcha: 'readonly'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    plugins: {
      json: jsonPlugin,
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      prettier: prettierPlugin
    },
    rules: {
      'json/*': ['error'],
      indent: ['off'],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-var': 'error',
      'no-duplicate-imports': ['error'],
      'import/no-unresolved': [
        'error',
        {
          ignore: ['^./constants/firebase-config$']
        }
      ],
      'import/no-duplicates': 'off',
      'no-mixed-operators': [
        'error',
        {
          groups: [['+', '??']]
        }
      ],
      ...prettier.rules
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
      ...tsPlugin.configs['eslint-recommended'].rules,
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs.strict.rules,
      '@typescript-eslint/explicit-function-return-type': ['error'],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^(_|e|event)', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-var-requires': 'error',
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
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-invalid-void-type': 'off',
      ...prettier.rules
    }
  },
  {
    files: ['backend/**/*.ts'],
    rules: {
      eqeqeq: 'error'
    }
  }
]
