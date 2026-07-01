import { describe, it, expect } from 'vitest';
import { asignarLotesFefo } from '../../services/sales/fefo.js';

describe('asignarLotesFefo', () => {
  it('descuenta de un solo lote cuando alcanza', () => {
    const lotes = [{ id_lote: 'L1', cantidad_actual: 10 }];
    const { plan, primaryLoteId } = asignarLotesFefo(lotes, 4);
    expect(plan).toEqual([{ id_lote: 'L1', deduct: 4 }]);
    expect(primaryLoteId).toBe('L1');
  });

  it('reparte entre lotes respetando el orden FEFO (primero el que vence antes)', () => {
    // El caller entrega los lotes ya ordenados por fecha_vencimiento ASC.
    const lotes = [
      { id_lote: 'VENCE_ANTES', cantidad_actual: 3 },
      { id_lote: 'VENCE_DESPUES', cantidad_actual: 10 },
    ];
    const { plan, primaryLoteId } = asignarLotesFefo(lotes, 5);
    expect(plan).toEqual([
      { id_lote: 'VENCE_ANTES', deduct: 3 },
      { id_lote: 'VENCE_DESPUES', deduct: 2 },
    ]);
    expect(primaryLoteId).toBe('VENCE_ANTES');
  });

  it('no toca lotes de más una vez cubierta la cantidad', () => {
    const lotes = [
      { id_lote: 'L1', cantidad_actual: 5 },
      { id_lote: 'L2', cantidad_actual: 5 },
    ];
    const { plan } = asignarLotesFefo(lotes, 5);
    expect(plan).toEqual([{ id_lote: 'L1', deduct: 5 }]);
  });

  it('lanza INSUFFICIENT_STOCK cuando los lotes no cubren la cantidad', () => {
    const lotes = [{ id_lote: 'L1', cantidad_actual: 2 }];
    try {
      asignarLotesFefo(lotes, 5, { descripcion: 'Amoxicilina 500mg' });
      throw new Error('debió lanzar');
    } catch (err) {
      expect(err.code).toBe('INSUFFICIENT_STOCK');
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Amoxicilina 500mg');
    }
  });

  it('lanza cuando no hay lotes', () => {
    expect(() => asignarLotesFefo([], 1)).toThrowError(/Stock insuficiente/);
  });

  it('tolera cantidades fraccionarias dentro del margen (0.001)', () => {
    const lotes = [{ id_lote: 'L1', cantidad_actual: 1 }];
    // 1.0005 - 1 = 0.0005 < 0.001 => no debe lanzar
    const { plan } = asignarLotesFefo(lotes, 1.0005);
    expect(plan[0].id_lote).toBe('L1');
  });

  it('ignora lotes con cantidad_actual <= 0', () => {
    const lotes = [
      { id_lote: 'VACIO', cantidad_actual: 0 },
      { id_lote: 'L2', cantidad_actual: 4 },
    ];
    const { plan, primaryLoteId } = asignarLotesFefo(lotes, 3);
    expect(primaryLoteId).toBe('L2');
    expect(plan).toEqual([{ id_lote: 'L2', deduct: 3 }]);
  });

  it('acepta cantidad_actual como string (como llega de pg)', () => {
    const lotes = [{ id_lote: 'L1', cantidad_actual: '8' }];
    const { plan } = asignarLotesFefo(lotes, 3);
    expect(plan).toEqual([{ id_lote: 'L1', deduct: 3 }]);
  });
});
