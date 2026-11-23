-- Migración 008: Soporte ampliado para eventos (Planes y Vacaciones)
-- Añade ubicación y marca de día completo a la tabla eventos.

ALTER TABLE eventos ADD COLUMN ubicacion TEXT;
ALTER TABLE eventos ADD COLUMN es_dia_completo INTEGER DEFAULT 0;
