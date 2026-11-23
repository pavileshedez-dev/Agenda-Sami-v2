-- Migración 003: Excepciones puntuales de horario sin mutar el patrón recurrente
CREATE TABLE IF NOT EXISTS horario_excepciones (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  horario_id TEXT NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL, -- Fecha específica ISO YYYY-MM-DD
  cancelada INTEGER DEFAULT 0, -- 1 si la clase queda cancelada este día puntual
  aula_alternativa TEXT,
  hora_inicio_alt TEXT,
  hora_fin_alt TEXT,
  motivo TEXT,
  creado_en TEXT NOT NULL,
  UNIQUE(horario_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_excepciones_fecha ON horario_excepciones(user_id, fecha);
