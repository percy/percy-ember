module.exports = {
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module'
  },
  extends: [
    'eslint:recommended'
  ],
  env: {
    browser: true
  },
  globals: {},
  rules: {
    'no-cond-assign': [
      'error',
      'except-parens'
    ],
    'curly': 'error',
    'no-debugger': 'off',
    'eqeqeq': 'error',
    'no-eval': 'error',
    'guard-for-in': 'off',
    'wrap-iife': 'off',
    'linebreak-style': 'off',
    'new-cap': 'error',
    'no-caller': 'error',
    'no-empty': 'off',
    'no-new': 'off',
    'no-plusplus': 'off',
    'no-undef': 'error',
    'dot-notation': 'off',
    'strict': 'off',
    'no-eq-null': 'error',
    'no-unused-vars': 'error',

  }
}
