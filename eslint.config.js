import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

// Layer boundaries are documented in CLAUDE.md §3 and in each layer's README.
// They are enforced below rather than left to convention.
const GAME_CORE_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
  'setTimeout',
  'setInterval',
  'alert',
  'confirm',
].map((name) => ({
  name,
  message: `game-core must stay pure — no browser APIs (CLAUDE.md §3). Pass "${name}" data in as a parameter instead.`,
}));

const REACT_IMPORT_GROUP = ['react', 'react-dom', 'react/*', 'react-dom/*'];

// Three.js is the scene layer's business and nobody else's. The rules must stay
// renderer-free so they remain replaceable (CLAUDE.md §3).
const THREE_IMPORT_GROUP = ['three', 'three/*', '@react-three/*'];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },

  // Application source.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // CLAUDE.md §3: no `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // --- Layer boundary: game-core is pure. -----------------------------------
  // No DOM, no React, no renderer, no storage, no wall clock, no ambient randomness.
  // This is the boundary a Rust/WASM implementation would replace wholesale.
  {
    files: ['src/game-core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...GAME_CORE_FORBIDDEN_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'game-core must be deterministic — take time as a parameter (CLAUDE.md §3).',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'game-core must be deterministic — use the seeded RNG from step B8.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: REACT_IMPORT_GROUP,
              message: 'game-core must not import React (CLAUDE.md §3).',
            },
            {
              group: THREE_IMPORT_GROUP,
              message: 'game-core must not import a renderer (CLAUDE.md §3).',
            },
            {
              group: [
                '**/game-runtime/**',
                '**/game-bridge/**',
                '**/game-scene/**',
                '**/storage/**',
                '**/components/**',
                '**/screens/**',
                '@/game-runtime/**',
                '@/game-bridge/**',
                '@/game-scene/**',
                '@/storage/**',
                '@/components/**',
                '@/screens/**',
              ],
              message: 'game-core must not depend on outer layers (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },

  // Test files inside game-core need the jsdom-free rules but may use timers/mocks.
  {
    files: ['src/game-core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // --- Layer boundary: the runtime never imports React. ----------------------
  {
    files: ['src/game-runtime/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: REACT_IMPORT_GROUP,
              message: 'game-runtime must not import React (CLAUDE.md §3).',
            },
            {
              group: THREE_IMPORT_GROUP,
              message:
                'game-runtime drives the simulation; drawing belongs to game-scene (CLAUDE.md §3).',
            },
            {
              group: [
                '**/components/**',
                '**/screens/**',
                '**/game-scene/**',
                '@/components/**',
                '@/screens/**',
                '@/game-scene/**',
              ],
              message: 'game-runtime must not depend on the UI layer (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },

  // --- Layer boundary: game-scene draws, and only draws. --------------------
  // It reads the world through game-bridge (events + WorldSnapshot) and knows
  // nothing about how the simulation is stepped or where progress is stored.
  {
    files: ['src/game-scene/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/game-runtime/**',
                '**/screens/**',
                '**/storage/**',
                '@/game-runtime/**',
                '@/screens/**',
                '@/storage/**',
              ],
              message:
                'game-scene reads the world through game-bridge only (CLAUDE.md §3). No runtime internals, no screens, no storage.',
            },
          ],
        },
      ],
    },
  },

  // --- Layer boundary: React reaches the runtime only through the bridge. ----
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/screens/**/*.{ts,tsx}', 'src/App.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/game-runtime/**', '@/game-runtime/**'],
              message: 'UI must go through game-bridge, not game-runtime internals (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },

  // --- Layer boundary: content is data only. --------------------------------
  {
    files: ['src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...REACT_IMPORT_GROUP,
                ...THREE_IMPORT_GROUP,
                '**/game-runtime/**',
                '**/game-scene/**',
                '**/components/**',
                '**/screens/**',
              ],
              message: 'content is data only — no logic or UI imports (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },

  // Node-side config files.
  {
    files: ['**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
