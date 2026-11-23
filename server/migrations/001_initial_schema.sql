-- Migración 001: Esquema Base Central de Agenda Sami
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  password_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asignaturas (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  abreviatura TEXT,
  codigo TEXT,
  creditos REAL DEFAULT 6,
  curso INTEGER DEFAULT 1,
  cuatrimestre INTEGER DEFAULT 1,
  color TEXT DEFAULT '#2563eb',
  curso_academico TEXT DEFAULT '2024-2025',
  activa INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS horarios (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL, -- 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  asignatura TEXT NOT NULL,
  aula TEXT,
  tipo TEXT DEFAULT 'teoria',
  color TEXT
);

CREATE TABLE IF NOT EXISTS tareas (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  asignatura TEXT,
  fecha TEXT,
  fecha_entrega TEXT,
  prioridad TEXT DEFAULT 'media',
  estado TEXT DEFAULT 'pendiente',
  tipo TEXT DEFAULT 'tarea',
  ambito TEXT DEFAULT 'academico',
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  inicio TEXT NOT NULL,
  fin TEXT,
  categoria TEXT DEFAULT 'general',
  color TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS festivos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  nombre TEXT NOT NULL,
  ambito TEXT DEFAULT 'nacional'
);

CREATE TABLE IF NOT EXISTS proyectos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  color TEXT DEFAULT '#2563eb'
);

CREATE TABLE IF NOT EXISTS proyecto_tareas (
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  tarea_id TEXT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  PRIMARY KEY (proyecto_id, tarea_id)
);

CREATE TABLE IF NOT EXISTS objetivos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS objetivo_tareas (
  objetivo_id TEXT NOT NULL REFERENCES objetivos(id) ON DELETE CASCADE,
  tarea_id TEXT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  PRIMARY KEY (objetivo_id, tarea_id)
);

CREATE TABLE IF NOT EXISTS tipos_tarea (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  color TEXT,
  icono TEXT
);

CREATE TABLE IF NOT EXISTS jornadas_laborales (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  hora_entrada TEXT NOT NULL,
  hora_salida TEXT,
  pausa_minutos INTEGER DEFAULT 0,
  en_pausa INTEGER DEFAULT 0,
  inicio_pausa_actual TEXT,
  horas_trabajadas REAL DEFAULT 0,
  horas_extra REAL DEFAULT 0,
  estado TEXT DEFAULT 'activa',
  notas TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turnos_previstos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  horas_previstas REAL DEFAULT 0,
  tipo_turno TEXT DEFAULT 'ordinario',
  notas TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversaciones (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  asistente TEXT NOT NULL,
  titulo TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  remitente TEXT NOT NULL,
  contenido TEXT NOT NULL,
  propuesta TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memorias_asistentes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  asistente TEXT NOT NULL,
  categoria TEXT NOT NULL,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  compartida INTEGER DEFAULT 1,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS propuestas_acciones (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id) ON DELETE CASCADE,
  asistente TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  resumen TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  creado_en TEXT NOT NULL,
  resuelto_en TEXT
);

CREATE TABLE IF NOT EXISTS ajustes_usuario (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
