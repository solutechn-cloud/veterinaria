'use strict';

const { pool, generateNextId, handleDbError, withTenantContext } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');
const { getSignedImageUrl } = require('../../services/r2Storage');

function registerRoutes(router) {

    // GET /api/productos/unificados — aggregated product list for POS with stock + presentations
    router.get('/productos/unificados', authenticateToken, async (req, res) => {
        try {
            const { q, id_sucursal, include_zero_stock } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal;

            const params = [req.tenantId];
            let where = `WHERE m.activo = TRUE AND m.tenant_id = $1`;
            let stockSucursalFilter = '';

            if (sucursalId && include_zero_stock !== '1') {
                params.push(sucursalId);
                stockSucursalFilter = `AND (l.id_sucursal = $${params.length} OR l.id_sucursal IS NULL)`;
            }
            if (q) {
                const esc = String(q).substring(0, 100).replace(/[\\%_]/g, '\\$&');
                params.push(`%${esc}%`);
                where += ` AND (LOWER(m.nombre_generico) LIKE LOWER($${params.length})
                          OR LOWER(m.nombre_comercial) LIKE LOWER($${params.length}))`;
            }

            const result = await pool.query(`
                WITH stock_resumen AS (
                    SELECT
                        l.id_medicamento,
                        COALESCE(SUM(l.cantidad_actual), 0) AS stock
                    FROM lotes_medicamento l
                    WHERE l.tenant_id = $1
                      AND l.estado = 'Activo'
                      AND l.cantidad_actual > 0
                      ${stockSucursalFilter}
                    GROUP BY l.id_medicamento
                ),
                presentaciones_resumen AS (
                    SELECT
                        pv.id_medicamento,
                        json_agg(jsonb_build_object(
                            'id_presentacion',     pv.id_presentacion,
                            'nombre',              pv.nombre,
                            'factor',              pv.factor_conversion,
                            'precio_venta',        pv.precio_venta,
                            'precio_tercera_edad', COALESCE(pv.precio_tercera_edad, ROUND(pv.precio_venta * 0.75, 2)),
                            'codigo_barras',       pv.codigo_barras_presentacion
                        ) ORDER BY pv.nombre) AS presentaciones
                    FROM presentaciones_venta pv
                    WHERE pv.tenant_id = $1
                      AND pv.es_unidad_venta = TRUE
                      AND pv.activo = TRUE
                    GROUP BY pv.id_medicamento
                )
                SELECT
                    m.codigo,
                    m.codigo_ean13       AS "codigoBarras",
                    m.nombre_generico    AS "nombreGenerico",
                    m.nombre_comercial   AS "nombreComercial",
                    m.concentracion,
                    m.tipo_isv           AS "tipoIsv",
                    m.requiere_receta    AS "requiereReceta",
                    m.es_controlado      AS "esControlado",
                    m.advertencias,
                    ct.nombre            AS categoria,
                    ff.nombre            AS "formaFarmaceutica",
                    COALESCE(sr.stock, 0) AS stock,
                    mi.url_imagen    AS "urlImagen",
                    mi.imagen_base64 AS "imagenBase64",
                    mi.r2_key        AS "r2Key",
                    COALESCE(pr.presentaciones, '[]'::json) AS presentaciones
                FROM medicamentos m
                LEFT JOIN categorias_terapeuticas ct ON m.id_categoria = ct.id_categoria AND ct.tenant_id = $1
                LEFT JOIN formas_farmaceuticas ff    ON m.id_forma     = ff.id_forma AND ff.tenant_id = $1
                LEFT JOIN stock_resumen sr ON sr.id_medicamento = m.codigo
                LEFT JOIN presentaciones_resumen pr ON pr.id_medicamento = m.codigo
                LEFT JOIN LATERAL (
                    SELECT url_imagen, imagen_base64, r2_key
                    FROM medicamento_imagenes mi
                    WHERE mi.id_medicamento = m.codigo
                      AND mi.es_principal = TRUE
                      AND mi.tenant_id = $1
                    ORDER BY id_imagen DESC
                    LIMIT 1
                ) mi ON TRUE
                ${where}
                ${include_zero_stock === '1' ? '' : 'AND COALESCE(sr.stock, 0) > 0'}
                ORDER BY m.nombre_generico
                LIMIT 200
            `, params);

            const serviceParams = [req.tenantId];
            let serviceWhere = 'WHERE tenant_id = $1 AND activo = TRUE';
            if (q) {
                const esc = String(q).substring(0, 100).replace(/[\\%_]/g, '\\$&');
                serviceParams.push(`%${esc}%`);
                serviceWhere += ` AND (LOWER(nombre) LIKE LOWER($${serviceParams.length}) OR LOWER(categoria) LIKE LOWER($${serviceParams.length}))`;
            }
            const services = await pool.query(`
                SELECT
                    'SERV-' || id_servicio AS codigo,
                    nombre AS "nombreGenerico",
                    categoria AS "nombreComercial",
                    NULL AS concentracion,
                    tipo_isv AS "tipoIsv",
                    FALSE AS "requiereReceta",
                    FALSE AS "esControlado",
                    descripcion AS advertencias,
                    categoria,
                    'Servicio' AS "formaFarmaceutica",
                    999999 AS stock,
                    NULL AS "urlImagen",
                    NULL AS "imagenBase64",
                    NULL AS "r2Key",
                    'SERVICIO' AS "tipoProducto",
                    json_agg(jsonb_build_object(
                        'id_presentacion', id_servicio,
                        'nombre', nombre,
                        'factor', 1,
                        'precio_venta', precio,
                        'precio_tercera_edad', precio,
                        'codigo_barras', codigo
                    )) AS presentaciones
                FROM servicios_veterinarios
                ${serviceWhere}
                GROUP BY id_servicio, nombre, categoria, tipo_isv, descripcion, precio, codigo
                ORDER BY nombre
            `, serviceParams);

            const rows = [...result.rows.map(r => ({ ...r, tipoProducto: r.tipoProducto || 'MEDICAMENTO' })), ...services.rows];
            await Promise.all(rows.map(async row => {
                if (row.r2Key) {
                    try { row.urlImagen = await getSignedImageUrl(row.r2Key, 3600); } catch {}
                    row.imagenBase64 = null;
                }
                delete row.r2Key;
            }));
            res.json(rows);
        } catch (e) { handleDbError(res, e); }
    });

    // GET /api/medicamentos/lotes/all — all lots across medications (for inventory view)
    router.get('/medicamentos/lotes/all', authenticateToken, async (req, res) => {
        try {
            const { id_sucursal } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            const params = [req.tenantId];
            let sucursalFilter = '';
            if (sucursalId) { params.push(sucursalId); sucursalFilter = `AND l.id_sucursal = $${params.length}`; }

            const r = await pool.query(`
                SELECT l.*, p.nombre AS "nombreProveedor", m.nombre_generico AS "medNombre",
                       CASE WHEN l.fecha_vencimiento <= CURRENT_DATE THEN 'Vencido'
                            WHEN l.fecha_vencimiento <= CURRENT_DATE + 30 THEN 'Por vencer (30d)'
                            WHEN l.fecha_vencimiento <= CURRENT_DATE + 90 THEN 'Por vencer (90d)'
                            ELSE 'Vigente' END AS alerta_vencimiento
                FROM lotes_medicamento l
                JOIN medicamentos m ON m.codigo = l.id_medicamento AND m.tenant_id = l.tenant_id
                LEFT JOIN proveedores p ON l.id_proveedor = p.codProveedor AND p.tenant_id = l.tenant_id
                WHERE l.tenant_id = $1 ${sucursalFilter}
                ORDER BY CASE WHEN l.estado = 'Activo' THEN 0 ELSE 1 END,
                         l.fecha_vencimiento ASC,
                         l.fecha_ingreso DESC
            `, params);

            res.json(r.rows);
        } catch (e) { handleDbError(res, e); }
    });

    // GET /api/medicamentos — list with filters
    router.get('/medicamentos', authenticateToken, async (req, res) => {
        try {
            const { q, id_categoria, tipo_isv, requiere_receta, es_controlado, activo, estado_catalogo, id_sucursal, limit, offset } = req.query;
            const sucursalId = id_sucursal || req.user.id_sucursal || null;
            const params = [req.tenantId];
            let where = `WHERE m.tenant_id = $1`;
            let loteJoin = `LEFT JOIN lotes_medicamento l
                ON m.codigo = l.id_medicamento
               AND l.estado = 'Activo'
               AND l.tenant_id = $1`;

            if (sucursalId) {
                params.push(sucursalId);
                loteJoin += ` AND l.id_sucursal = $${params.length}`;
            }

            if (q) {
                const esc = String(q).substring(0, 100).replace(/[\\%_]/g, '\\$&');
                params.push(`%${esc}%`);
                where += ` AND (LOWER(m.nombre_generico) LIKE LOWER($${params.length})
                            OR LOWER(m.nombre_comercial) LIKE LOWER($${params.length}))`;
            }
            if (id_categoria) { params.push(id_categoria); where += ` AND m.id_categoria = $${params.length}`; }
            if (tipo_isv)     { params.push(tipo_isv);     where += ` AND m.tipo_isv = $${params.length}`; }
            if (requiere_receta !== undefined) { params.push(requiere_receta === 'true'); where += ` AND m.requiere_receta = $${params.length}`; }
            if (es_controlado  !== undefined) { params.push(es_controlado  === 'true'); where += ` AND m.es_controlado = $${params.length}`; }
            if (activo !== undefined) { params.push(activo === 'true'); where += ` AND m.activo = $${params.length}`; }
            else { where += ` AND m.activo = TRUE`; }

            const estadoWhere = estado_catalogo
                ? 'WHERE "estadoCatalogo" = $' + (params.push(estado_catalogo), params.length)
                : '';

            let limitOffset = '';
            if (limit !== undefined) {
                params.push(Math.max(1, Number(limit) || 25));
                limitOffset += ` LIMIT $${params.length}`;
            }
            if (offset !== undefined) {
                params.push(Math.max(0, Number(offset) || 0));
                limitOffset += ` OFFSET $${params.length}`;
            }

            const result = await pool.query(`
                WITH lotes_resumen AS (
                    SELECT
                        l.id_medicamento,
                        COALESCE(SUM(l.cantidad_actual), 0) AS stock_total,
                        COUNT(DISTINCT l.id_lote) FILTER (
                            WHERE COALESCE(l.cantidad_actual, 0) > 0
                        ) AS lotes_activos
                    FROM lotes_medicamento l
                    WHERE l.estado = 'Activo'
                      AND l.tenant_id = $1
                      ${sucursalId ? 'AND l.id_sucursal = $2' : ''}
                    GROUP BY l.id_medicamento
                ),
                presentaciones_resumen AS (
                    SELECT
                        pv.id_medicamento,
                        COUNT(DISTINCT pv.id_presentacion) FILTER (
                            WHERE pv.activo = TRUE
                        ) AS presentaciones_activas,
                        COUNT(DISTINCT pv.id_presentacion) FILTER (
                            WHERE pv.activo = TRUE
                              AND pv.es_unidad_venta = TRUE
                              AND COALESCE(pv.precio_venta, 0) > 0
                        ) AS presentaciones_vendibles
                    FROM presentaciones_venta pv
                    WHERE pv.tenant_id = $1
                    GROUP BY pv.id_medicamento
                ),
                catalogo AS (
                SELECT
                    m.codigo,
                    m.nombre_generico,
                    m.nombre_comercial,
                    m.concentracion,
                    m.id_forma,
                    m.via_administracion,
                    m.id_categoria,
                    m.indicaciones,
                    m.contraindicaciones,
                    m.advertencias,
                    m.registro_sanitario,
                    m.laboratorio,
                    m.pais_origen,
                    m.requiere_receta,
                    m.es_controlado,
                    m.clase_controlado,
                    m.tipo_isv,
                    m.precio_costo_base,
                    m.margen_ganancia,
                    m.stock_minimo,
                    m.punto_reorden,
                    m.codigo_ean13,
                    m.condicion_almacenamiento,
                    m.id_sucursal_principal,
                    m.activo,
                    m.fecha_alta,
                    m.tenant_id,
                    m.tipo_producto,
                    ct.nombre                           AS "categoriaNombre",
                    ff.nombre                           AS "formaNombre",
                    ff.unidad_base                      AS "unidadBase",
                    COALESCE(lr.stock_total, 0) AS "stockTotal",
                    COALESCE(pr.presentaciones_activas, 0) AS "presentacionesActivas",
                    COALESCE(pr.presentaciones_vendibles, 0) AS "presentacionesVendibles",
                    COALESCE(lr.lotes_activos, 0) AS "lotesActivos",
                    CASE
                        WHEN COALESCE(pr.presentaciones_vendibles, 0) = 0 THEN 'Borrador'
                        WHEN COALESCE(lr.stock_total, 0) <= 0 THEN 'Sin stock'
                        ELSE 'Listo para venta'
                    END AS "estadoCatalogo",
                    (SELECT url_imagen FROM medicamento_imagenes mi
                     WHERE mi.id_medicamento = m.codigo AND mi.tenant_id = $1 AND mi.es_principal = TRUE
                     LIMIT 1) AS "urlImagenPrincipal",
                    (SELECT imagen_base64 FROM medicamento_imagenes mi
                     WHERE mi.id_medicamento = m.codigo AND mi.tenant_id = $1 AND mi.es_principal = TRUE
                     LIMIT 1) AS "imagenBase64Principal",
                    (SELECT r2_key FROM medicamento_imagenes mi
                     WHERE mi.id_medicamento = m.codigo AND mi.tenant_id = $1 AND mi.es_principal = TRUE
                       AND r2_key IS NOT NULL
                     LIMIT 1) AS "r2KeyPrincipal"
                FROM medicamentos m
                LEFT JOIN categorias_terapeuticas ct ON m.id_categoria = ct.id_categoria AND ct.tenant_id = $1
                LEFT JOIN formas_farmaceuticas ff    ON m.id_forma = ff.id_forma AND ff.tenant_id = $1
                LEFT JOIN lotes_resumen lr ON lr.id_medicamento = m.codigo
                LEFT JOIN presentaciones_resumen pr ON pr.id_medicamento = m.codigo
                ${where}
                )
                SELECT * FROM catalogo
                ${estadoWhere}
                ORDER BY nombre_generico
                ${limitOffset}
            `, params);

            const rows = await Promise.all(result.rows.map(async (row) => {
                if (row.r2KeyPrincipal && !row.urlImagenPrincipal) {
                    try {
                        row.urlImagenPrincipal = await getSignedImageUrl(row.r2KeyPrincipal, 3600);
                    } catch { /* si falla, la imagen simplemente no se muestra */ }
                }
                return row;
            }));
            res.json(rows);
        } catch (e) { handleDbError(res, e); }
    });

    // GET /api/medicamentos/:id
    router.get('/medicamentos/:id', authenticateToken, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT m.*, ct.nombre AS "categoriaNombre", ff.nombre AS "formaNombre", ff.unidad_base AS "unidadBase"
                FROM medicamentos m
                LEFT JOIN categorias_terapeuticas ct ON m.id_categoria = ct.id_categoria AND ct.tenant_id = $2
                LEFT JOIN formas_farmaceuticas ff    ON m.id_forma     = ff.id_forma AND ff.tenant_id = $2
                WHERE m.codigo = $1 AND m.tenant_id = $2
            `, [req.params.id, req.tenantId]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado' });
            res.json(result.rows[0]);
        } catch (e) { handleDbError(res, e); }
    });

    // POST /api/medicamentos
    router.post('/medicamentos', authenticateToken, async (req, res) => {
        try {
            const {
                nombre_generico, nombre_comercial, concentracion, id_forma, via_administracion,
                id_categoria, indicaciones, contraindicaciones, advertencias,
                registro_sanitario, laboratorio, pais_origen,
                requiere_receta, es_controlado, clase_controlado,
                tipo_isv, precio_costo_base, margen_ganancia,
                stock_minimo, punto_reorden, codigo_ean13,
                condicion_almacenamiento, id_sucursal_principal
            } = req.body;

            if (!nombre_generico) return res.status(400).json({ error: 'nombre_generico es requerido' });

            const codigo = await withTenantContext(req.tenantId, async (client) => {
                const id = await generateNextId('medicamentos', 'codigo', 'MED', client);
                await client.query(`
                    INSERT INTO medicamentos (
                        codigo, nombre_generico, nombre_comercial, concentracion, id_forma, via_administracion,
                        id_categoria, indicaciones, contraindicaciones, advertencias,
                        registro_sanitario, laboratorio, pais_origen,
                        requiere_receta, es_controlado, clase_controlado,
                        tipo_isv, precio_costo_base, margen_ganancia,
                        stock_minimo, punto_reorden, codigo_ean13,
                        condicion_almacenamiento, id_sucursal_principal, activo, tenant_id
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                        $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24, TRUE, $25
                    )
                `, [
                    id, nombre_generico, nombre_comercial || null, concentracion || null,
                    id_forma || null, via_administracion || 'Oral', id_categoria || null,
                    indicaciones || null, contraindicaciones || null, advertencias || null,
                    registro_sanitario || null, laboratorio || null, pais_origen || 'Honduras',
                    requiere_receta || false, es_controlado || false, clase_controlado || null,
                    tipo_isv || 'exento', precio_costo_base || null, margen_ganancia || 30,
                    stock_minimo || 10, punto_reorden || 20, codigo_ean13 || null,
                    condicion_almacenamiento || 'Temperatura ambiente', id_sucursal_principal || null,
                    req.tenantId
                ]);
                return id;
            });

            res.status(201).json({ message: 'Medicamento creado', codigo });
        } catch (e) { handleDbError(res, e); }
    });

    // PUT /api/medicamentos/:id
    router.put('/medicamentos/:id', authenticateToken, async (req, res) => {
        try {
            const {
                nombre_generico, nombre_comercial, concentracion, id_forma, via_administracion,
                id_categoria, indicaciones, contraindicaciones, advertencias,
                registro_sanitario, laboratorio, pais_origen,
                requiere_receta, es_controlado, clase_controlado,
                tipo_isv, precio_costo_base, margen_ganancia,
                stock_minimo, punto_reorden, codigo_ean13,
                condicion_almacenamiento, activo
            } = req.body;

            await pool.query(`
                UPDATE medicamentos SET
                    nombre_generico=$1, nombre_comercial=$2, concentracion=$3, id_forma=$4,
                    via_administracion=$5, id_categoria=$6, indicaciones=$7,
                    contraindicaciones=$8, advertencias=$9, registro_sanitario=$10,
                    laboratorio=$11, pais_origen=$12, requiere_receta=$13,
                    es_controlado=$14, clase_controlado=$15, tipo_isv=$16,
                    precio_costo_base=$17, margen_ganancia=$18, stock_minimo=$19,
                    punto_reorden=$20, codigo_ean13=$21, condicion_almacenamiento=$22,
                    activo=$23
                WHERE codigo=$24 AND tenant_id=$25
            `, [
                nombre_generico, nombre_comercial || null, concentracion || null, id_forma || null,
                via_administracion || 'Oral', id_categoria || null, indicaciones || null,
                contraindicaciones || null, advertencias || null, registro_sanitario || null,
                laboratorio || null, pais_origen || 'Honduras', requiere_receta || false,
                es_controlado || false, clase_controlado || null, tipo_isv || 'exento',
                precio_costo_base || null, margen_ganancia || 30, stock_minimo || 10,
                punto_reorden || 20, codigo_ean13 || null, condicion_almacenamiento || 'Temperatura ambiente',
                activo !== false, req.params.id, req.tenantId
            ]);

            res.json({ message: 'Medicamento actualizado' });
        } catch (e) { handleDbError(res, e); }
    });

    // DELETE /api/medicamentos/:id (soft delete)
    router.delete('/medicamentos/:id', authenticateToken, async (req, res) => {
        try {
            await pool.query(
                `UPDATE medicamentos SET activo = FALSE WHERE codigo = $1 AND tenant_id = $2`,
                [req.params.id, req.tenantId]
            );
            res.json({ message: 'Medicamento desactivado' });
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
