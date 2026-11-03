import tsParser from '@typescript-eslint/parser';

// A small, enforceable baseline. Typechecking remains a separate CI gate;
// stricter style and type-aware rules can be added incrementally.
export default [
  { ignores: ['node_modules/**', 'web/node_modules/**', 'web/.next/**', 'dist/**', 'artifacts/**'] },
  {
    files: ['src/**/*.{js,ts,tsx}', 'web/app/**/*.{js,ts,tsx}', 'web/components/**/*.{js,ts,tsx}', 'web/lib/**/*.{js,ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    rules: {
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unsafe-finally': 'error',
    },
  },
];
