import { describe, it, expect } from 'vitest';
import { buildTutorIdentity, normalizePhone } from '../../services/sales/tutorIdentity.js';

describe('normalizePhone', () => {
  it('elimina todo lo que no sea dígito', () => {
    expect(normalizePhone('+504 9999-8888')).toBe('50499998888');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('buildTutorIdentity', () => {
  it('usa el documento de identidad cuando está presente', () => {
    const id = buildTutorIdentity({ identidad: '0801199912345', tipo_identificacion: 'identidad' });
    expect(id).toBe('0801199912345');
  });

  it('deriva del teléfono cuando el tipo es "telefono", ignorando el documento', () => {
    const id = buildTutorIdentity({
      identidad: 'no-usar', tipo_identificacion: 'telefono',
      telefono: '9999-8888', tenantId: 'abcdef12-3456',
    });
    expect(id).toBe('TEL_abcd_99998888');
  });

  it('deriva del teléfono cuando no hay documento aunque el tipo no sea "telefono"', () => {
    const id = buildTutorIdentity({ telefono: '99998888', tenantId: 'clinicaX' });
    expect(id.startsWith('TEL_clin_')).toBe(true);
  });

  it('lanza CLIENT_ID_REQUIRED sin documento ni teléfono', () => {
    try {
      buildTutorIdentity({ tipo_identificacion: 'telefono' });
      throw new Error('debió lanzar');
    } catch (err) {
      expect(err.code).toBe('CLIENT_ID_REQUIRED');
      expect(err.statusCode).toBe(400);
    }
  });

  it('trunca el resultado a 20 caracteres (límite de columna)', () => {
    const id = buildTutorIdentity({ telefono: '1234567890123456789', tenantId: 'wxyz' });
    expect(id.length).toBeLessThanOrEqual(20);
  });

  it('usa prefijo 0000 cuando el tenantId no tiene caracteres alfanuméricos', () => {
    const id = buildTutorIdentity({ telefono: '99998888', tenantId: '----' });
    expect(id).toBe('TEL_0000_99998888');
  });
});
