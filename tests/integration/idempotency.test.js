import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makePool, ensureMigrated } from './setup.js';

// Verifica a nivel de BD la garantía anti-doble-cobro: dos ventas del mismo
// tenant con el mismo client_mutation_id violan el índice único. Es la red que
// respalda la lógica de idempotencia de POST /ventas ante reintentos offline.

const TENANT = '22222222-2222-2222-2222-222222222222';
const MUT = 'test-mutation-idempotencia';

let pool;
beforeAll(async () => {
  await ensureMigrated();
  pool = makePool();
  await pool.query('DELETE FROM ventas WHERE tenant_id = $1', [TENANT]);
}, 60000);
afterAll(async () => { if (pool) await pool.end(); });

describe('idempotencia de ventas (integración con Postgres)', () => {
  it('la primera venta con client_mutation_id se inserta', async () => {
    await pool.query(
      `INSERT INTO ventas (codVenta, fecha, total, tenant_id, client_mutation_id)
       VALUES ('FACT-IDEMP-1', NOW(), 100, $1, $2)`,
      [TENANT, MUT]
    );
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM ventas WHERE tenant_id=$1 AND client_mutation_id=$2',
      [TENANT, MUT]
    );
    expect(rows[0].n).toBe(1);
  });

  it('un segundo insert con el mismo client_mutation_id es rechazado (23505)', async () => {
    let code = null;
    try {
      await pool.query(
        `INSERT INTO ventas (codVenta, fecha, total, tenant_id, client_mutation_id)
         VALUES ('FACT-IDEMP-2', NOW(), 200, $1, $2)`,
        [TENANT, MUT]
      );
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe('23505'); // unique_violation
  });

  it('permite el mismo client_mutation_id en un tenant distinto', async () => {
    const OTRO = '33333333-3333-3333-3333-333333333333';
    await pool.query('DELETE FROM ventas WHERE tenant_id = $1', [OTRO]);
    await pool.query(
      `INSERT INTO ventas (codVenta, fecha, total, tenant_id, client_mutation_id)
       VALUES ('FACT-IDEMP-3', NOW(), 300, $1, $2)`,
      [OTRO, MUT]
    );
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM ventas WHERE client_mutation_id=$1',
      [MUT]
    );
    expect(rows[0].n).toBe(2); // uno por cada tenant
    await pool.query('DELETE FROM ventas WHERE tenant_id = $1', [OTRO]);
  });
});
