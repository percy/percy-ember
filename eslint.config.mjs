import babelEslintParser from '@babel/eslint-parser';
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginEmberTemplateLint from 'eslint-plugin-ember/configs/template-lint-migration';
import eslintPluginEmber from 'eslint-plugin-ember/recommended';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginQunit from 'eslint-plugin-qunit';
import globals from 'globals';

const parserOptionsJs = {
  ecmaFeatures: {
    modules: true,
  },
  ecmaVersion: 'latest',
};

export default defineConfig([
  globalIgnores([
    'declarations/',
    'dist/',
    'dist-for-testing/',
    'node_modules/',
    'types/',
    '.*/',
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  eslint.configs.recommended,
  eslintPluginEmber.configs.base,
  eslintPluginEmber.configs.gjs,
  eslintPluginEmberTemplateLint,
  eslintConfigPrettier,

  // Ember files
  {
    files: ['**/*.js'],
    languageOptions: {
      parser: babelEslintParser,
    },
  },
  {
    files: ['**/*.{gjs,js,mjs}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: parserOptionsJs,
    },
  },

  // Test files
  {
    ...eslintPluginQunit.configs.recommended,
    files: ['tests/**/*-test.{gjs,gts,js,ts}'],
    plugins: {
      qunit: eslintPluginQunit,
    },
  },

  // Configuration files
  {
    ...eslintPluginN.configs['flat/recommended-script'],
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'script',
    },
    plugins: {
      n: eslintPluginN,
    },
  },
  {
    ...eslintPluginN.configs['flat/recommended-module'],
    files: ['*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    plugins: {
      n: eslintPluginN,
    },
  },
]);
