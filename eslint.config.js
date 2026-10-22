import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['node_modules', 'coverage']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'warn',
      // ignoreRestSiblings: `const { parent, ...fields } = loc` deliberately drops `parent`
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^(req|res|next|val|_)', ignoreRestSiblings: true },
      ],
      'no-await-in-loop': 'warn',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // the boot script prints env problems before the logger exists
    files: ['server.js'],
    rules: { 'no-console': 'off' },
  },
]);
