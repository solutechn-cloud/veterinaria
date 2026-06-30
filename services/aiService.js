
// IA con OpenAI (ChatGPT) — funciones farmacéuticas
const OpenAI = require('openai');

const MODEL = 'gpt-4o-mini';

let _client = null;

function getClient() {
    if (!_client) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY no está configurada');
        }
        _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return _client;
}

async function callAI(systemPrompt, userPrompt, maxTokens = 1200) {
    const client = getClient();
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });
    return response.choices[0].message.content;
}

function parseJson(text, fallback) {
    try {
        return JSON.parse(text);
    } catch {
        try {
            const match = text.match(/\{[\s\S]*\}/);
            return match ? JSON.parse(match[0]) : fallback;
        } catch {
            return fallback;
        }
    }
}

/**
 * Recomendar medicamentos OTC según síntomas del cliente.
 * Consulta el inventario disponible y solo recomienda productos en stock.
 */
async function recommendBySintomas(sintomasData, inventarioDisponible = []) {
    try {
        const inventarioText = inventarioDisponible.length > 0
            ? inventarioDisponible.map(m => `- ${m.nombre_generico}${m.nombre_comercial ? ` / ${m.nombre_comercial}` : ''} (${m.concentracion || ''}) [Stock: ${m.stock}]`).join('\n')
            : 'Sin inventario disponible';

        const systemPrompt = `Eres un asistente veterinario de Honduras.
Tu función es sugerir medicamentos OTC (de venta libre, sin receta) para síntomas comunes.
REGLAS ESTRICTAS:
- SOLO recomienda medicamentos que NO requieran receta médica
- SOLO recomienda productos del inventario disponible que se te proporcione
- Siempre advierte que esto NO reemplaza consulta médica
- Si los síntomas sugieren urgencia o gravedad, recomienda ir al médico
- Considera alergias y medicamentos actuales del paciente
- Responde siempre en español
- Responde ÚNICAMENTE con el JSON especificado, sin texto adicional`;

        // Sanitize inputs before sending to AI — no patient identity, cap lengths
        const sanitize = (s) => String(s || '').replace(/[^\w\s,áéíóúñÁÉÍÓÚÑ.-]/gi, '').substring(0, 100);
        const sintomas    = (sintomasData.sintomas || []).slice(0, 10).map(sanitize);
        const alergias    = (sintomasData.alergias || []).slice(0, 20).map(sanitize);
        const medicActuales = (sintomasData.medicamentos_actuales || []).slice(0, 20).map(sanitize);
        const condiciones = sanitize(sintomasData.condiciones_cronicas).substring(0, 300);

        const userPrompt = `Paciente con síntomas: ${sintomas.join(', ')}.
Edad aproximada: ${sintomasData.edad || 'desconocida'} años.
${sintomasData.embarazada ? 'IMPORTANTE: EMBARAZADA - evitar medicamentos teratogénicos.' : ''}
Alergias conocidas: ${alergias.join(', ') || 'ninguna conocida'}.
Medicamentos actuales: ${medicActuales.join(', ') || 'ninguno'}.
Condiciones crónicas: ${condiciones || 'ninguna conocida'}.

Inventario disponible en la veterinaria:
${inventarioText}

Responde con este JSON exacto:
{
  "recomendaciones": [
    {
      "nombre": "nombre del medicamento",
      "razon": "por qué se recomienda para estos síntomas",
      "dosis_sugerida": "dosis y frecuencia aproximada",
      "advertencias": ["advertencia1", "advertencia2"],
      "prioridad": 1
    }
  ],
  "advertencia_general": "mensaje al veterinario",
  "requiere_medico": false,
  "motivo_medico": "si requiere médico, explicar por qué"
}`;

        const text = await callAI(systemPrompt, userPrompt);
        const result = parseJson(text, null);
        if (!result) {
            return { recomendaciones: [], advertencia_general: text, requiere_medico: false };
        }
        return result;
    } catch (err) {
        console.error('[aiService] error:', err.code || err.status || 'unknown');
        return { error: 'IA no disponible' };
    }
}

/**
 * Verificar interacciones medicamentosas entre el medicamento nuevo y los actuales del paciente.
 */
async function analyzeInteractions(medicamentoNuevo, medicamentosActuales = [], alergias = []) {
    try {
        if (medicamentosActuales.length === 0 && alergias.length === 0) {
            return { interacciones: [], nivel_riesgo: 'bajo', mensaje: 'Sin medicamentos actuales registrados para verificar.' };
        }

        const systemPrompt = `Eres un veterinario clinico experto en interacciones medicamentosas.
Analiza si el medicamento nuevo puede interactuar con los actuales del paciente.
Responde solo con el JSON especificado, en español.`;

        const userPrompt = `Medicamento NUEVO a dispensar: ${medicamentoNuevo}
Medicamentos ACTUALES del paciente: ${medicamentosActuales.join(', ') || 'ninguno'}
Alergias conocidas: ${alergias.join(', ') || 'ninguna'}

Responde con este JSON exacto:
{
  "interacciones": [
    {
      "medicamento_involucrado": "nombre",
      "descripcion": "descripción de la interacción",
      "nivel_severidad": "leve|moderada|grave",
      "recomendacion": "qué hacer"
    }
  ],
  "nivel_riesgo_global": "bajo|moderado|alto",
  "alerta_alergia": false,
  "descripcion_alergia": null,
  "mensaje_veterinario": "resumen para el veterinario"
}`;

        const text = await callAI(systemPrompt, userPrompt);
        const result = parseJson(text, null);
        if (!result) {
            return { interacciones: [], nivel_riesgo_global: 'desconocido', mensaje_veterinario: text };
        }
        return result;
    } catch (err) {
        console.error('[aiService] error:', err.code || err.status || 'unknown');
        return { error: 'IA no disponible' };
    }
}

