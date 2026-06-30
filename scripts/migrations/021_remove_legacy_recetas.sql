-- 021: Remove legacy pharmacy prescription module.
-- Veterinary formulas and medications are managed through patient clinical events.

DELETE FROM rol_permisos
WHERE idPermiso IN ('VER_RECETAS', 'AUTORIZAR_PSICOFARMACOS');

DELETE FROM permisos
WHERE idPermiso IN ('VER_RECETAS', 'AUTORIZAR_PSICOFARMACOS');

DELETE FROM plan_features
WHERE feature_key = 'modulo_recetas';

ALTER TABLE IF EXISTS ventas DROP COLUMN IF EXISTS id_receta;

DROP TABLE IF EXISTS libro_psicofarmacos CASCADE;
DROP TABLE IF EXISTS recetas_retenidas CASCADE;
DROP TABLE IF EXISTS detalle_receta CASCADE;
DROP TABLE IF EXISTS recetas CASCADE;
