// Adaptador de compatibilidad: expone una API estilo `pg` (pool.query(text, params))
// pero habla con Oracle por debajo usando oracledb. Existe para no tener que
// reescribir a mano cada una de las ~100 llamadas a pool.query() del backend.
//
// Qué traduce automáticamente:
//   - Nombres de tabla sin prefijo (personal, datos_actividad, ...) -> Pdp_personal, Pdp_datos_actividad, ...
//   - Placeholders $1, $2... (Postgres) -> :1, :2... (Oracle), usando bind POR NOMBRE
//     (no por posición) para que un mismo $1 reusado varias veces en la misma
//     query (común en los OR de búsqueda) funcione igual que en Postgres.
//   - `columna ILIKE $n` -> `LOWER(columna) LIKE LOWER($n)` (Oracle no tiene ILIKE).
//   - `unaccent(lower(x)) ILIKE unaccent(lower($n))` -> se le quita el unaccent()
//     (Oracle no lo tiene) y queda como LOWER(x) LIKE LOWER($n). Pierde la
//     insensibilidad a tildes que sí tenía en Postgres.
//   - `LIMIT $n OFFSET $m` / `LIMIT n` -> sintaxis OFFSET/FETCH de Oracle.
//   - `RETURNING *` -> se expande a `RETURNING col1,col2,... INTO :out1,:out2,...`
//     usando el mapa TABLE_COLUMNS de abajo, y arma un row plano con los outBinds
//     para que el resultado se vea igual que en Postgres (rows[0].columna).
//
// Lo que NO traduce (queda a mano en index.js):
//   - Literales SQL `TRUE`/`FALSE` embebidos en el texto de la query (no son bind
//     params, hay que cambiarlos a 'Y'/'N' donde aparezcan).
//   - Lectura de columnas booleanas ('Y'/'N' vs true/false) al usarlas en JS.
//   - El bloque de creación de tablas/índices/constraints de Postgres
//     (crearTablas/crearIndices/crearConstraints) — el schema de Oracle ya
//     existe, se creó aparte con el script DDL.

const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

const TABLE_NAMES = [
  'alertas_personal',
  'audit_log',
  'certificado_carpeta_drive',
  'convenio_contraprestaciones',
  'convenio_contrap_resumen',
  'convenio_documentos',
  'convenios_especifico',
  'convenios_marco',
  'datos_actividad',
  'documentos',
  'hoja_ruta_pasos',
  'lista_participantes',
  'personal',
  'presupuesto_redes',
  'sindicatos',
  'solicitud_presupuesto',
  'solicitudes_revision',
  'usuarios_sistema',
];

// Columnas reales de cada tabla Oracle (mismo orden que el DDL), usadas para
// expandir "RETURNING *". Cada entrada es [nombre, tipo, maxSize?].
// maxSize es OBLIGATORIO para columnas STRING: si no se especifica, node-oracledb
// usa 200 bytes por defecto para outBinds STRING y trunca en silencio cualquier
// valor más largo. Para CLOB (datos, que puede traer JSON grande con la lista de
// participantes) se bindea como STRING con maxSize grande, no como CLOB — un
// outBind de tipo CLOB devuelve un objeto Lob/stream que rompe JSON.stringify.
const NUM = oracledb.NUMBER;
const DT = oracledb.DATE;
const TS = oracledb.DB_TYPE_TIMESTAMP;
const str = (size) => [oracledb.STRING, size];

