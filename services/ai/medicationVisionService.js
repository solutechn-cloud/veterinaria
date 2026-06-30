'use strict';

const crypto = require('crypto');
const { pool } = require('../../config/db');
const { PROCESS_MEDICATION_INTAKE, getProcessSettings, callProvider } = require('./providerRegistry');
const { downloadImage } = require('../r2Storage');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FIELD_KEYS = [
    'nombre_generico', 'nombre_comercial', 'concentracion', 'id_forma_sugerida',
    'via_administracion', 'id_categoria_sugerida',
    'laboratorio', 'pais_origen', 'registro_sanitario', 'codigo_ean13',
    'requiere_receta', 'es_controlado', 'clase_controlado',
    'tipo_isv', 'indicaciones', 'advertencias',
    'contraindicaciones', 'condicion_almacenamiento',
];

const VIAS_VALIDAS = ['Oral', 'Topica', 'Intravenosa', 'Intramuscular', 'Inhalada', 'Rectal', 'Sublingual'];
const ALMACENAMIENTO_VALIDO = ['Temperatura ambiente', 'Refrigerado 2-8°C', 'Protegido de luz'];

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        const match = String(text || '').match(/\{[\s\S]*\}/);
        if (!match) return {};
        try { return JSON.parse(match[0]); } catch { return {}; }
    }
}

function stripDataUrl(raw) {
    const value = String(raw || '');
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { mime: match[1], base64: match[2] } : { mime: null, base64: value };
}

function detectMime(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

function validateImages(inputImages) {
    const maxCount = Number(process.env.AI_IMAGE_MAX_COUNT || 3);
    const maxMb = Number(process.env.AI_IMAGE_MAX_MB || 1);
    const maxBytes = maxMb * 1024 * 1024;
    const maxTotalBytes = maxBytes * maxCount;

    if (!Array.isArray(inputImages) || inputImages.length === 0) {
        const err = new Error('Debe enviar al menos una imagen');
        err.statusCode = 400;
        throw err;
    }
    if (inputImages.length > maxCount) {
        const err = new Error(`Maximo ${maxCount} imagenes por analisis`);
        err.statusCode = 400;
        throw err;
    }

    let totalBytes = 0;
    return inputImages.map((img, index) => {
        const parsed = stripDataUrl(img.base64 || img.imagen_base64 || img.data);
        const mime = img.mime || parsed.mime;
        if (!mime || !ALLOWED_MIMES.has(mime)) {
            const err = new Error(`Imagen ${index + 1}: tipo no permitido`);
            err.statusCode = 400;
            throw err;
        }

        const cleanBase64 = String(parsed.base64 || '').replace(/\s/g, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const detected = detectMime(buffer);
        if (!detected || detected !== mime) {
            const err = new Error(`Imagen ${index + 1}: el contenido no coincide con el tipo declarado`);
            err.statusCode = 400;
            throw err;
        }
        if (buffer.length > maxBytes) {
            const err = new Error(`Imagen ${index + 1}: supera el limite de ${maxMb} MB`);
            err.statusCode = 400;
            throw err;
        }
        totalBytes += buffer.length;
        if (totalBytes > maxTotalBytes) {
            const err = new Error(`El total de imagenes supera ${maxMb * maxCount} MB`);
            err.statusCode = 400;
            throw err;
        }

        return {
            base64: cleanBase64,
            mime,
            filename: String(img.filename || `imagen-${index + 1}`).substring(0, 120),
            sizeBytes: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        };
    });
}

function emptyField(value = '', confidence = 0, source = 'inferred') {
    return { value, confidence, source };
}

function normalizeConfidence(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(1, num));
}

function normalizeField(raw, fallbackValue = '', fallbackSource = 'inferred') {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return {
            value: raw.value ?? fallbackValue,
            confidence: normalizeConfidence(raw.confidence),
            source: String(raw.source || fallbackSource).substring(0, 40),
            label: raw.label,
        };
    }
    return emptyField(raw ?? fallbackValue, raw ? 0.5 : 0, fallbackSource);
}