/**
 * Analizar cliente veterinario: historial de compras, medicamentos frecuentes, oportunidades.
 */
async function analyzeClient(clientData) {
    try {
        const systemPrompt = `Eres un analista CRM para una clinica veterinaria en Honduras.
Analiza el historial del cliente y sugiere acciones de fidelización.
Responde solo con el JSON especificado, en español.`;

        // Pseudonymize: remove patient name and detailed purchase items before sending to AI
        const categoriasCompra = (clientData.compras || [])
            .slice(0, 20)
            .map(c => c.medicamento || 'producto')
            .reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {});

        const userPrompt = `Total gastado: L ${clientData.totalGastado || 0}
Promedio por compra: L ${clientData.promedioCompra || 0}
Frecuencia de visitas: ${clientData.frecuencia || 'desconocida'}
Categorías de productos frecuentes: ${JSON.stringify(categoriasCompra)}
Tiene condiciones crónicas registradas: ${clientData.condiciones_cronicas ? 'Sí' : 'No'}
Es adulto mayor (≥60): ${clientData.es_adulto_mayor ? 'Sí (aplica 25% descuento)' : 'No'}

Responde con este JSON exacto:
{
  "resumen": "texto",
  "perfil_cliente": "texto",
  "medicamentos_frecuentes": ["med1", "med2"],
  "sugerencia_accion": "texto",
  "valor_estimado_futuro": "texto",
  "recordatorio_descuento": "texto si aplica descuento tercera edad"
}`;

        const text = await callAI(systemPrompt, userPrompt);
        const result = parseJson(text, null);
        if (!result) {
            return { resumen: text, perfil_cliente: 'No determinado', sugerencia_accion: 'Revisar manualmente' };
        }
        return result;
    } catch (err) {
        console.error('[aiService] error:', err.code || err.status || 'unknown');
        return { error: 'IA no disponible' };
    }
}

/**
 * Detectar anomalías en el cierre de caja.
 */
async function detectCashAnomaly(arqueoData, historicalArqueos = []) {
    try {
        const systemPrompt = `Eres un auditor financiero para clinicas veterinarias en Honduras.
Detecta anomalías en el cierre de caja comparando con el histórico.
Responde solo con el JSON especificado.`;

        const userPrompt = `Arqueo actual:
- Monto inicial: L ${arqueoData.montoInicial}
- Total ventas: L ${arqueoData.totalVentas}
- Total egresos: L ${arqueoData.totalEgresos}
- Ganancia: L ${arqueoData.ganancia}

Histórico (últimos ${historicalArqueos.length} cierres):
${historicalArqueos.slice(0, 5).map(a =>
    `- Ventas L${a.totalventas || 0}, Ganancia L${a.ganancia || 0}`
).join('\n')}

Responde con este JSON exacto:
{
  "es_anomal": false,
  "nivel_riesgo": "bajo",
  "observaciones": "texto",
  "recomendacion": "texto"
}`;

        const text = await callAI(systemPrompt, userPrompt);
        const result = parseJson(text, null);
        if (!result) {
            return { es_anomal: false, nivel_riesgo: 'bajo', observaciones: text, recomendacion: 'Revisar manualmente' };
        }
        return result;
    } catch (err) {
        console.error('[aiService] error:', err.code || err.status || 'unknown');
        return { error: 'IA no disponible' };
    }
}

/**
 * Predecir necesidades de reabastecimiento basado en historial de ventas.
 */
async function predictRestock(medicamento, historialVentas = []) {
    try {
        const systemPrompt = `Eres un experto en gestión de inventario veterinario en Honduras.
Predice cuánto stock pedir basándote en el historial de ventas.
Responde solo con el JSON especificado.`;

        const userPrompt = `Medicamento: ${medicamento.nombre_generico} (${medicamento.concentracion || ''})
Stock actual: ${medicamento.stockActual || 0} unidades base
Stock mínimo: ${medicamento.stock_minimo || 0}
Punto de reorden: ${medicamento.punto_reorden || 0}

Historial de ventas (últimos ${historialVentas.length} registros):
${historialVentas.map(v => `- Fecha: ${v.fecha}, Cantidad: ${v.cantidad}`).join('\n') || 'Sin historial disponible'}

Responde con este JSON exacto:
{
  "cantidad_sugerida": 0,
  "dias_stock_actual": 0,
  "frecuencia_pedido_sugerida": "semanal|quincenal|mensual",
  "justificacion": "texto",
  "alertas": ["alerta1"]
}`;

        const text = await callAI(systemPrompt, userPrompt);
        const result = parseJson(text, null);
        if (!result) {
            return { cantidad_sugerida: 0, justificacion: text, alertas: [] };
        }
        return result;
    } catch (err) {
        console.error('[aiService] error:', err.code || err.status || 'unknown');
        return { error: 'IA no disponible' };
    }
}

module.exports = { recommendBySintomas, analyzeInteractions, analyzeClient, detectCashAnomaly, predictRestock };
