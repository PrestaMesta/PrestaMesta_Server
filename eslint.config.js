const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    }
  },
  {
    ignores: ['node_modules/', 'coverage/', '*.docx']
  }
];