function normalizeResult(raw, settings) {
    const sourceFields = raw?.fields && typeof raw.fields === 'object' ? raw.fields : raw || {};
    const fields = {};
    for (const key of FIELD_KEYS) fields[key] = normalizeField(sourceFields[key]);

    fields.requiere_receta.value = Boolean(fields.requiere_receta.value);
    fields.es_controlado.value = Boolean(fields.es_controlado.value);
    fields.tipo_isv.value = ['exento', '15', '18'].includes(String(fields.tipo_isv.value))
        ? String(fields.tipo_isv.value)
        : 'exento';

    const forma = fields.id_forma_sugerida;
    fields.id_forma_sugerida = {
        value: forma.value === '' ? null : (forma.value ? Number(forma.value) : null),
        label: forma.label || '',
        confidence: normalizeConfidence(forma.confidence),
        source: forma.source || 'inferred',
    };

    const cat = fields.id_categoria_sugerida;
    fields.id_categoria_sugerida = {
        value: cat.value === '' ? null : (cat.value ? Number(cat.value) : null),
        label: cat.label || '',
        confidence: normalizeConfidence(cat.confidence),
        source: cat.source || 'inferred',
    };

    // Normalizar via_administracion a valores válidos del sistema
    const viaRaw = String(fields.via_administracion?.value || '').trim();
    const viaMatch = VIAS_VALIDAS.find(v => v.toLowerCase() === viaRaw.toLowerCase());
    fields.via_administracion = {
        value: viaMatch || (viaRaw ? viaRaw : ''),
        confidence: viaMatch ? normalizeConfidence(fields.via_administracion.confidence) : 0,
        source: fields.via_administracion?.source || 'inferred',
    };

    // Normalizar condicion_almacenamiento a valores válidos
    const almRaw = String(fields.condicion_almacenamiento?.value || '').trim();
    const almMatch = ALMACENAMIENTO_VALIDO.find(a => a.toLowerCase() === almRaw.toLowerCase());
    if (almRaw && !almMatch) {
        fields.condicion_almacenamiento.value = 'Temperatura ambiente';
        fields.condicion_almacenamiento.confidence = Math.min(fields.condicion_almacenamiento.confidence, 0.5);
    }

    return {
        provider: settings.provider,
        model: settings.model,
        fields,
        warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(String).slice(0, 10) : [],
        possibleDuplicates: [],
        needsReview: true,
    };
}

async function findDuplicates(tenantId, result) {
    const fields = result.fields;
    const params = [tenantId];
    const conditions = [];

    const ean = String(fields.codigo_ean13?.value || '').trim();
    if (ean) {
        params.push(ean);
        conditions.push(`m.codigo_ean13 = $${params.length}`);
    }

    const nombre = String(fields.nombre_generico?.value || '').trim();
    const marca = String(fields.nombre_comercial?.value || '').trim();
    const concentracion = String(fields.concentracion?.value || '').trim();
    if (nombre) {
        params.push(nombre.toLowerCase());
        params.push(concentracion.toLowerCase());
        conditions.push(`(LOWER(m.nombre_generico) = $${params.length - 1} AND LOWER(COALESCE(m.concentracion, '')) = $${params.length})`);
    }
    if (marca) {
        params.push(marca.toLowerCase());
        params.push(concentracion.toLowerCase());
        conditions.push(`(LOWER(COALESCE(m.nombre_comercial, '')) = $${params.length - 1} AND LOWER(COALESCE(m.concentracion, '')) = $${params.length})`);
    }

    if (conditions.length === 0) return [];
    const { rows } = await pool.query(`
        SELECT codigo, nombre_generico, nombre_comercial, concentracion, codigo_ean13
        FROM medicamentos m
        WHERE m.tenant_id = $1 AND m.activo = TRUE AND (${conditions.join(' OR ')})
        LIMIT 8
    `, params);
    return rows.map(row => ({
        codigo: row.codigo,
        nombre_generico: row.nombre_generico,
        nombre_comercial: row.nombre_comercial,
        concentracion: row.concentracion,
        codigo_ean13: row.codigo_ean13,
    }));
}

