import { describe, it, expect } from 'vitest';
import { parseNumeroCorrelativo, siguienteCorrelativo } from '../../services/idSequence.js';

describe('parseNumeroCorrelativo', () => {
  it('extrae el número de un correlativo bien formado', () => {
    expect(parseNumeroCorrelativo('FACT', 'FACT-0007')).toBe(7);
  });
  it('devuelve null para formatos que no coinciden', () => {
    expect(parseNumeroCorrelativo('FACT', 'PROD-0001')).toBe(null);
    expect(parseNumeroCorrelativo('FACT', 'FACT-00A1')).toBe(null);
    expect(parseNumeroCorrelativo('FACT', 'FACT-')).toBe(null);
    expect(parseNumeroCorrelativo('FACT', null)).toBe(null);
  });
});

describe('siguienteCorrelativo', () => {
  it('devuelve -0001 cuando no hay ids previos', () => {
    expect(siguienteCorrelativo('FACT', [])).toBe('FACT-0001');
  });

  it('incrementa el máximo existente', () => {
    expect(siguienteCorrelativo('FACT', ['FACT-0007'])).toBe('FACT-0008');
  });

  it('toma el mayor número aunque la lista esté desordenada', () => {
    expect(siguienteCorrelativo('FACT', ['FACT-0003', 'FACT-0010', 'FACT-0007'])).toBe('FACT-0011');
  });

  it('ignora ids corruptos o de otro prefijo', () => {
    expect(siguienteCorrelativo('FACT', ['PROD-0099', 'FACT-0002', 'basura'])).toBe('FACT-0003');
  });

  it('respeta el padding solicitado', () => {
    expect(siguienteCorrelativo('CAJA', ['CAJA-000123'], 6)).toBe('CAJA-000124');
  });

  it('crece el padding cuando el número lo excede', () => {
    expect(siguienteCorrelativo('FACT', ['FACT-9999'])).toBe('FACT-10000');
  });
});