const TABLE_COLUMNS = {
  personal: [
    ['id_personal', NUM], ['dni_ce', ...str(15)], ['cod_planilla', ...str(15)], ['apellidos', ...str(100)],
    ['nombre', ...str(100)], ['sexo', ...str(20)], ['red', ...str(100)], ['sub_programa', ...str(100)],
    ['servicio_area', ...str(100)], ['cargo', ...str(256)], ['regimen_laboral', ...str(256)], ['estado', ...str(20)],
  ],
  alertas_personal: [
    ['id', NUM], ['dni_ce', ...str(15)], ['codigo_act', ...str(256)], ['tipo', ...str(20)],
    ['nombre_completo', ...str(256)], ['red_anterior', ...str(100)], ['red_nueva', ...str(100)],
    ['detectado_at', TS], ['resuelto', ...str(1)], ['resuelto_at', TS], ['resuelto_por', ...str(256)],
    ['motivo', ...str(1000)],
  ],
  datos_actividad: [
    ['id', NUM], ['numero', NUM], ['codigo_act', ...str(256)], ['fecha_inicio', DT], ['fecha_fin', DT],
    ['mes_termino', ...str(100)], ['red_asistencial', ...str(100)], ['servicio_area', ...str(200)],
    ['nombre_actividad', ...str(256)], ['total_horas', NUM], ['horas_fuera_horario', NUM],
    ['frecuencia', ...str(100)], ['hora_inicio', ...str(8)], ['hora_termino', ...str(8)],
    ['modalidad', ...str(256)], ['publico', ...str(256)], ['nivel_evaluacion', ...str(256)],
    ['objetivo_estrategico', ...str(256)], ['total_participantes', NUM], ['ruc_proveedor', ...str(256)],
    ['nombre_proveedor', ...str(500)], ['sector_proveedor', ...str(256)], ['presupuesto_ejecutado', NUM],
    ['eje_tematico', ...str(256)],
  ],
  usuarios_sistema: [
    ['id', NUM], ['dni', ...str(15)], ['nombre', ...str(255)], ['password', ...str(256)], ['rol', ...str(120)],
    ['roles', ...str(56)], ['cargo', ...str(256)], ['estado', ...str(20)], ['sedes', ...str(130)],
    ['numero_plantilla', ...str(100)], ['email', ...str(256)], ['created_at', TS],
  ],
  presupuesto_redes: [
    ['red', ...str(100)], ['techo', NUM], ['anio', NUM],
  ],
  sindicatos: [
    ['id', NUM], ['nombre', ...str(150)], ['created_at', TS],
  ],
  audit_log: [
    ['id', NUM], ['tipo', ...str(100)], ['descripcion', ...str(256)], ['actor_nombre', ...str(256)],
    ['actor_rol', ...str(100)], ['referencia', ...str(256)], ['created_at', TS],
  ],
  certificado_carpeta_drive: [
    ['red', ...str(100)], ['drive_url', ...str(256)], ['actualizado_por', ...str(256)], ['actualizado_at', TS],
  ],
  lista_participantes: [
    ['id', NUM], ['codigo_act', ...str(256)], ['dni_ce', ...str(15)], ['cod_planilla', ...str(100)],
    ['apellidos', ...str(255)], ['nombre', ...str(255)], ['sexo', ...str(20)], ['red', ...str(100)],
    ['sub_programa', ...str(100)], ['servicio_area', ...str(256)], ['cargo', ...str(256)],
    ['regimen_laboral', ...str(256)], ['nota', NUM], ['condicion', ...str(20)],
    ['nota_subida_at', TS], ['fuera_de_plazo', ...str(1)],
  ],
  solicitudes_revision: [
    ['id', NUM], ['datos', ...str(1000000)], ['red_asistencial', ...str(100)], ['ejecutor_nombre', ...str(256)],
    ['ejecutor_dni', ...str(15)], ['estado', ...str(20)], ['motivo_rechazo', ...str(256)],
    ['correccion_pendiente', ...str(1)], ['seccion_correccion', ...str(256)],
    ['created_at', TS], ['reviewed_at', TS],
  ],
  documentos: [
    ['id', NUM], ['codigo_act', ...str(256)], ['nombre_archivo', ...str(256)], ['tipo_archivo', ...str(100)],
    ['ruta_storage', ...str(256)], ['tamano_kb', NUM], ['fecha_subida', TS],
  ],
  hoja_ruta_pasos: [
    ['id', NUM], ['actividad_id', NUM], ['paso_nombre', ...str(256)], ['completado', ...str(1)], ['completado_at', TS],
  ],
  solicitud_presupuesto: [
    ['id', NUM], ['tipo', ...str(256)], ['red', ...str(100)], ['red_destino', ...str(100)], ['monto', NUM],
    ['motivo', ...str(256)], ['estado', ...str(256)], ['solicitante_dni', ...str(15)],
    ['solicitante_nombre', ...str(256)], ['revisor_dni', ...str(15)], ['revisor_nombre', ...str(256)],
    ['respuesta', ...str(256)], ['created_at', TS], ['resolved_at', TS],
  ],
  convenios_marco: [
    ['id', NUM], ['universidad', ...str(256)], ['numero_convenio', ...str(100)], ['objeto', ...str(1000)],
    ['fecha_inicio', TS], ['fecha_fin', TS], ['estado', ...str(20)], ['created_by', ...str(256)], ['created_at', TS],
    ['tipo', ...str(20)], ['sede_principal', ...str(100)],
  ],
  convenios_especifico: [
    ['id', NUM], ['marco_id', NUM], ['nombre', ...str(500)], ['numero_convenio', ...str(100)],
    ['fecha_inicio', TS], ['fecha_fin', TS], ['estado', ...str(20)], ['created_by', ...str(256)], ['created_at', TS],
    ['facultades_carreras', ...str(500)], ['presupuesto_convenio', NUM], ['presupuesto_ejecutado', NUM],
  ],
  convenio_documentos: [
    ['id', NUM], ['convenio_tipo', ...str(20)], ['convenio_id', NUM], ['nombre_archivo', ...str(256)],
    ['tipo_archivo', ...str(100)], ['ruta_storage', ...str(256)], ['tamano_kb', NUM],
    ['subido_por', ...str(256)], ['fecha_subida', TS],
  ],
  convenio_contraprestaciones: [
    ['id', NUM], ['marco_id', NUM], ['facultad', ...str(256)], ['periodo', ...str(50)], ['plan_anio', ...str(50)],
    ['unidad_organica', ...str(256)], ['detalle', ...str(1000)], ['duracion', ...str(256)],
    ['num_beneficiarios', ...str(500)], ['grupo_ocupacional', ...str(256)], ['fecha_ejecucion', TS],
    ['valorizacion', NUM], ['observaciones', ...str(500)], ['created_by', ...str(256)], ['created_at', TS],
  ],
  convenio_contrap_resumen: [
    ['id', NUM], ['marco_id', NUM], ['tipo', ...str(20)], ['red', ...str(256)], ['anio', ...str(10)],
    ['monto', NUM], ['created_at', TS],
  ],
};

