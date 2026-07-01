'use strict';

// Cálculo de ISV (impuesto sobre ventas de Honduras) por línea de venta.
// Extraído de routes/salesRoutes.js donde estaba duplicado en 4 lugares.
// Función pura: sin BD, sin req/res. Testeable de forma aislada.

// El precio de venta ingresa con el impuesto YA incluido (precio final al público).
// Por eso el gravado se obtiene dividiendo entre (1 + tasa) y el ISV es el resto.

const TIPOS_ISV_VALIDOS = new Set(['exento', '15', '18']);

function esTipoIsvValido(tipoIsv) {
    return TIPOS_ISV_VALIDOS.has(tipoIsv);
}

/**
 * Calcula el desglose de ISV de una línea de venta.
 *
 * @param {number} precioVenta - Precio unitario con impuesto incluido.
 * @param {number} cantidad    - Unidades de la línea.
 * @param {'exento'|'15'|'18'} [tipoIsv='exento'] - Régimen de impuesto de la línea.
 * @returns {{ subExento: number, subGravado: number, isvLinea: number }}
 *          Siempre se cumple: subExento + subGravado + isvLinea === precioVenta * cantidad.
 */
function calcularIsvLinea(precioVenta, cantidad, tipoIsv = 'exento') {
    const lineTotal = Number(precioVenta) * Number(cantidad);

    if (tipoIsv === 'exento') {
        return { subExento: lineTotal, subGravado: 0, isvLinea: 0 };
    }

    const rate = tipoIsv === '18' ? 0.18 : 0.15;
    const subGravado = lineTotal / (1 + rate);
    return { subExento: 0, subGravado, isvLinea: lineTotal - subGravado };
}

module.exports = { calcularIsvLinea, esTipoIsvValido, TIPOS_ISV_VALIDOS };
