'use strict';

// Asignación FEFO (First-Expired, First-Out) de lotes para deducir stock.
// Extraído de routes/salesRoutes.js (POST/PUT /ventas) donde estaba duplicado.
//
// Función pura: recibe los lotes YA ordenados por fecha de vencimiento (el orden
// lo garantiza el `ORDER BY fecha_vencimiento ASC` de la query) y devuelve el plan
// de descuento. El caller ejecuta los UPDATE. Así la decisión de "de qué lote
// descontar" — la parte con riesgo de error — queda testeable sin BD.

/**
 * Construye un error con statusCode/code para que el handler lo mapee a HTTP.
 */
function _insufficientStockError(descripcion) {
    const err = new Error(`Stock insuficiente para ${descripcion || 'el producto'}`);
    err.statusCode = 400;
    err.code = 'INSUFFICIENT_STOCK';
    return err;
}

/**
 * Reparte `cantidadBase` entre los lotes en orden FEFO.
 *
 * @param {Array<{id_lote: any, cantidad_actual: number|string}>} lotes
 *        Lotes candidatos, ordenados del que vence primero al que vence después.
 * @param {number} cantidadBase - Cantidad en unidad base a descontar.
 * @param {object} [opts]
 * @param {string} [opts.descripcion] - Nombre del producto para el mensaje de error.
 * @param {number} [opts.tolerancia=0.001] - Margen para cantidades fraccionarias.
 * @returns {{ plan: Array<{id_lote: any, deduct: number}>, primaryLoteId: any }}
 * @throws Error con code 'INSUFFICIENT_STOCK' si los lotes no cubren la cantidad.
 */
function asignarLotesFefo(lotes, cantidadBase, opts = {}) {
    const tolerancia = opts.tolerancia == null ? 0.001 : opts.tolerancia;
    let remaining = Number(cantidadBase);
    const plan = [];
    let primaryLoteId = null;

    for (const lote of (lotes || [])) {
        if (remaining <= 0) break;
        const disponible = Number(lote.cantidad_actual);
        if (!(disponible > 0)) continue;
        const deduct = Math.min(remaining, disponible);
        plan.push({ id_lote: lote.id_lote, deduct });
        if (primaryLoteId === null) primaryLoteId = lote.id_lote;
        remaining -= deduct;
    }

    if (remaining > tolerancia) {
        throw _insufficientStockError(opts.descripcion);
    }

    return { plan, primaryLoteId };
}

module.exports = { asignarLotesFefo };
