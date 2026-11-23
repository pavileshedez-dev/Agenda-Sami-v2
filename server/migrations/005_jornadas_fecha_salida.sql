-- Migración 005: Campo fecha_salida en jornadas laborales para soporte de turnos nocturnos
ALTER TABLE jornadas_laborales ADD COLUMN fecha_salida TEXT;
