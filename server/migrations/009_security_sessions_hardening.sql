-- Migración 009: Endurecimiento de sesiones persistentes e índices de seguridad
ALTER TABLE sesiones ADD COLUMN last_seen_at TEXT;
ALTER TABLE sesiones ADD COLUMN user_agent TEXT;
ALTER TABLE sesiones ADD COLUMN ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_sesiones_expires_at ON sesiones(expires_at);
CREATE INDEX IF NOT EXISTS idx_sesiones_user_id ON sesiones(user_id);