function prefixTables(sql) {
  let out = sql;
  for (const name of TABLE_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, 'gi');
    out = out.replace(re, `Pdp_${name}`);
  }
  return out;
}

// Oracle no tiene unaccent(); TRANSLATE con este mapeo de tildes/ñ es el
// equivalente real (no solo LOWER, que no quita tildes).
const SIN_TILDES = `TRANSLATE(%s, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')`;

function fixIlike(sql) {
  // unaccent(lower(x)) ILIKE unaccent(lower($n))  ->  comparación sin tildes real
  let out = sql.replace(
    /unaccent\(lower\(([^)]+)\)\)\s+ILIKE\s+unaccent\(lower\((\$\d+)\)\)/gi,
    (_, col, param) =>
      `LOWER(${SIN_TILDES.replace('%s', col)}) LIKE LOWER(${SIN_TILDES.replace('%s', param)})`,
  );
  // columna ILIKE $n  ->  LOWER(columna) LIKE LOWER($n)
  out = out.replace(/([\w".]+)\s+ILIKE\s+(\$\d+)/gi, 'LOWER($1) LIKE LOWER($2)');
  return out;
}

function fixNow(sql) {
  return sql.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');
}

function fixCasts(sql) {
  // Postgres ::tipo (ej. ::int, ::numeric(4,2)) no existe en Oracle. Se quita:
  // COUNT/SUM/AVG ya devuelven NUMBER en Oracle, no hace falta cast explícito.
  return sql.replace(/::[a-zA-Z]+(\(\d+(\s*,\s*\d+)?\))?/g, '');
}

function fixUnaliasedCount(sql) {
  // "SELECT COUNT(*) FROM tabla" o "SELECT COUNT(DISTINCT x) FROM tabla" sin
  // alias: Postgres nombra la columna "count" automáticamente; Oracle no. Se
  // fuerza el alias para que rows[0].count siga funcionando igual que antes.
  return sql.replace(/COUNT\([\s\S]*?\)\s+FROM\b/gi, (m) => `${m.replace(/\s+FROM$/i, '')} AS count FROM`);
}

function fixUnaliasedCoalesce(sql) {
  // Mismo problema que fixUnaliasedCount, pero para "SELECT COALESCE(...) FROM
  // tabla" sin alias — Postgres lo nombra "coalesce" automáticamente.
  return sql.replace(/COALESCE\([\s\S]*?\)\s+FROM\b/gi, (m) => `${m.replace(/\s+FROM$/i, '')} AS "coalesce" FROM`);
}

function fixFilterWhere(sql) {
  // COUNT(*) FILTER (WHERE cond) -> COUNT(CASE WHEN cond THEN 1 END) (Oracle no tiene FILTER)
  return sql.replace(/COUNT\(\*\)\s*FILTER\s*\(WHERE\s+([^)]+)\)/gi, 'COUNT(CASE WHEN $1 THEN 1 END)');
}

function fixEmptyStringComparison(sql) {
  // Oracle trata '' como NULL para VARCHAR2/CLOB: "columna != ''" nunca es
  // verdadero (columna != NULL es siempre desconocido), así que ese filtro
  // descarta TODAS las filas en silencio. Se traduce al equivalente real.
  let out = sql.replace(/([\w."]+)\s*(!=|<>)\s*''/g, '$1 IS NOT NULL');
  out = out.replace(/([\w."]+)\s*=\s*''/g, '$1 IS NULL');
  return out;
}

function fixLimitOffset(sql) {
  let out = sql;
  out = out.replace(
    /LIMIT\s+(\$\d+|\d+)\s+OFFSET\s+(\$\d+|\d+)/gi,
    'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY',
  );
  out = out.replace(/LIMIT\s+(\$\d+|\d+)(?!\s+OFFSET)/gi, 'FETCH FIRST $1 ROWS ONLY');
  return out;
}

function findTableForReturning(sql) {
  const m = sql.match(/(?:INSERT INTO|UPDATE)\s+Pdp_([a-z_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// Cubre tanto "RETURNING *" como "RETURNING col1, col2, ..." (esta última se usa
// para excluir columnas sensibles, ej. password). Oracle no acepta RETURNING sin
// INTO, así que ambas formas se expanden a "RETURNING col1,... INTO :out_col1,...".
function expandReturningStar(sql) {
  const m = sql.match(/RETURNING\s+(\*|[\w, ]+?)\s*$/i);
  if (!m) return { sql, outCols: null };
  const table = findTableForReturning(sql);
  const tableCols = table && TABLE_COLUMNS[table];
  if (!tableCols) {
    throw new Error(`RETURNING en una tabla no mapeada en TABLE_COLUMNS: ${table}`);
  }

  let cols;
  if (m[1].trim() === '*') {
    cols = tableCols;
  } else {
    const names = m[1].split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
    cols = names.map((name) => {
      const found = tableCols.find(([c]) => c === name);
      if (!found) throw new Error(`Columna "${name}" de RETURNING no encontrada en TABLE_COLUMNS.${table}`);
      return found;
    });
  }

  const returningList = cols.map(([c]) => c).join(', ');
  const intoList = cols.map(([c]) => `:out_${c}`).join(', ');
  const newSql = sql.replace(/RETURNING\s+(\*|[\w, ]+?)\s*$/i, `RETURNING ${returningList} INTO ${intoList}`);
  return { sql: newSql, outCols: cols };
}

function toDollarNumbers(sql) {
  // $1, $2... -> :1, :2... (nombre de bind numérico, válido en Oracle)
  return sql.replace(/\$(\d+)/g, ':$1');
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

function coerceValue(val) {
  // El frontend manda fechas como texto ISO (JSON no tiene tipo Date). oracledb
  // necesita un objeto Date real para bindear contra columnas DATE/TIMESTAMP;
  // si le pasamos el string tal cual, Oracle intenta convertirlo con el formato
  // de fecha de la sesión y puede fallar o interpretarlo mal.
  if (typeof val === 'string' && ISO_DATE_RE.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return val;
}

function buildBindObject(params, outCols) {
  const binds = {};
  params.forEach((val, i) => {
    binds[String(i + 1)] = val === undefined ? null : coerceValue(val);
  });
  if (outCols) {
    for (const [col, type, size] of outCols) {
      binds[`out_${col}`] = size
        ? { dir: oracledb.BIND_OUT, type, maxSize: size }
        : { dir: oracledb.BIND_OUT, type };
    }
  }
  return binds;
}

function lowerKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k.toLowerCase()] = row[k];
  return out;
}

let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    const connectString = `${process.env.DB_QA_HOST}:${process.env.DB_QA_PORT}/${process.env.DB_QA_SERVICE}`;
    poolPromise = oracledb.createPool({
      user: process.env.DB_QA_USER,
      password: process.env.DB_QA_PASSWORD,
      connectString,
      poolMin: 2,
      poolMax: 10,
    });
  }
  return poolPromise;
}

async function runOnConnection(conn, text, params, autoCommit) {
  let sql = prefixTables(text);
  sql = fixIlike(sql);
  sql = fixNow(sql);
  sql = fixCasts(sql);
  sql = fixFilterWhere(sql);
  sql = fixEmptyStringComparison(sql);
  sql = fixUnaliasedCount(sql);
  sql = fixUnaliasedCoalesce(sql);
  sql = fixLimitOffset(sql);
  const { sql: sqlWithReturning, outCols } = expandReturningStar(sql);
  sql = toDollarNumbers(sqlWithReturning);

  const binds = buildBindObject(params, outCols);
  const result = await conn.execute(sql, binds, { autoCommit, outFormat: oracledb.OUT_FORMAT_OBJECT });

  if (outCols) {
    const affected = result.rowsAffected || 0;
    if (affected === 0) return { rows: [], rowCount: 0 };
    const row = {};
    for (const [col] of outCols) {
      const v = result.outBinds[`out_${col}`];
      row[col] = Array.isArray(v) ? v[0] : v;
    }
    return { rows: [row], rowCount: affected };
  }

  const rows = (result.rows || []).map(lowerKeys);
  return { rows, rowCount: result.rowsAffected !== undefined ? result.rowsAffected : rows.length };
}

async function query(text, params = []) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    return await runOnConnection(conn, text, params, true);
  } catch (err) {
    err.message = `[oracle] ${err.message}\nSQL original: ${text}`;
    throw err;
  } finally {
    await conn.close();
  }
}

// Cliente estilo `pg` para transacciones explícitas (BEGIN/COMMIT/ROLLBACK).
// Postgres usa esas palabras como SQL; en Oracle una transacción empieza
// implícitamente con el primer statement y se cierra con connection.commit()/
// rollback() — por eso client.query('BEGIN') es un no-op y COMMIT/ROLLBACK se
// traducen a esos métodos en vez de mandarse como texto SQL a Oracle.
async function connect() {
  const pool = await getPool();
  const conn = await pool.getConnection();
  return {
    async query(text, params = []) {
      const cmd = typeof text === 'string' ? text.trim().toUpperCase() : '';
      if (cmd === 'BEGIN') return { rows: [], rowCount: 0 };
      if (cmd === 'COMMIT') {
        await conn.commit();
        return { rows: [], rowCount: 0 };
      }
      if (cmd === 'ROLLBACK') {
        await conn.rollback();
        return { rows: [], rowCount: 0 };
      }
      try {
        return await runOnConnection(conn, text, params, false);
      } catch (err) {
        err.message = `[oracle] ${err.message}\nSQL original: ${text}`;
        throw err;
      }
    },
    release() {
      return conn.close();
    },
  };
}

module.exports = { query, connect };