async function getCatalogContext(tenantId) {
    const [formas, categorias] = await Promise.all([
        pool.query('SELECT id_forma, nombre FROM formas_farmaceuticas WHERE tenant_id = $1 AND activo = TRUE ORDER BY nombre', [tenantId]),
        pool.query('SELECT id_categoria, nombre FROM categorias_terapeuticas WHERE tenant_id = $1 AND activo = TRUE ORDER BY nombre', [tenantId]),
    ]);
    return { formas: formas.rows, categorias: categorias.rows };
}

const CONTEXT_TEXT_KEYS = new Set([
    'nombre_generico', 'nombre_comercial', 'concentracion', 'laboratorio',
    'registro_sanitario', 'codigo_ean13', 'tipo_isv', 'indicaciones',
    'advertencias', 'contraindicaciones', 'condicion_almacenamiento',
    'requiere_receta', 'es_controlado',
]);

function sanitizeContext(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const clean = {};
    for (const key of CONTEXT_TEXT_KEYS) {
        const val = raw[key];
        if (val !== undefined && val !== null && val !== '') clean[key] = val;
    }
    return clean;
}

function buildPrompts({ context, catalog }) {
    const systemPrompt = `Eres un asistente de inventario veterinario para Honduras.
Extrae TODOS los datos visibles de fotos de cajas, blisters, frascos o etiquetas de medicamentos.
Responde solo JSON valido. No inventes datos: si no se ve claramente, usa value "" o null y confidence menor a 0.45.
No des consejo medico. Tu tarea es captura de datos de inventario.
Marca source como front_label, back_label, inferred o external.
Para condicion_almacenamiento devuelve EXACTAMENTE uno de: ${ALMACENAMIENTO_VALIDO.join(', ')}.
Para via_administracion devuelve EXACTAMENTE uno de: ${VIAS_VALIDAS.join(', ')}.`;

    const userPrompt = `Analiza las imagenes y extrae todos los campos visibles. Devuelve exactamente este objeto JSON:
{
  "fields": {
    "nombre_generico":       {"value": "", "confidence": 0, "source": "front_label"},
    "nombre_comercial":      {"value": "", "confidence": 0, "source": "front_label"},
    "concentracion":         {"value": "", "confidence": 0, "source": "front_label"},
    "id_forma_sugerida":     {"value": null, "label": "", "confidence": 0, "source": "inferred"},
    "via_administracion":    {"value": "", "confidence": 0, "source": "front_label"},
    "id_categoria_sugerida": {"value": null, "label": "", "confidence": 0, "source": "inferred"},
    "laboratorio":           {"value": "", "confidence": 0, "source": "front_label"},
    "pais_origen":           {"value": "", "confidence": 0, "source": "back_label"},
    "registro_sanitario":    {"value": "", "confidence": 0, "source": "back_label"},
    "codigo_ean13":          {"value": "", "confidence": 0, "source": "front_label"},
    "requiere_receta":       {"value": false, "confidence": 0, "source": "inferred"},
    "es_controlado":         {"value": false, "confidence": 0, "source": "inferred"},
    "clase_controlado":      {"value": "", "confidence": 0, "source": "inferred"},
    "tipo_isv":              {"value": "exento", "confidence": 0, "source": "inferred"},
    "indicaciones":          {"value": "", "confidence": 0, "source": "back_label"},
    "advertencias":          {"value": "", "confidence": 0, "source": "back_label"},
    "contraindicaciones":    {"value": "", "confidence": 0, "source": "back_label"},
    "condicion_almacenamiento": {"value": "", "confidence": 0, "source": "back_label"}
  },
  "warnings": []
}

Formas farmaceuticas disponibles (usa el numero entero en id_forma_sugerida.value):
${catalog.formas.map(f => `- ${f.id_forma}: ${f.nombre}`).join('\n') || '- ninguna'}

Categorias terapeuticas disponibles (usa el numero entero en id_categoria_sugerida.value):
${catalog.categorias.map(c => `- ${c.id_categoria}: ${c.nombre}`).join('\n') || '- ninguna'}

Vias de administracion validas para via_administracion.value: ${VIAS_VALIDAS.join(', ')}
Condiciones de almacenamiento validas: ${ALMACENAMIENTO_VALIDO.join(', ')}

Datos ya registrados por el usuario (no sobreescribas si tienes menor confianza):
${JSON.stringify(sanitizeContext(context))}`;
    return { systemPrompt, userPrompt };
}

