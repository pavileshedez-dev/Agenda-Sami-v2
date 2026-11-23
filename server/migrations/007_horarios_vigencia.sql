-- Migración 007: Vigencia histórica de horarios y persistencia de resoluciones DST
ALTER TABLE horarios ADD COLUMN fecha_inicio TEXT;
ALTER TABLE horarios ADD COLUMN fecha_fin TEXT;
CREATE INDEX IF NOT EXISTS idx_horarios_vigencia ON horarios(user_id, dia, fecha_inicio, fecha_fin);

ALTER TABLE jornadas_laborales ADD COLUMN dst_eleccion TEXT;
