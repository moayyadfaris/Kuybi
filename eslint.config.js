const path = require('path')
const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
})

module.exports = [
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  ...compat.config({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: path.join(__dirname, 'tsconfig.eslint.json'),
      sourceType: 'module',
    },
    plugins: ['@typescript-eslint', 'prettier'],
    extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
    env: {
      node: true,
      jest: true,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': 'error',
    },
  }),
]
