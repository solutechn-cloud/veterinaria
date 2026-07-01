import { Pool } from 'pg';
import { runMigrations } from '../../config/migrations.js';

// Postgres de prueba. Levantar con: npm run test:db:up
// Sobreescribir con TEST_DATABASE_URL si usas otro host/puerto.
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:test@localhost:55432/erp_test';

export function makePool() {
  return new Pool({ connectionString: TEST_DB_URL, max: 4 });
}

// Corre las migraciones reales una sola vez por proceso de test.
// runMigrations es idempotente (usa schema_migrations), así que repetirlo es barato.
let migratedPromise = null;
export function ensureMigrated() {
  if (!migratedPromise) {
    migratedPromise = (async () => {
      const pool = makePool();
      try {
        await runMigrations(pool);
      } finally {
        await pool.end();
      }
    })();
  }
  return migratedPromise;
}
