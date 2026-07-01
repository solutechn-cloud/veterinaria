import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { makePool, ensureMigrated, TEST_DB_URL } from './setup.js';

// Verifica el aislamiento multi-tenant por RLS (migración 023) contra un rol
// NO superuser — porque los superusers bypassean RLS y darían falsos verdes.
// Un rol normal es lo más cercano al rol de la app en producción.

const A = '11111111-1111-1111-1111-11111111aaaa';
const B = '22222222-2222-2222-2222-22222222bbbb';
const APP_URL = TEST_DB_URL.replace('postgres://postgres:test@', 'postgres://erp_test_app:apppw@');

let admin;   // superuser: migra y siembra
let appPool; // rol normal: sujeto a RLS
let app;     // client persistente del rol normal (mantiene el SET de contexto)

beforeAll(async () => {
  await ensureMigrated();
  admin = makePool();

  // Rol de aplicación NO superuser, sin BYPASSRLS.
  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='erp_test_app') THEN CREATE ROLE erp_test_app LOGIN PASSWORD 'apppw'; END IF; END $$;`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO erp_test_app`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_test_app`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_test_app`);

  // Siembra como superuser (bypassea RLS para poder crear ambos tenants).
  await admin.query('DELETE FROM clientes WHERE tenant_id IN ($1,$2)', [A, B]);
  await admin.query('DELETE FROM tenants WHERE id IN ($1,$2)', [A, B]);
  await admin.query(`INSERT INTO tenants (id,slug,nombre_empresa) VALUES ($1,'clinica-a-rls','Clinica A'),($2,'clinica-b-rls','Clinica B')`, [A, B]);
  await admin.query(`INSERT INTO clientes (identidad,nombre,tenant_id) VALUES ('RLS-A','Ana',$1),('RLS-B','Beto',$2)`, [A, B]);

  appPool = new Pool({ connectionString: APP_URL, max: 2 });
  app = await appPool.connect();
}, 60000);

afterAll(async () => {
  if (app) app.release();
  if (appPool) await appPool.end();
  if (admin) {
    await admin.query('DELETE FROM clientes WHERE tenant_id IN ($1,$2)', [A, B]).catch(() => {});
    await admin.query('DELETE FROM tenants WHERE id IN ($1,$2)', [A, B]).catch(() => {});
    await admin.end();
  }
});

describe('aislamiento multi-tenant por RLS', () => {
  it('RLS está habilitado y forzado en las tablas de negocio', async () => {
    const { rows } = await admin.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname = ANY($1)`,
      [['ventas', 'clientes', 'medicamentos', 'lotes_medicamento', 'detalleventa', 'arqueo', 'tenants']]
    );
    for (const row of rows) {
      expect(row.relrowsecurity, `RLS en ${row.relname}`).toBe(true);
      expect(row.relforcerowsecurity, `FORCE RLS en ${row.relname}`).toBe(true);
    }
  });

  it('la función current_tenant_id() existe', async () => {
    const { rows } = await admin.query(`SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_id'`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('sin contexto de tenant, un rol normal no ve ninguna fila (fail-closed)', async () => {
    await app.query(`SELECT set_config('app.current_tenant_id','',false), set_config('app.bypass_rls','',false)`);
    const { rows } = await app.query('SELECT count(*)::int AS n FROM clientes');
    expect(rows[0].n).toBe(0);
  });

  it('con contexto del tenant A, solo ve los datos del tenant A', async () => {
    await app.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [A]);
    const { rows } = await app.query('SELECT identidad FROM clientes ORDER BY identidad');
    expect(rows.map(r => r.identidad)).toEqual(['RLS-A']);
  });

  it('rechaza insertar una fila de otro tenant (WITH CHECK)', async () => {
    await app.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [A]);
    let code = null;
    try {
      await app.query(`INSERT INTO clientes (identidad,nombre,tenant_id) VALUES ('RLS-X','x',$1)`, [B]);
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe('42501'); // insufficient_privilege / RLS check violation
  });

  it('con bypass activo, el super-admin ve todos los tenants', async () => {
    await app.query(`SELECT set_config('app.current_tenant_id','',false), set_config('app.bypass_rls','true',false)`);
    const t = await app.query('SELECT count(*)::int AS n FROM tenants WHERE id IN ($1,$2)', [A, B]);
    expect(t.rows[0].n).toBe(2);
    const c = await app.query('SELECT count(*)::int AS n FROM clientes WHERE tenant_id IN ($1,$2)', [A, B]);
    expect(c.rows[0].n).toBe(2);
  });
});
