import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makePool, ensureMigrated } from './setup.js';
import { asignarLotesFefo } from '../../services/sales/fefo.js';

// Integración real del camino de inventario de una venta: la query FEFO + el
// módulo de asignación + los UPDATE de descuento, contra un Postgres real.

const TENANT = '11111111-1111-1111-1111-111111111111';
const MED = 'TESTMED-FEFO';

let pool;
let idSucursal;

const FEFO_SQL = `
  SELECT id_lote, numero_lote, cantidad_actual
  FROM lotes_medicamento
  WHERE id_medicamento = $1 AND estado = 'Activo' AND cantidad_actual > 0
    AND id_sucursal = $2 AND tenant_id = $3
  ORDER BY fecha_vencimiento ASC`;

beforeAll(async () => {
  await ensureMigrated();
  pool = makePool();

  // Limpieza de corridas previas (lotes antes que medicamento por la FK).
  await pool.query('DELETE FROM lotes_medicamento WHERE tenant_id = $1', [TENANT]);
  await pool.query('DELETE FROM medicamentos WHERE tenant_id = $1', [TENANT]);
  await pool.query('DELETE FROM sucursales WHERE tenant_id = $1', [TENANT]);

  await pool.query(
    `INSERT INTO medicamentos (codigo, nombre_generico, tenant_id) VALUES ($1,$2,$3)
     ON CONFLICT (codigo) DO NOTHING`,
    [MED, 'Amoxicilina 500mg (test)', TENANT]
  );

  const suc = await pool.query(
    `INSERT INTO sucursales (nombre, tenant_id) VALUES ($1,$2) RETURNING id_sucursal`,
    ['Sucursal Test FEFO', TENANT]
  );
  idSucursal = suc.rows[0].id_sucursal;

  // Lote que vence ANTES con 3 uds; lote que vence DESPUÉS con 10 uds.
  await pool.query(
    `INSERT INTO lotes_medicamento
       (id_medicamento, numero_lote, fecha_vencimiento_display, fecha_vencimiento,
        cantidad_inicial, cantidad_actual, id_sucursal, estado, tenant_id)
     VALUES
       ($1,'L-ANTES','01/2026','2026-01-01',3,3,$2,'Activo',$3),
       ($1,'L-DESPUES','01/2027','2027-01-01',10,10,$2,'Activo',$3)`,
    [MED, idSucursal, TENANT]
  );
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

describe('inventario FEFO (integración con Postgres)', () => {
  it('la query devuelve los lotes ordenados por vencimiento ascendente', async () => {
    const { rows } = await pool.query(FEFO_SQL, [MED, idSucursal, TENANT]);
    expect(rows.map(r => r.numero_lote)).toEqual(['L-ANTES', 'L-DESPUES']);
  });

  it('descuenta 5 uds agotando el lote que vence primero y tomando el resto del siguiente', async () => {
    const { rows } = await pool.query(FEFO_SQL, [MED, idSucursal, TENANT]);
    const { plan, primaryLoteId } = asignarLotesFefo(rows, 5, { descripcion: MED });

    // El lote primario debe ser el que vence antes.
    const anteId = rows.find(r => r.numero_lote === 'L-ANTES').id_lote;
    expect(primaryLoteId).toBe(anteId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of plan) {
        await client.query(
          'UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual - $1 WHERE id_lote = $2',
          [p.deduct, p.id_lote]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const after = await pool.query(
      `SELECT numero_lote, cantidad_actual FROM lotes_medicamento
       WHERE id_medicamento=$1 AND tenant_id=$2 ORDER BY fecha_vencimiento ASC`,
      [MED, TENANT]
    );
    const byLote = Object.fromEntries(after.rows.map(r => [r.numero_lote, Number(r.cantidad_actual)]));
    expect(byLote['L-ANTES']).toBe(0);   // 3 - 3
    expect(byLote['L-DESPUES']).toBe(8); // 10 - 2
  });

  it('lanza INSUFFICIENT_STOCK cuando el stock disponible no alcanza', async () => {
    const { rows } = await pool.query(FEFO_SQL, [MED, idSucursal, TENANT]);
    // Tras el test anterior quedan 8 uds; pedir 1000 debe fallar.
    expect(() => asignarLotesFefo(rows, 1000, { descripcion: MED })).toThrowError(/Stock insuficiente/);
  });
});
