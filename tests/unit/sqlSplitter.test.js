import { describe, it, expect } from 'vitest';
import { splitSqlStatements } from '../../config/migrations.js';

describe('splitSqlStatements', () => {
  it('separa sentencias simples por punto y coma', () => {
    const out = splitSqlStatements('SELECT 1; SELECT 2;');
    expect(out).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('no parte dentro de un bloque dollar-quoted ($$...$$)', () => {
    const sql = `CREATE FUNCTION f() RETURNS void AS $$
      BEGIN
        PERFORM 1; PERFORM 2;
      END;
    $$ LANGUAGE plpgsql;
    SELECT f();`;
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('PERFORM 1; PERFORM 2;');
    expect(out[1]).toBe('SELECT f()');
  });

  it('respeta dollar-quoting con etiqueta ($tag$...$tag$)', () => {
    const sql = `DO $body$ BEGIN RAISE NOTICE 'a;b'; END $body$;`;
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(1);
  });

  it('ignora el punto y coma dentro de strings de comillas simples', () => {
    const out = splitSqlStatements(`INSERT INTO t(x) VALUES ('a;b'); SELECT 1;`);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("'a;b'");
  });

  it('ignora comentarios de línea (--) y de bloque (/* */)', () => {
    const sql = `SELECT 1; -- comentario; con punto y coma
    /* bloque; con ; */ SELECT 2;`;
    const out = splitSqlStatements(sql);
    expect(out).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('maneja comillas simples escapadas por duplicación', () => {
    const out = splitSqlStatements(`SELECT 'it''s ok; really'; SELECT 2;`);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("it''s ok; really");
  });

  it('conserva la última sentencia sin punto y coma final', () => {
    const out = splitSqlStatements('SELECT 1');
    expect(out).toEqual(['SELECT 1']);
  });
});
