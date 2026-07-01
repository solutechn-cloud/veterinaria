import { defineConfig } from 'vitest/config';

// Unit tests corren sin BD (tests/unit). Integración (tests/integration) requiere
// un Postgres de prueba — se selecciona pasando el directorio al CLI:
//   npm test                 -> tests/unit
//   npm run test:integration -> tests/integration
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['services/sales/**', 'services/idSequence.js', 'config/migrations.js'],
    },
  },
});
