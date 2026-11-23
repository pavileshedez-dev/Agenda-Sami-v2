-- Migración 006: Versionado, Auditoría y Protección de Inmutabilidad en Semanas Cerradas
ALTER TABLE semanas_cerradas ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE semanas_cerradas ADD COLUMN reabierto INTEGER DEFAULT 0;
ALTER TABLE semanas_cerradas ADD COLUMN reabierto_por TEXT;
ALTER TABLE semanas_cerradas ADD COLUMN reabierto_en TEXT;
ALTER TABLE semanas_cerradas ADD COLUMN historial_versiones TEXT DEFAULT '[]';

-- Trigger para bloquear actualizaciones arbitrarias directas en semanas congeladas
CREATE TRIGGER IF NOT EXISTS trg_semanas_cerradas_prevent_tampering
BEFORE UPDATE ON semanas_cerradas
FOR EACH ROW
WHEN (OLD.reabierto = 0 AND NEW.reabierto = 0 AND NEW.version = OLD.version AND NEW.datos_json != OLD.datos_json AND (SELECT valor FROM ajustes_usuario WHERE clave = 'permitir_restauracion_backup') IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Inmutabilidad violada: no se puede modificar el contenido de una semana cerrada sin reapertura formal');
END;

-- Trigger para prohibir la eliminación accidental o maliciosa de históricos de semanas cerradas
CREATE TRIGGER IF NOT EXISTS trg_semanas_cerradas_prevent_delete
BEFORE DELETE ON semanas_cerradas
FOR EACH ROW
WHEN (SELECT valor FROM ajustes_usuario WHERE clave = 'permitir_restauracion_backup') IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Inmutabilidad violada: prohibido eliminar registros de semanas cerradas; use el mecanismo de reapertura');
END;
