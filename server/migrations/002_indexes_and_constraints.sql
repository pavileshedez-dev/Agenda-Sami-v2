-- Migración 002: Índices para optimización de consultas de fecha y ámbito
CREATE INDEX IF NOT EXISTS idx_tareas_user_fecha ON tareas(user_id, fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(user_id, estado);
CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON eventos(user_id, inicio);
CREATE INDEX IF NOT EXISTS idx_festivos_fecha ON festivos(fecha);
CREATE INDEX IF NOT EXISTS idx_festivos_ambito ON festivos(ambito);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos_previstos(user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_jornadas_fecha ON jornadas_laborales(user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_horarios_user_dia ON horarios(user_id, dia);
CREATE INDEX IF NOT EXISTS idx_memorias_asistente ON memorias_asistentes(user_id, asistente);
CREATE INDEX IF NOT EXISTS idx_propuestas_estado ON propuestas_acciones(user_id, estado);
