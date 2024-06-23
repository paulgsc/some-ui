module.exports = {
  extends: ['../../.eslintrc.json'],
  overrides: [
    {
      files: ['**/*.{js,mjs,ts,tsx,mdx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module'
      },
      rules: {
        'no-debugger': 2,
        'no-console': 2,
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
