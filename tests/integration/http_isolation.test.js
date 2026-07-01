import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { makePool, ensureMigrated, TEST_DB_URL } from './setup.js';

// Regresión end-to-end del aislamiento multi-tenant A TRAVÉS DEL STACK HTTP REAL:
// arranca el servidor, hace login como usuarios de dos clínicas distintas y
// verifica que cada token solo ve los datos de su propia clínica. Blinda el
// wiring (login bajo bypass + withTenant + reorden de middleware) contra
// regresiones. El enforcement puro de RLS se prueba aparte en rls_isolation.test.js.

const PORT = 3998;
const BASE = { host: '127.0.0.1', port: PORT };
const A = 'aaaaaaaa-0000-0000-0000-00000000aaaa';
const B = 'bbbbbbbb-0000-0000-0000-00000000bbbb';

let pool;
let server;
const serverLog = [];

function apiRequest(pathname, { method = 'GET', token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ ...BASE, path: pathname, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch { /* leave null */ }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedClinica(id, slug, cliIdentidad, usuario) {
  await pool.query('DELETE FROM clientes WHERE tenant_id = $1', [id]);
  await pool.query('DELETE FROM usuarios WHERE tenant_id = $1', [id]);
  await pool.query('DELETE FROM roles WHERE tenant_id = $1', [id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await pool.query(
    `INSERT INTO tenants (id, slug, nombre_empresa, estado, plan) VALUES ($1,$2,$3,'activo','basico')`,
    [id, slug, `Clinica ${slug}`]
  );
  const rol = await pool.query(`INSERT INTO roles (nombre, tenant_id) VALUES ('Administrador',$1) RETURNING idrol`, [id]);
  const hash = await bcrypt.hash('Test1234', 10);
  await pool.query(
    `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id) VALUES ($1,$2,$3,'Activo',$4)`,
    [usuario, hash, rol.rows[0].idrol, id]
  );
  await pool.query(`INSERT INTO clientes (identidad, nombre, tenant_id) VALUES ($1,$2,$3)`, [cliIdentidad, `Cliente ${slug}`, id]);
}

async function login(slug, usuario) {
  const r = await apiRequest('/api/auth/login', { method: 'POST', body: { tenantSlug: slug, usuario, password: 'Test1234' } });
  return r.json?.token || null;
}

beforeAll(async () => {
  await ensureMigrated();
  pool = makePool();
  await seedClinica(A, 'htest-a', 'CLI-HA', 'admin-a');
  await seedClinica(B, 'htest-b', 'CLI-HB', 'admin-b');

  server = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DB_INTERNAL_URL: TEST_DB_URL,
      JWT_SECRET: 'x'.repeat(48),
      REFRESH_SECRET: 'y'.repeat(48),
      SAAS_SUPER_SECRET: 'z'.repeat(48),
      PORT: String(PORT),
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
    },
  });
  server.stdout.on('data', (d) => serverLog.push(d.toString()));
  server.stderr.on('data', (d) => serverLog.push(d.toString()));

  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const h = await apiRequest('/healthz');
      if (h.status === 200) { up = true; break; }
    } catch { /* not ready yet */ }
    await sleep(500);
  }
  if (!up) throw new Error('El servidor no respondió a /healthz.\n' + serverLog.join(''));
}, 60000);

afterAll(async () => {
  if (server) server.kill('SIGKILL');
  if (pool) {
    for (const id of [A, B]) {
      await pool.query('DELETE FROM clientes WHERE tenant_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM usuarios WHERE tenant_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM roles WHERE tenant_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM tenants WHERE id = $1', [id]).catch(() => {});
    }
    await pool.end();
  }
});

describe('aislamiento multi-tenant vía HTTP (regresión end-to-end)', () => {
  it('cada clínica puede iniciar sesión (login bajo bypass de RLS)', async () => {
    expect(await login('htest-a', 'admin-a')).toBeTruthy();
    expect(await login('htest-b', 'admin-b')).toBeTruthy();
  });

  it('el token de la clínica A solo ve los clientes de A', async () => {
    const token = await login('htest-a', 'admin-a');
    const r = await apiRequest('/api/clientes', { token });
    expect(r.status).toBe(200);
    const ids = (r.json || []).map((c) => c.identidad);
    expect(ids).toContain('CLI-HA');
    expect(ids).not.toContain('CLI-HB');
  });

  it('el token de la clínica B solo ve los clientes de B', async () => {
    const token = await login('htest-b', 'admin-b');
    const r = await apiRequest('/api/clientes', { token });
    expect(r.status).toBe(200);
    const ids = (r.json || []).map((c) => c.identidad);
    expect(ids).toContain('CLI-HB');
    expect(ids).not.toContain('CLI-HA');
  });

  it('rechaza peticiones sin token (401)', async () => {
    const r = await apiRequest('/api/clientes');
    expect(r.status).toBe(401);
  });
});