async function logAnalysis({ tenantId, userId, processKey, settings, status, durationMs, images, usage, error }) {
    try {
        await pool.query(`
            INSERT INTO ai_analysis_logs
                (tenant_id, user_id, process_key, provider, model, status, duration_ms, image_count, image_metadata, token_usage, error_summary)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [
            tenantId || null,
            userId || null,
            processKey,
            settings.provider,
            settings.model,
            status,
            durationMs,
            images.length,
            JSON.stringify(images.map(img => ({ sha256: img.sha256, mime: img.mime, sizeBytes: img.sizeBytes, filename: img.filename }))),
            usage ? JSON.stringify(usage) : null,
            error ? String(error).substring(0, 500) : null,
        ]);
    } catch (err) {
        console.warn('[ai logs] no se pudo registrar analisis:', err.message);
    }
}

async function loadR2Images(imageIds, tenantId) {
    if (!Array.isArray(imageIds) || imageIds.length === 0) return [];
    const maxCount = Number(process.env.AI_IMAGE_MAX_COUNT || 3);
    const ids = imageIds.slice(0, maxCount);
    const { rows } = await pool.query(
        `SELECT id_imagen, r2_key FROM medicamento_imagenes
         WHERE id_imagen = ANY($1) AND tenant_id = $2 AND r2_key IS NOT NULL`,
        [ids, tenantId]
    );
    const results = [];
    for (const row of rows) {
        try {
            const { buffer, contentType } = await downloadImage(row.r2_key);
            if (!ALLOWED_MIMES.has(contentType)) continue;
            const maxBytes = Number(process.env.AI_IMAGE_MAX_MB || 1) * 1024 * 1024;
            if (buffer.length > maxBytes) continue;
            results.push({
                base64: buffer.toString('base64'),
                mime: contentType,
                filename: row.r2_key.split('/').pop() || 'imagen.jpg',
                sizeBytes: buffer.length,
                sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
            });
        } catch (err) {
            console.warn(`[visionService] No se pudo descargar imagen R2 ${row.r2_key}:`, err.message);
        }
    }
    return results;
}

async function analyzeMedicationImages({ images: inputImages, imageIds, context = {}, tenantId, userId }) {
    const started = Date.now();
    const processKey = PROCESS_MEDICATION_INTAKE;

    // Combina imágenes base64 del cuerpo de la solicitud con las descargadas de R2.
    const validatedBase64 = Array.isArray(inputImages) && inputImages.length > 0
        ? validateImages(inputImages)
        : [];
    const r2Images = await loadR2Images(imageIds, tenantId);
    const images = [...validatedBase64, ...r2Images].slice(0, Number(process.env.AI_IMAGE_MAX_COUNT || 3));

    if (images.length === 0) {
        const err = new Error('Debe enviar al menos una imagen o imageIds válidos');
        err.statusCode = 400;
        throw err;
    }
    const settings = await getProcessSettings(processKey, tenantId);

    try {
        const catalog = await getCatalogContext(tenantId);
        const { systemPrompt, userPrompt } = buildPrompts({ context, catalog });
        const providerResponse = await callProvider({ settings, systemPrompt, userPrompt, images, tenantId });
        const parsed = parseJson(providerResponse.text);
        const result = normalizeResult(parsed, settings);
        result.possibleDuplicates = await findDuplicates(tenantId, result);
        if (result.possibleDuplicates.length > 0) {
            result.warnings.push('Se encontraron posibles medicamentos duplicados. Revise antes de guardar.');
        }
        await logAnalysis({
            tenantId, userId, processKey, settings, status: 'success',
            durationMs: Date.now() - started, images, usage: providerResponse.usage,
        });
        return result;
    } catch (err) {
        await logAnalysis({
            tenantId, userId, processKey, settings, status: 'error',
            durationMs: Date.now() - started, images, error: err.message,
        });
        throw err;
    }
}

module.exports = { analyzeMedicationImages, validateImages };
