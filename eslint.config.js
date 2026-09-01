import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Underscore prefix marks intentionally-unused bindings (kept for API shape).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    /* Anywhere card dates are read, `new Date(someString)` is a bug waiting to
       happen: a bare `YYYY-MM-DD` is parsed as UTC midnight per spec, so it
       reads one day early in every timezone west of UTC. That is exactly what
       used to make a card due today show as due yesterday. Parse through
       src/utils/cardDate.ts instead.

       The selector matches only the one-argument form — `new Date()` and the
       component form `new Date(y, m, d)` are unaffected — and cardDate.ts
       itself is exempt, since it is where the parsing legitimately happens. */
    files: [
      'src/features/kanban/**/*.{ts,tsx}',
      'src/features/ui/CustomDatePicker.tsx',
      'src/features/card/properties/DateProperty.tsx',
    ],
    ignores: ['src/utils/cardDate.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "NewExpression[callee.name='Date'][arguments.length=1]",
        message:
          'Use parseCardDate() from src/utils/cardDate.ts — new Date(string) parses YYYY-MM-DD as UTC midnight, which is a day early west of UTC.',
      }],
    },
  },
])
