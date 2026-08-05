// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ['**/dist/**', '**/coverage/**', 'legacy/**', 'reference/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Tests assert on fixtures they just constructed themselves — a `!` there is
    // about readable assertions, not smuggling past a real runtime-safety gap the
    // way it would in src/. Source code should prefer an explicit check + throw.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
