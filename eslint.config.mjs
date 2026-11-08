// @ts-check
// ESLint 9 flat config para las librerias (@projecthub/shared). Es codigo
// de dominio: sin componentes Angular, no se aplica el processor de
// templates. El store SESION_STORE se provee como const exportada.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['projects/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'projects/**/dist/**'],
  },
);
