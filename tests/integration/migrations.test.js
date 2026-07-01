import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makePool, ensureMigrated } from './setup.js';

// Valida que TODAS las migraciones de scripts/migrations/ apliquen limpio sobre
// una BD vacía. Es una de las pruebas de mayor valor: atrapa una migración rota
// ANTES de desplegarla a producción.

let pool;
beforeAll(async () => { await ensureMigrated(); pool = makePool(); }, 60000);
afterAll(async () => { if (pool) await pool.end(); });

describe('migraciones', () => {
  it('aplica las 25 migraciones registradas en schema_migrations', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    expect(rows[0].n).toBeGreaterThanOrEqual(25);
  });

  it('crea las tablas de negocio críticas', async () => {
    const tablas = ['tenants', 'ventas', 'detalleventa', 'clientes', 'medicamentos', 'lotes_medicamento', 'arqueo', 'caja'];
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
      [tablas]
    );
    const encontradas = new Set(rows.map(r => r.table_name));
    for (const t of tablas) expect(encontradas.has(t), `falta la tabla ${t}`).toBe(true);
  });

  it('protege contra doble cobro: índice único de idempotencia en ventas', async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename='ventas' AND indexdef ILIKE '%client_mutation_id%'`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows[0].indexdef).toMatch(/tenant_id/i);
  });
});
