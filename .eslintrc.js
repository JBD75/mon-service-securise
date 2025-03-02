module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    jquery: true,
    mocha: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    axios: 'readonly',
    html2canvas: 'readonly',
    jspdf: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'ignore',
    }],
    'no-param-reassign': ['error', { props: false }],
    'no-return-assign': ['error', 'except-parens'],
    'object-curly-newline': ['error', {
      ObjectExpression: { consistent: true },
      ObjectPattern: { consistent: true },
      ImportDeclaration: { consistent: true },
      ExportDeclaration: { consistent: true },
    }],
  },
  overrides: [{
    files: ['public/**/*.js'],
    rules: { 'import/extensions': ['error', 'always'] },
  }, {
    files: ['test/*/*.js'],
    rules: { 'no-new': ['off'] },
  }, {
    files: ['src/erreurs.js'],
    rules: { 'max-classes-per-file': ['off'] },
  }],
};
