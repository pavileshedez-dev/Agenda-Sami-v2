-- Migración 004: Retrospectivas e instantáneas semanales inmutables
CREATE TABLE IF NOT EXISTS semanas_cerradas (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  semana_inicio TEXT NOT NULL, -- Fecha de inicio (lunes) YYYY-MM-DD
  semana_fin TEXT NOT NULL, -- Fecha de fin (domingo) YYYY-MM-DD
  cerrado_en TEXT NOT NULL,
  datos_json TEXT NOT NULL, -- Snapshot serializado completo del resumen semanal
  notas_cierre TEXT,
  UNIQUE(user_id, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_semanas_cerradas_rango ON semanas_cerradas(user_id, semana_inicio);
