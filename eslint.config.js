<<<<<<< HEAD
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
=======
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // build/tool config runs in Node, not the browser
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
>>>>>>> 8fbb0ef48b072c7c0fda67227c0f8fd52b800389
  },
]);
