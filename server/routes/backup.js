import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getDbPath, createVerifiedVacuumBackup, pruneOldBackups } from '../db.js';
import { listMigrationFiles, getExpectedSchemaVersion } from '../migrator.js';
import { getMadridDateString } from '../timezone.js';

const SENSITIVE_AJUSTE_PATTERN = /(api_key|apikey|secret|token|password|passwd|private_key|permitir_restauracion_backup)/i;

export function isSensitiveSettingKey(clave) {
  if (typeof clave !== 'string') return true;
  return SENSITIVE_AJUSTE_PATTERN.test(clave);
}

const REQUIRED_DOMAIN_TABLES = [
  'asignaturas',
  'horarios',
  'excepciones',
  'tareas',
  'eventos',
  'festivos',
  'proyectos',
  'proyecto_tareas',
  'objetivos',
  'objetivo_tareas',
  'tipos_tarea',
  'jornadas',
  'turnos',
  'conversaciones',
  'mensajes',
  'memorias',
  'propuestas_acciones',
  'semanas',
  'ajustes',
];

export function handleBackupRoutes(req, res, url, body, userId) {
  if (!userId) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' });
  }

  const pathname = url.pathname.replace(/^\/api\/backup/, '') || '/';
  const method = req.method;

  // ── GET /api/backup/export (JSON sanitizado sin contraseñas, sesiones, tokens ni claves API) ──
  if (pathname === '/export' && method === 'GET') {
    const asignaturas = db.prepare('SELECT * FROM asignaturas WHERE user_id = ?').all(userId);
    const horarios = db.prepare('SELECT * FROM horarios WHERE user_id = ?').all(userId);
    const excepciones = db.prepare('SELECT * FROM horario_excepciones WHERE user_id = ?').all(userId);
    const tareas = db.prepare('SELECT * FROM tareas WHERE user_id = ?').all(userId);
    const eventos = db.prepare('SELECT * FROM eventos WHERE user_id = ?').all(userId);
    const festivos = db.prepare('SELECT * FROM festivos').all();
    const proyectos = db.prepare('SELECT * FROM proyectos WHERE user_id = ?').all(userId);
    const proyecto_tareas = db.prepare(`
      SELECT pt.* FROM proyecto_tareas pt
      INNER JOIN proyectos p ON p.id = pt.proyecto_id
      WHERE p.user_id = ?
    `).all(userId);
    const objetivos = db.prepare('SELECT * FROM objetivos WHERE user_id = ?').all(userId);
    const objetivo_tareas = db.prepare(`
      SELECT ot.* FROM objetivo_tareas ot
      INNER JOIN objetivos o ON o.id = ot.objetivo_id
      WHERE o.user_id = ?
    `).all(userId);
    const tipos_tarea = db.prepare('SELECT * FROM tipos_tarea').all();
    const jornadas = db.prepare('SELECT * FROM jornadas_laborales WHERE user_id = ?').all(userId);
    const turnos = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ?').all(userId);
    const conversaciones = db.prepare('SELECT * FROM conversaciones WHERE user_id = ?').all(userId);
    const mensajes = db.prepare(`
      SELECT m.* FROM mensajes m
      INNER JOIN conversaciones c ON c.id = m.conversacion_id
      WHERE c.user_id = ?
    `).all(userId);
    const memorias = db.prepare('SELECT * FROM memorias_asistentes WHERE user_id = ?').all(userId);
    const propuestas_acciones = db.prepare('SELECT * FROM propuestas_acciones WHERE user_id = ?').all(userId);
    const semanas = db.prepare('SELECT * FROM semanas_cerradas WHERE user_id = ?').all(userId);

    // Excluir estrictamente claves API, secretos y flags internos
    const rawAjustes = db.prepare('SELECT clave, valor FROM ajustes_usuario').all();
    const ajustes = rawAjustes.filter(aj => !isSensitiveSettingKey(aj.clave));

    // NOTA DE SEGURIDAD: usuarios (password_hash) y sesiones (token/csrf_token) se excluyen SIEMPRE.
    const datos = {
      asignaturas,
      horarios,
      excepciones,
      tareas,
      eventos,
      festivos,
      proyectos,
      proyecto_tareas,
      objetivos,
      objetivo_tareas,
      tipos_tarea,
      jornadas,
      turnos,
      conversaciones,
      mensajes,
      memorias,
      propuestas_acciones,
      semanas,
      ajustes,
    };

    const datosJsonString = JSON.stringify(datos);
    const checksum = crypto.createHash('sha256').update(datosJsonString, 'utf8').digest('hex');

    const latestMigration = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
    const schema_version = latestMigration ? latestMigration.version : getExpectedSchemaVersion();

    const conteos = {};
    for (const key of REQUIRED_DOMAIN_TABLES) {
      conteos[key] = datos[key].length;
    }

    const exportPayload = {
      app: 'Agenda Sami',
      version: '2.2',
      schema_version,
      exportadoEn: new Date().toISOString(),
      checksum,
      conteos,
      datos,
    };

    const filename = `agenda_sami_backup_${getMadridDateString()}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, private',
    });
    return res.end(JSON.stringify(exportPayload, null, 2));
  }

  // ── GET /api/backup/sqlite (Copia Binaria Atómica EXCLUSIVAMENTE vía VACUUM INTO + verificación) ──
  if ((pathname === '/sqlite' || pathname === '/database') && method === 'GET') {
    // La copia binaria .sqlite contiene el archivo completo del motor: restringida a la cuenta principal (userId === 1).
    if (userId !== 1) {
      return sendJson(res, 403, {
        code: 'FORBIDDEN',
        error: 'La descarga binaria completa de SQLite está reservada a la cuenta administradora principal.',
      });
    }
    const currentDbPath = getDbPath();
    if (!currentDbPath || !fs.existsSync(currentDbPath)) {
      return sendJson(res, 404, { error: 'Base de datos no disponible.' });
    }

    const tmpDir = path.dirname(currentDbPath);
    const tmpBackupName = `vacuum_export_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.sqlite`;
    const tmpBackupPath = path.join(tmpDir, tmpBackupName);

    let backupInfo;
    try {
      // VACUUM INTO verificado es el ÚNICO procedimiento permitido. Jamás se copia el archivo en caliente.
      backupInfo = createVerifiedVacuumBackup(tmpBackupPath);
    } catch (vacuumErr) {
      console.error('[BACKUP] Error irrecuperable en VACUUM INTO:', vacuumErr.message);
      return sendJson(res, 500, {
        code: 'BACKUP_FAILED',
        error: 'No se pudo generar una copia binaria SQLite verificada. La base de datos original permanece intacta.',
      });
    }

    const cleanup = () => {
      try {
        if (fs.existsSync(tmpBackupPath)) fs.unlinkSync(tmpBackupPath);
      } catch (_err) { void _err; }
    };

    const filename = `agenda_sami_${getMadridDateString()}.sqlite`;
    const stream = fs.createReadStream(tmpBackupPath);

    stream.on('error', (streamErr) => {
      console.error('[BACKUP] Error leyendo stream de copia SQLite:', streamErr.message);
      cleanup();
      if (!res.headersSent) {
        sendJson(res, 500, { code: 'BACKUP_READ_ERROR', error: 'Error al leer el archivo de copia de seguridad.' });
      } else {
        res.destroy();
      }
    });

    res.writeHead(200, {
      'Content-Type': 'application/x-sqlite3',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(backupInfo.sizeBytes),
      'X-Backup-SHA256': backupInfo.sha256,
      'Cache-Control': 'no-store, private',
    });

    res.on('finish', cleanup);
    res.on('close', cleanup);
    stream.pipe(res);
    return;
  }

  // ── POST /api/backup/import (Restauración Atómica Verificada, sin secretos ni rutas filtradas) ──
  if (pathname === '/import' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { code: 'INVALID_BACKUP', error: 'Formato de importación inválido: cuerpo vacío.' });
    }

    // 1. Verificación obligatoria de aplicación
    if (body.app !== 'Agenda Sami') {
      return sendJson(res, 400, {
        code: 'INCOMPATIBLE_APP',
        error: 'Copia incompatible: el archivo no corresponde a Agenda Sami.',
      });
    }

    // 2. Verificación obligatoria de schema_version
    const knownMigrations = listMigrationFiles();
    const maxKnownVersion = getExpectedSchemaVersion();
    if (typeof body.schema_version !== 'string' || !body.schema_version.trim()) {
      return sendJson(res, 400, {
        code: 'MISSING_SCHEMA_VERSION',
        error: 'Copia inválida: falta schema_version.',
      });
    }
    if (knownMigrations.length > 0 && !knownMigrations.includes(body.schema_version)) {
      return sendJson(res, 400, {
        code: 'INCOMPATIBLE_SCHEMA_VERSION',
        error: `Versión de esquema incompatible (${body.schema_version}). Máxima soportada: ${maxKnownVersion}.`,
      });
    }

    // 3. Verificación criptográfica OBLIGATORIA de Checksum SHA-256
    if (typeof body.checksum !== 'string' || !body.checksum.trim() || !body.datos || typeof body.datos !== 'object') {
      return sendJson(res, 400, {
        code: 'MISSING_CHECKSUM',
        error: 'Copia inválida: falta checksum SHA-256 obligatorio o bloque datos.',
      });
    }

    const computedHash = crypto.createHash('sha256').update(JSON.stringify(body.datos), 'utf8').digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(body.checksum) || computedHash !== body.checksum.toLowerCase()) {
      return sendJson(res, 400, {
        code: 'CHECKSUM_MISMATCH',
        error: 'Fallo de integridad: el checksum SHA-256 no coincide. El archivo está corrupto o ha sido alterado.',
      });
    }

    const data = body.datos;

    // 4. Validación estricta de paridad completa de tablas de dominio (prohibidas restauraciones parciales)
    const missingTables = REQUIRED_DOMAIN_TABLES.filter(tbl => !Array.isArray(data[tbl]));
    if (missingTables.length > 0) {
      return sendJson(res, 400, {
        code: 'INCOMPLETE_BACKUP',
        error: `Copia incompleta: faltan las secciones [${missingTables.join(', ')}]. No se permiten restauraciones parciales.`,
      });
    }

    // 5. Instantánea preventiva obligatoria vía VACUUM INTO verificado + política de retención
    const currentDbPath = getDbPath();
    const backupDir = path.join(path.dirname(currentDbPath), 'backups_auto');
    const snapPath = path.join(backupDir, `pre_restore_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.sqlite`);

    try {
      createVerifiedVacuumBackup(snapPath);
      pruneOldBackups(backupDir, { prefix: 'pre_restore_' });
    } catch (snapErr) {
      console.error('[BACKUP] Fallo al crear snapshot preventivo:', snapErr.message);
      return sendJson(res, 500, {
        code: 'PRE_RESTORE_SNAPSHOT_FAILED',
        error: 'No se pudo crear la instantánea preventiva verificada. Restauración cancelada por seguridad.',
      });
    }

    // 6. Ejecutar restauración atómica completa (preservando usuarios y sesiones autenticadas actuales)
    try {
      db.exec('BEGIN TRANSACTION;');

      // Habilitar bypass controlado del trigger de inmutabilidad de semanas_cerradas
      db.prepare("INSERT OR REPLACE INTO ajustes_usuario (clave, valor) VALUES ('permitir_restauracion_backup', '1')").run();

      // Eliminar en orden respetando FK antes de reinsertar (tablas hijas primero)
      db.prepare('DELETE FROM proyecto_tareas WHERE proyecto_id IN (SELECT id FROM proyectos WHERE user_id = ?)').run(userId);
      db.prepare('DELETE FROM objetivo_tareas WHERE objetivo_id IN (SELECT id FROM objetivos WHERE user_id = ?)').run(userId);
      db.prepare('DELETE FROM mensajes WHERE conversacion_id IN (SELECT id FROM conversaciones WHERE user_id = ?)').run(userId);
      db.prepare('DELETE FROM horario_excepciones WHERE user_id = ?').run(userId);

      // A. Universidad y Calendario
      db.prepare('DELETE FROM asignaturas WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO asignaturas (id, user_id, nombre, abreviatura, codigo, creditos, curso, cuatrimestre, color, curso_academico, activa)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of data.asignaturas) {
          ins.run(a.id, userId, a.nombre, a.abreviatura || '', a.codigo || '', a.creditos || 6, a.curso || 1, a.cuatrimestre || 1, a.color || '#2563eb', a.curso_academico || a.cursoAcademico || '2024-2025', a.activa ?? 1);
        }
      }

      db.prepare('DELETE FROM horarios WHERE user_id = ?').run(userId);
      const ownedHorarioIds = new Set();
      {
        const ins = db.prepare(`
          INSERT INTO horarios (id, user_id, dia, hora_inicio, hora_fin, asignatura, aula, tipo, color, fecha_inicio, fecha_fin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const h of data.horarios) {
          ins.run(
            h.id, userId, h.dia, h.hora_inicio, h.hora_fin, h.asignatura,
            h.aula || '', h.tipo || 'teoria', h.color || '#2563eb',
            h.fecha_inicio || null, h.fecha_fin || null
          );
          ownedHorarioIds.add(h.id);
        }
      }

      {
        const ins = db.prepare(`
          INSERT INTO horario_excepciones (id, user_id, horario_id, fecha, cancelada, aula_alternativa, hora_inicio_alt, hora_fin_alt, motivo, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ex of data.excepciones) {
          if (!ownedHorarioIds.has(ex.horario_id)) {
            throw new Error('Referencia cruzada no autorizada en horario_excepciones.');
          }
          ins.run(ex.id, userId, ex.horario_id, ex.fecha, ex.cancelada ? 1 : 0, ex.aula_alternativa || null, ex.hora_inicio_alt || null, ex.hora_fin_alt || null, ex.motivo || '', ex.creado_en || new Date().toISOString());
        }
      }

      const ownedTareaIds = new Set();
      db.prepare('DELETE FROM tareas WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO tareas (id, user_id, titulo, descripcion, asignatura, fecha, fecha_entrega, prioridad, estado, tipo, ambito, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of data.tareas) {
          ins.run(
            t.id, userId, t.titulo || 'Tarea importada', t.descripcion || t.notas || '',
            t.asignatura || t.asignatura_id || null,
            t.fecha || t.fecha_entrega || t.fechaEntrega || null,
            t.fecha_entrega || t.fechaEntrega || t.fecha || null,
            t.prioridad || 'media', t.estado || 'pendiente', t.tipo || 'tarea',
            t.ambito || 'academico', t.creado_en || new Date().toISOString()
          );
          ownedTareaIds.add(t.id);
        }
      }

      db.prepare('DELETE FROM eventos WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO eventos (id, user_id, titulo, descripcion, inicio, fin, categoria, color, ubicacion, es_dia_completo, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of data.eventos) {
          ins.run(
            e.id, userId, e.titulo, e.descripcion || '', e.inicio, e.fin || null,
            e.categoria || 'general', e.color || '#4c6ef5', e.ubicacion || null,
            (e.es_dia_completo || e.dia_completo) ? 1 : 0, e.creado_en || new Date().toISOString()
          );
        }
      }

      // Solo la cuenta administradora principal (userId === 1) puede sobrescribir tablas globales compartidas
      const isPrimaryAdmin = userId === 1;
      if (isPrimaryAdmin) {
        db.prepare('DELETE FROM festivos').run();
        const ins = db.prepare('INSERT INTO festivos (id, fecha, nombre, ambito) VALUES (?, ?, ?, ?)');
        for (const f of data.festivos) {
          ins.run(f.id, f.fecha, f.nombre, f.ambito || 'nacional');
        }
      }

      // B. Proyectos, Objetivos y Tipos de tarea
      const ownedProyectoIds = new Set();
      db.prepare('DELETE FROM proyectos WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare('INSERT INTO proyectos (id, user_id, nombre, descripcion, color) VALUES (?, ?, ?, ?, ?)');
        for (const p of data.proyectos) {
          ins.run(p.id, userId, p.nombre, p.descripcion || '', p.color || '#2563eb');
          ownedProyectoIds.add(p.id);
        }
      }

      {
        const ins = db.prepare('INSERT OR IGNORE INTO proyecto_tareas (proyecto_id, tarea_id) VALUES (?, ?)');
        for (const pt of data.proyecto_tareas) {
          if (!ownedProyectoIds.has(pt.proyecto_id) || !ownedTareaIds.has(pt.tarea_id)) {
            throw new Error('Referencia cruzada no autorizada en proyecto_tareas.');
          }
          ins.run(pt.proyecto_id, pt.tarea_id);
        }
      }

      const ownedObjetivoIds = new Set();
      db.prepare('DELETE FROM objetivos WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare('INSERT INTO objetivos (id, user_id, titulo, descripcion) VALUES (?, ?, ?, ?)');
        for (const o of data.objetivos) {
          ins.run(o.id, userId, o.titulo, o.descripcion || '');
          ownedObjetivoIds.add(o.id);
        }
      }

      {
        const ins = db.prepare('INSERT OR IGNORE INTO objetivo_tareas (objetivo_id, tarea_id) VALUES (?, ?)');
        for (const ot of data.objetivo_tareas) {
          if (!ownedObjetivoIds.has(ot.objetivo_id) || !ownedTareaIds.has(ot.tarea_id)) {
            throw new Error('Referencia cruzada no autorizada en objetivo_tareas.');
          }
          ins.run(ot.objetivo_id, ot.tarea_id);
        }
      }

      if (isPrimaryAdmin) {
        db.prepare('DELETE FROM tipos_tarea').run();
        const ins = db.prepare('INSERT INTO tipos_tarea (id, nombre, color, icono) VALUES (?, ?, ?, ?)');
        for (const tt of data.tipos_tarea) {
          ins.run(tt.id, tt.nombre, tt.color || null, tt.icono || null);
        }
      }

      // C. Trabajo y Turnos
      db.prepare('DELETE FROM jornadas_laborales WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO jornadas_laborales (id, user_id, fecha, fecha_salida, hora_entrada, hora_salida, pausa_minutos, en_pausa, inicio_pausa_actual, horas_trabajadas, horas_extra, estado, notas, dst_eleccion, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const j of data.jornadas) {
          ins.run(
            j.id, userId, j.fecha, j.fecha_salida || null, j.hora_entrada, j.hora_salida || null,
            j.pausa_minutos || 0, j.en_pausa ? 1 : 0, j.inicio_pausa_actual || null,
            j.horas_trabajadas || 0, j.horas_extra || 0, j.estado || 'completada',
            j.notas || '', j.dst_eleccion || null, j.creado_en || new Date().toISOString()
          );
        }
      }

      db.prepare('DELETE FROM turnos_previstos WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO turnos_previstos (id, user_id, fecha, hora_inicio, hora_fin, horas_previstas, tipo_turno, notas, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const tu of data.turnos) {
          ins.run(tu.id, userId, tu.fecha, tu.hora_inicio, tu.hora_fin, tu.horas_previstas || 0, tu.tipo_turno || 'ordinario', tu.notas || '', tu.creado_en || new Date().toISOString());
        }
      }

      // D. Asistentes e IA
      const ownedConversacionIds = new Set();
      db.prepare('DELETE FROM conversaciones WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO conversaciones (id, user_id, asistente, titulo, creado_en, actualizado_en)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const c of data.conversaciones) {
          ins.run(c.id, userId, c.asistente, c.titulo || '', c.creado_en || new Date().toISOString(), c.actualizado_en || new Date().toISOString());
          ownedConversacionIds.add(c.id);
        }
      }

      {
        const ins = db.prepare(`
          INSERT INTO mensajes (id, conversacion_id, remitente, contenido, propuesta, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const m of data.mensajes) {
          if (!ownedConversacionIds.has(m.conversacion_id)) {
            throw new Error('Referencia cruzada no autorizada en mensajes.');
          }
          ins.run(m.id, m.conversacion_id, m.remitente, m.contenido, m.propuesta || null, m.timestamp);
        }
      }

      db.prepare('DELETE FROM memorias_asistentes WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO memorias_asistentes (id, user_id, asistente, categoria, clave, valor, compartida, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of data.memorias) {
          ins.run(m.id, userId, m.asistente, m.categoria, m.clave, m.valor, m.compartida ?? 1, m.creado_en || new Date().toISOString());
        }
      }

      db.prepare('DELETE FROM propuestas_acciones WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO propuestas_acciones (id, user_id, asistente, tipo, payload, resumen, estado, creado_en, resuelto_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const pa of data.propuestas_acciones) {
          ins.run(pa.id, userId, pa.asistente, pa.tipo, pa.payload, pa.resumen, pa.estado || 'pendiente', pa.creado_en || new Date().toISOString(), pa.resuelto_en || null);
        }
      }

      // E. Retrospectivas semanales inmutables
      db.prepare('DELETE FROM semanas_cerradas WHERE user_id = ?').run(userId);
      {
        const ins = db.prepare(`
          INSERT INTO semanas_cerradas (id, user_id, semana_inicio, semana_fin, cerrado_en, datos_json, notas_cierre, version, reabierto, reabierto_por, reabierto_en, historial_versiones)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of data.semanas) {
          ins.run(
            s.id, userId, s.semana_inicio, s.semana_fin, s.cerrado_en, s.datos_json,
            s.notas_cierre || '', s.version || 1, s.reabierto || 0,
            s.reabierto_por || null, s.reabierto_en || null, s.historial_versiones || '[]'
          );
        }
      }

      // F. Ajustes de usuario no sensibles (solo cuenta administradora principal)
      let importedAjustesCount = 0;
      if (isPrimaryAdmin) {
        const existingAjustes = db.prepare('SELECT clave FROM ajustes_usuario').all();
        for (const row of existingAjustes) {
          if (!isSensitiveSettingKey(row.clave)) {
            db.prepare('DELETE FROM ajustes_usuario WHERE clave = ?').run(row.clave);
          }
        }
        const stmtAjuste = db.prepare('INSERT OR REPLACE INTO ajustes_usuario (clave, valor) VALUES (?, ?)');
        for (const aj of data.ajustes) {
          if (aj && typeof aj.clave === 'string' && !isSensitiveSettingKey(aj.clave)) {
            stmtAjuste.run(aj.clave, String(aj.valor ?? ''));
            importedAjustesCount += 1;
          }
        }
      }

      // Eliminar el flag temporal de restauración
      db.prepare("DELETE FROM ajustes_usuario WHERE clave = 'permitir_restauracion_backup'").run();

      // 7. Verificación exhaustiva de integridad física y claves foráneas ANTES de COMMIT
      const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
      if (fkCheck.length > 0) {
        throw new Error(`Violación de claves foráneas detectada (${fkCheck.length} registros).`);
      }

      const intCheck = db.prepare('PRAGMA integrity_check;').all();
      if (intCheck.length === 0 || intCheck[0].integrity_check !== 'ok') {
        throw new Error('Fallo de integridad SQLite durante la restauración.');
      }

      db.exec('COMMIT;');

      return sendJson(res, 200, {
        success: true,
        message: 'Copia de seguridad restaurada con éxito e integridad referencial 100% verificada.',
        registrosRestaurados: {
          asignaturas: data.asignaturas.length,
          horarios: data.horarios.length,
          excepciones: data.excepciones.length,
          tareas: data.tareas.length,
          eventos: data.eventos.length,
          festivos: data.festivos.length,
          proyectos: data.proyectos.length,
          proyecto_tareas: data.proyecto_tareas.length,
          objetivos: data.objetivos.length,
          objetivo_tareas: data.objetivo_tareas.length,
          tipos_tarea: data.tipos_tarea.length,
          jornadas: data.jornadas.length,
          turnos: data.turnos.length,
          conversaciones: data.conversaciones.length,
          mensajes: data.mensajes.length,
          memorias: data.memorias.length,
          propuestas_acciones: data.propuestas_acciones.length,
          semanas: data.semanas.length,
          ajustes: importedAjustesCount,
        },
      });
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (_err) { void _err; }
      console.error('[BACKUP] Error durante la restauración:', err.message);
      return sendJson(res, 400, {
        code: 'RESTORE_FAILED',
        error: 'No se pudo completar la restauración de la copia de seguridad. La base de datos original se mantiene intacta.',
      });
    }
  }

  // ── GET /api/backup/verify (Verificación en vivo SIN filtrar rutas internas del servidor) ──
  if (pathname === '/verify' && method === 'GET') {
    const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
    const intCheck = db.prepare('PRAGMA integrity_check;').all();
    const latest = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
    const isOk = fkCheck.length === 0 && intCheck.length > 0 && intCheck[0].integrity_check === 'ok';

    return sendJson(res, 200, {
      ok: isOk,
      schema_version: latest ? latest.version : null,
      foreign_key_violations: fkCheck,
      integrity_check: intCheck,
    });
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada en /api/backup' });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
  });
  res.end(JSON.stringify(obj));
}
