import { describe, it, expect } from 'vitest';
import { calcularIsvLinea, esTipoIsvValido, TIPOS_ISV_VALIDOS } from '../../services/sales/tax.js';

describe('calcularIsvLinea', () => {
  it('trata todo como exento cuando tipoIsv es "exento"', () => {
    const r = calcularIsvLinea(100, 2, 'exento');
    expect(r).toEqual({ subExento: 200, subGravado: 0, isvLinea: 0 });
  });

  it('usa exento por defecto cuando no se pasa tipoIsv', () => {
    const r = calcularIsvLinea(50, 1);
    expect(r.subExento).toBe(50);
    expect(r.isvLinea).toBe(0);
  });

  it('desglosa 15% con impuesto incluido en el precio', () => {
    const r = calcularIsvLinea(115, 1, '15');
    expect(r.subGravado).toBeCloseTo(100, 6);
    expect(r.isvLinea).toBeCloseTo(15, 6);
    expect(r.subExento).toBe(0);
  });

  it('desglosa 18% con impuesto incluido en el precio', () => {
    const r = calcularIsvLinea(118, 1, '18');
    expect(r.subGravado).toBeCloseTo(100, 6);
    expect(r.isvLinea).toBeCloseTo(18, 6);
  });

  it('conserva el total: subExento + subGravado + isvLinea === precio*cantidad', () => {
    for (const tipo of ['exento', '15', '18']) {
      const precio = 99.99, cantidad = 3;
      const r = calcularIsvLinea(precio, cantidad, tipo);
      expect(r.subExento + r.subGravado + r.isvLinea).toBeCloseTo(precio * cantidad, 6);
    }
  });

  it('multiplica por la cantidad antes de desglosar', () => {
    const r = calcularIsvLinea(115, 4, '15');
    expect(r.subGravado + r.isvLinea).toBeCloseTo(460, 6);
    expect(r.isvLinea).toBeCloseTo(60, 6);
  });

  it('acepta strings numéricos (como llegan del body JSON)', () => {
    const r = calcularIsvLinea('115', '1', '15');
    expect(r.isvLinea).toBeCloseTo(15, 6);
  });
});

describe('esTipoIsvValido / TIPOS_ISV_VALIDOS', () => {
  it('acepta exento, 15 y 18', () => {
    expect(esTipoIsvValido('exento')).toBe(true);
    expect(esTipoIsvValido('15')).toBe(true);
    expect(esTipoIsvValido('18')).toBe(true);
  });
  it('rechaza cualquier otro valor', () => {
    expect(esTipoIsvValido('12')).toBe(false);
    expect(esTipoIsvValido('')).toBe(false);
    expect(esTipoIsvValido(undefined)).toBe(false);
  });
  it('expone el set de tipos válidos', () => {
    expect(TIPOS_ISV_VALIDOS.size).toBe(3);
  });
});
