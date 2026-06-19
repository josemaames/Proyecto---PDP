require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Supabase Storage (documentos)
// ──────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET_DOCUMENTOS = 'documentos';

const TIPOS_PERMITIDOS = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'image/jpeg': 'imagen',
  'image/png': 'imagen',
  'image/webp': 'imagen',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (límite del bucket "documentos" en Supabase)
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS[file.mimetype]) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido. Solo PDF, Word, Excel o imágenes (JPG, PNG, WEBP).'));
  },
});

// ──────────────────────────────────────────────
// Normaliza nombre corto de red al formato largo
// ──────────────────────────────────────────────
function expandirRed(r) {
  if (!r) return r;
  const u = r.trim().toUpperCase();
  if (u.startsWith('RA ')) return 'RED ASISTENCIAL ' + u.slice(3);
  if (u.startsWith('RP ')) return 'RED PRESTACIONAL ' + u.slice(3);
  return u;
}

// ──────────────────────────────────────────────
// Caché en memoria (evita queries repetidas)
// ──────────────────────────────────────────────
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos
const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
function invalidarCache() {
  cache.clear();
  console.log('✓ Caché invalidada');
}

// ──────────────────────────────────────────────
// Conexión PostgreSQL
// ──────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'pdp_essalud',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'admin123',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

console.log('Config DB ->', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  ssl: process.env.DB_SSL,
});

// ──────────────────────────────────────────────
// Email — Servicio de Mensajería Wiracocha
// ──────────────────────────────────────────────
const smtpPort = parseInt(process.env.SMTP_PORT) || 25;
const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@essalud.gob.pe';

const mailerTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'wiracocha.essalud',
  port: smtpPort,
  secure: smtpPort === 465,
  ...(process.env.SMTP_USER && {
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  }),
  tls: { rejectUnauthorized: false },
});

async function enviarCorreo(destinatarios, asunto, html) {
  const to = Array.isArray(destinatarios)
    ? destinatarios.filter(Boolean).join(',')
    : destinatarios;
  if (!to) return;
  try {
    await mailerTransport.sendMail({
      from: `"Sistema PDP EsSalud" <${smtpFrom}>`,
      to,
      subject: asunto,
      html,
    });
    console.log(`✓ Correo enviado a: ${to}`);
  } catch (err) {
    console.warn(`⚠ Error al enviar correo a ${to}:`, err.message);
  }
}

function htmlBase(color, titulo, cuerpo) {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:${color};padding:20px;text-align:center">
    <h2 style="color:#fff;margin:0">${titulo}</h2>
  </div>
  <div style="padding:24px;background:#f8fafc">
    ${cuerpo}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
      Mensaje automático del Sistema PDP — EsSalud. No responder a este correo.
    </p>
  </div>
</div>`;
}

pool
  .connect()
  .then(() => {
    console.log('✓ Conectado a PostgreSQL');
    crearTablas().then(crearIndices);
  })
  .catch((err) => console.error('✗ Error de conexión:', err));

async function crearTablas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_revision (
      id            SERIAL PRIMARY KEY,
      datos         JSONB        NOT NULL,
      red_asistencial TEXT,
      ejecutor_nombre TEXT,
      ejecutor_dni    TEXT,
      estado          TEXT        NOT NULL DEFAULT 'pendiente',
      motivo_rechazo  TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at     TIMESTAMPTZ
    )
  `);
  await pool.query(`
    UPDATE solicitudes_revision
    SET red_asistencial = datos->>'redAsistencial'
    WHERE red_asistencial IS NULL AND datos->>'redAsistencial' IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios_sistema (
      id               SERIAL PRIMARY KEY,
      dni              TEXT UNIQUE NOT NULL,
      nombre           TEXT NOT NULL,
      password         TEXT NOT NULL,
      rol              TEXT NOT NULL,
      cargo            TEXT DEFAULT '',
      estado           TEXT NOT NULL DEFAULT 'Activo',
      sedes            TEXT DEFAULT '',
      numero_plantilla TEXT DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`);

  const seed = [
    ['90642735', 'José Manuel Ames Anapán',       'admin123',    'Administrador', 'Analista PDP',               'Activo',   '',                              'PL-0001', 'jose.ames@essalud.gob.pe'],
    ['70435255', 'Víctor Gabriel Acero Garay',     'admin123',    'Administrador', 'Analista PDP',               'Activo',   '',                              'PL-0002', 'victor.acero@essalud.gob.pe'],
    ['73456264', 'Fernando David Campos Quiroz',   'admin123',    'Administrador', 'Especialista PDP',           'Activo',   '',                              'PL-0003', 'fernando.campos@essalud.gob.pe'],
    ['45611148', 'Sthywen Javier Muñoz Ruiz',      'admin123',    'Administrador', 'Especialista PDP',           'Activo',   '',                              'PL-0004', 'sthywen.munoz@essalud.gob.pe'],
    ['11111111', 'María Torres Quispe',             'sector123',   'Sectorista',    'Sectorista Red Arequipa',    'Activo',   'RA AREQUIPA',                   'PL-0005', 'maria.torres@essalud.gob.pe'],
    ['33333333', 'Ana Sofía Paredes Quispe',        'sector123',   'Sectorista',    'Sectorista Redes Sur-Centro','Activo',   'RA CUSCO,RA AREQUIPA,RA PIURA', 'PL-0007', 'ana.paredes@essalud.gob.pe'],
    ['48562134', 'María Elena Torres Salazar',      'sector123',   'Sectorista',    'Sectorista Red Rebagliati',  'Activo',   'RP REBAGLIATI',                 '',        'maria.elena.torres@essalud.gob.pe'],
    ['71234589', 'Luis Alberto Sánchez Rojas',      'sector123',   'Sectorista',    'Sectorista Red Almenara',    'Activo',   'RP ALMENARA',                   '',        'luis.sanchez@essalud.gob.pe'],
    ['22222222', 'Ricardo Mendoza García',          'ejecutor123', 'Ejecutor',      'Ejecutor Red Rebagliati',    'Activo',   'RP REBAGLIATI',                 'PL-0006', 'ricardo.mendoza@essalud.gob.pe'],
    ['44444444', 'Carlos Alberto Huanca Torres',    'ejecutor123', 'Ejecutor',      'Ejecutor Red Arequipa',      'Activo',   'RA AREQUIPA',                   'PL-0008', 'carlos.huanca@essalud.gob.pe'],
    ['59874123', 'Ana Lucía Rodríguez Vargas',      'ejecutor123', 'Ejecutor',      'Ejecutor de Capacitación',   'Activo',   '',                              '',        'ana.rodriguez@essalud.gob.pe'],
    ['74125896', 'Carmen Rosa Delgado Silva',       'ejecutor123', 'Ejecutor',      'Ejecutor Administrativo',    'Inactivo', '',                              '',        'carmen.delgado@essalud.gob.pe'],
  ];
  for (const u of seed) {
    await pool.query(
      `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla,email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (dni) DO UPDATE SET email = EXCLUDED.email WHERE usuarios_sistema.email = ''`,
      u
    );
  }
  console.log('✓ Usuarios verificados');

  // ── Techo presupuestal por red ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS presupuesto_redes (
      red    TEXT PRIMARY KEY,
      techo  NUMERIC(14,2) NOT NULL,
      anio   INT NOT NULL DEFAULT 2025
    )
  `);
  const techos = [
    ['Red Asistencial Amazonas',           30000.00],
    ['Red Asistencial Ancash',            158640.00],
    ['Red Asistencial Apurímac',           66000.00],
    ['Red Asistencial Arequipa',          120000.00],
    ['Red Asistencial Ayacucho',           65000.00],
    ['Red Asistencial Cajamarca',          80000.00],
    ['Red Asistencial Cusco',             160000.00],
    ['Red Asistencial Huancavelica',       32000.00],
    ['Red Asistencial Huánuco',            74000.00],
    ['Red Asistencial Huaraz',             40000.00],
    ['Red Asistencial Ica',               175000.00],
    ['Red Asistencial Jaen',               32000.00],
    ['Red Asistencial Juliaca',            65760.00],
    ['Red Asistencial Junin',              54000.00],
    ['Red Asistencial La Libertad',       114960.00],
    ['Red Asistencial Loreto',             60000.00],
    ['Red Asistencial Madre de Dios',      60000.00],
    ['Red Asistencial Moquegua',           91020.00],
    ['Red Asistencial Moyobamba',          62000.00],
    ['Red Asistencial Pasco',              72000.00],
    ['Red Asistencial Piura',              45000.00],
    ['Red Asistencial Puno',             122524.00],
    ['Red Asistencial Tacna',              90000.00],
    ['Red Asistencial Tarapoto',           58000.00],
    ['Red Asistencial Tumbes',             36130.00],
    ['Red Asistencial Ucayali',            45000.00],
    ['Red Prestacional Almenara',         240000.00],
    ['Red Asistencial Lambayeque',        140000.00],
    ['Red Prestacional Rebagliati',       240000.00],
    ['Red Prestacional Sabogal',          195000.00],
    ['Centro Nacional de Salud Renal',     72000.00],
    ['Instituto Nacional Cardiovascular',  52000.00],
  ];
  for (const [red, techo] of techos) {
    await pool.query(
      `INSERT INTO presupuesto_redes (red, techo) VALUES ($1, $2)
       ON CONFLICT (red) DO NOTHING`,
      [red, techo]
    );
  }
  console.log('✓ Presupuesto redes verificado');

  // ── Documentos adjuntos ─────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documentos (
      id              SERIAL PRIMARY KEY,
      codigo_act      TEXT NOT NULL,
      nombre_archivo  TEXT NOT NULL,
      tipo_archivo    TEXT,
      ruta_storage    TEXT NOT NULL,
      tamano_kb       INT,
      fecha_subida    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla documentos verificada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           SERIAL PRIMARY KEY,
      tipo         TEXT NOT NULL,
      descripcion  TEXT NOT NULL,
      actor_nombre TEXT,
      actor_rol    TEXT,
      referencia   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`);
  console.log('✓ Tabla audit_log verificada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hoja_ruta_pasos (
      id           SERIAL PRIMARY KEY,
      actividad_id INT NOT NULL REFERENCES datos_actividad(id) ON DELETE CASCADE,
      paso_nombre  TEXT NOT NULL,
      completado   BOOLEAN NOT NULL DEFAULT FALSE,
      completado_at TIMESTAMPTZ,
      UNIQUE(actividad_id, paso_nombre)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hoja_ruta_actividad ON hoja_ruta_pasos(actividad_id)`);
  console.log('✓ Tabla hoja_ruta_pasos verificada');

  // Columnas de corrección en solicitudes_revision
  await pool.query(`ALTER TABLE solicitudes_revision ADD COLUMN IF NOT EXISTS correccion_pendiente BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE solicitudes_revision ADD COLUMN IF NOT EXISTS seccion_correccion TEXT`);
  console.log('✓ Columnas correccion_pendiente verificadas');

  console.log('✓ Tablas verificadas');
}

async function logEvento(tipo, descripcion, actor_nombre = null, actor_rol = null, referencia = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (tipo, descripcion, actor_nombre, actor_rol, referencia) VALUES ($1,$2,$3,$4,$5)`,
      [tipo, descripcion, actor_nombre, actor_rol, referencia]
    );
  } catch (e) {
    console.error('logEvento error:', e.message);
  }
}

async function crearIndices() {
  const indices = [
    // Filtros por red (RBAC y resumen-redes)
    `CREATE INDEX IF NOT EXISTS idx_actividad_red ON datos_actividad(red_asistencial)`,
    `CREATE INDEX IF NOT EXISTS idx_personal_red ON personal(red)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_red ON lista_participantes(red)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_codigo ON lista_participantes(codigo_act)`,

    // Covering index para /api/resumen-redes: permite index-only scan sin tocar la tabla
    `CREATE INDEX IF NOT EXISTS idx_actividad_resumen_cov
       ON datos_actividad(red_asistencial)
       INCLUDE (total_horas, total_participantes, presupuesto_ejecutado)`,

    // GROUP BY del dashboard
    `CREATE INDEX IF NOT EXISTS idx_actividad_modalidad ON datos_actividad(modalidad)`,
    `CREATE INDEX IF NOT EXISTS idx_actividad_mes ON datos_actividad(mes_termino)`,
    `CREATE INDEX IF NOT EXISTS idx_actividad_servicio ON datos_actividad(servicio_area)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_sexo ON lista_participantes(sexo)`,

    // Unicidad de codigo_act (necesaria para ON CONFLICT en INSERT)
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_actividad_codigo_act ON datos_actividad(codigo_act)`,

    // Ordenación eficiente de actividades (paginación sin filtro de red — admin)
    `CREATE INDEX IF NOT EXISTS idx_actividad_numero ON datos_actividad(numero NULLS LAST)`,

    // Búsqueda por DNI en personal
    `CREATE INDEX IF NOT EXISTS idx_personal_dni ON personal(dni_ce)`,

    // Extensiones de texto
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE EXTENSION IF NOT EXISTS unaccent`,
    `CREATE INDEX IF NOT EXISTS idx_actividad_nombre_trgm ON datos_actividad USING gin(nombre_actividad gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_personal_apellidos_trgm ON personal USING gin(apellidos gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_apellidos_trgm ON lista_participantes USING gin(apellidos gin_trgm_ops)`,
  ];

  for (const sql of indices) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn('⚠ Índice omitido:', err.message.split('\n')[0]);
    }
  }
  console.log('✓ Índices verificados');
}

// ══════════════════════════════════════════════
// PARTICIPANTES
// GET  /api/participantes?q=&codigo_act=&page=1&limit=50
// POST /api/participantes
// DEL  /api/participantes/:id
// ══════════════════════════════════════════════
app.get('/api/participantes', async (req, res) => {
  try {
    const { q = '', codigo_act = '', red = '', regimen_laboral = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [],
      params = [],
      idx = 1;

    if (q) {
      conditions.push(
        `(apellidos ILIKE $${idx} OR nombre ILIKE $${idx} OR dni_ce ILIKE $${idx} OR cargo ILIKE $${idx} OR codigo_act ILIKE $${idx})`,
      );
      params.push(`%${q}%`);
      idx++;
    }
    if (codigo_act) {
      conditions.push(`codigo_act ILIKE $${idx}`);
      params.push(`%${codigo_act}%`);
      idx++;
    }
    if (red) {
      // Para cada red buscamos tanto el formato largo ("RED PRESTACIONAL REBAGLIATI")
      // como el formato corto ("RP REBAGLIATI") para cubrir ambas variantes en la tabla
      const variants = red.split(',').flatMap((r) => {
        const largo = expandirRed(r.trim());
        const corto = r.trim().toUpperCase();
        return largo !== corto ? [largo, corto] : [largo];
      }).filter(Boolean);

      const redConds = variants.map((_, i) => {
        params.push(`%${variants[i]}%`);
        return `red ILIKE $${idx + i}`;
      });
      idx += variants.length;
      conditions.push(`(${redConds.join(' OR ')})`);
    }
    if (regimen_laboral) {
      conditions.push(`regimen_laboral ILIKE $${idx}`);
      params.push(`%${regimen_laboral}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM lista_participantes ${where} ORDER BY apellidos, nombre LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset],
    );
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) FROM lista_participantes ${where}`,
      params,
    );
    res.json({ data: rows, total: parseInt(c[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/participantes', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `INSERT INTO lista_participantes
         (codigo_act, dni_ce, cod_planilla, apellidos, nombre,
          sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        f.codigoAct || f.codigo_act,
        f.dniCe || f.dni_ce,
        f.codPlanilla || f.cod_planilla,
        f.apellidos,
        f.nombres || f.nombre,
        f.sexo,
        expandirRed(f.redAsist || f.red || ''),
        f.subPrograma || f.sub_programa,
        f.servicioArea || f.servicio_area,
        f.cargo,
        f.regimenLaboral || f.regimen_laboral,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/participantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lista_participantes WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ACTIVIDADES
// GET  /api/actividades?q=&red=&modalidad=&page=1&limit=50
// POST /api/actividades
// PUT  /api/actividades/:id
// DEL  /api/actividades/:id
// ══════════════════════════════════════════════
app.get('/api/actividades', async (req, res) => {
  try {
    const { q = '', red = '', modalidad = '', eje_tematico = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const cacheKey = `actividades:${q}:${red}:${modalidad}:${eje_tematico}:${page}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let conditions = [],
      params = [],
      idx = 1;

    if (q) {
      conditions.push(
        `(nombre_actividad ILIKE $${idx} OR codigo_act ILIKE $${idx} OR red_asistencial ILIKE $${idx})`,
      );
      params.push(`%${q}%`);
      idx++;
    }
    if (red) {
      const redList = red
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      if (redList.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${redList[0]}%`);
        idx++;
      } else {
        const orClauses = redList.map((_, i) => `red_asistencial ILIKE $${idx + i}`).join(' OR ');
        conditions.push(`(${orClauses})`);
        params.push(...redList.map((r) => `%${r}%`));
        idx += redList.length;
      }
    }
    if (modalidad) {
      conditions.push(`modalidad ILIKE $${idx}`);
      params.push(`%${modalidad}%`);
      idx++;
    }
    if (eje_tematico) {
      conditions.push(`unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${idx}))`);
      params.push(`%${eje_tematico}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, numero, codigo_act, nombre_actividad, red_asistencial, modalidad,
                fecha_inicio, fecha_fin, mes_termino, total_horas, horas_fuera_horario,
                frecuencia, hora_inicio, hora_termino, publico, nivel_evaluacion,
                objetivo_estrategico, total_participantes, ruc_proveedor,
                nombre_proveedor, sector_proveedor, presupuesto_ejecutado,
                eje_tematico, servicio_area
         FROM datos_actividad ${where} ORDER BY numero NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit), offset],
      ),
      pool.query(`SELECT COUNT(*) FROM datos_actividad ${where}`, params),
    ]);

    const result = { data: dataRes.rows, total: parseInt(countRes.rows[0].count) };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/actividades', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `INSERT INTO datos_actividad
         (codigo_act, fecha_inicio, fecha_fin, mes_termino, red_asistencial,
          servicio_area, nombre_actividad, total_horas, horas_fuera_horario,
          frecuencia, hora_inicio, hora_termino, modalidad, publico,
          nivel_evaluacion, objetivo_estrategico, total_participantes,
          ruc_proveedor, nombre_proveedor, sector_proveedor,
          presupuesto_ejecutado, eje_tematico)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        f.codigo_act,
        f.fecha_inicio || null,
        f.fecha_fin || null,
        f.mes_termino,
        f.red_asistencial,
        f.servicio_area,
        f.nombre_actividad,
        f.total_horas || null,
        f.horas_fuera_horario || null,
        f.frecuencia,
        f.hora_inicio || null,
        f.hora_termino || null,
        f.modalidad,
        f.publico,
        f.nivel_evaluacion,
        f.objetivo_estrategico,
        f.total_participantes || null,
        f.ruc_proveedor,
        f.nombre_proveedor,
        f.sector_proveedor,
        f.presupuesto_ejecutado || null,
        f.eje_tematico,
      ],
    );
    invalidarCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/actividades/:id', async (req, res) => {
  try {
    const { actor_nombre, actor_rol, ...f } = req.body;
    const { rows } = await pool.query(
      `UPDATE datos_actividad SET
         codigo_act=$1, fecha_inicio=$2, fecha_fin=$3, mes_termino=$4,
         red_asistencial=$5, servicio_area=$6, nombre_actividad=$7,
         total_horas=$8, modalidad=$9, publico=$10,
         total_participantes=$11, presupuesto_ejecutado=$12, eje_tematico=$13
       WHERE id=$14 RETURNING *`,
      [
        f.codigo_act,
        f.fecha_inicio || null,
        f.fecha_fin || null,
        f.mes_termino,
        f.red_asistencial,
        f.servicio_area,
        f.nombre_actividad,
        f.total_horas || null,
        f.modalidad,
        f.publico,
        f.total_participantes || null,
        f.presupuesto_ejecutado || null,
        f.eje_tematico,
        parseInt(req.params.id),
      ],
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    invalidarCache();
    logEvento('capacitacion_editada', `${actor_nombre || 'Usuario'} editó la capacitación "${f.nombre_actividad}" [${f.codigo_act}]`, actor_nombre, actor_rol || 'Sectorista', f.codigo_act);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/actividades/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM datos_actividad WHERE id=$1', [parseInt(req.params.id)]);
    invalidarCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// HOJA DE RUTA — pasos por capacitación
// GET  /api/hoja-ruta/:actividad_id/pasos
// PUT  /api/hoja-ruta/:actividad_id/pasos/:paso   body: { completado, actor_nombre }
// ══════════════════════════════════════════════

const PASOS_HOJA_RUTA = [
  'Separación SGD',
  'Elaboración TDR',
  'Revisión TDR',
  'Logística',
  'Convocatoria',
  'Ejecución',
  'Finalizado',
];

app.get('/api/hoja-ruta/:actividad_id/pasos', async (req, res) => {
  try {
    const actId = parseInt(req.params.actividad_id);
    const { rows } = await pool.query(
      `SELECT paso_nombre, completado, completado_at FROM hoja_ruta_pasos WHERE actividad_id=$1`,
      [actId]
    );
    const map = {};
    rows.forEach((r) => (map[r.paso_nombre] = { completado: r.completado, completado_at: r.completado_at }));
    const result = PASOS_HOJA_RUTA.map((p) => ({
      paso: p,
      completado: map[p]?.completado || false,
      completado_at: map[p]?.completado_at || null,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hoja-ruta/:actividad_id/pasos/:paso', async (req, res) => {
  try {
    const actId = parseInt(req.params.actividad_id);
    const paso = decodeURIComponent(req.params.paso);
    const { completado, actor_nombre = 'Administrador' } = req.body;

    if (!PASOS_HOJA_RUTA.includes(paso)) {
      return res.status(400).json({ error: 'Paso inválido' });
    }

    await pool.query(
      `INSERT INTO hoja_ruta_pasos (actividad_id, paso_nombre, completado, completado_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (actividad_id, paso_nombre) DO UPDATE
         SET completado=$3, completado_at=$4`,
      [actId, paso, completado, completado ? new Date() : null]
    );

    // Notificar sectorista de la red si se marca como completado
    if (completado) {
      const { rows: act } = await pool.query(
        `SELECT nombre_actividad, codigo_act, red_asistencial FROM datos_actividad WHERE id=$1`,
        [actId]
      );
      if (act.length) {
        const { nombre_actividad, codigo_act, red_asistencial } = act[0];
        const { rows: sectoristas } = await pool.query(
          `SELECT email, nombre FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
          [`%${red_asistencial}%`]
        );
        if (sectoristas.length) {
          const emails = sectoristas.map((s) => s.email);
          const html = htmlBase('#005baa', '📋 Actualización de Hoja de Ruta PDP',
            `<p>El administrador <strong>${actor_nombre}</strong> marcó el paso <strong>"${paso}"</strong> como completado en la siguiente capacitación:</p>
             <table style="width:100%;border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:8px;color:#6b7280">Capacitación:</td><td style="padding:8px;font-weight:bold">${nombre_actividad}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Código:</td><td style="padding:8px">${codigo_act}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Red asistencial:</td><td style="padding:8px">${red_asistencial}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Paso completado:</td><td style="padding:8px;color:#16a34a;font-weight:bold">✅ ${paso}</td></tr>
             </table>
             <p>Ingrese al Sistema PDP para ver el estado actualizado de la hoja de ruta.</p>`
          );
          enviarCorreo(emails, `✅ Paso "${paso}" completado — ${nombre_actividad}`, html);
        }
        logEvento('hoja_ruta', `${actor_nombre} marcó paso "${paso}" como ${completado ? 'completado' : 'pendiente'} en capacitación "${nombre_actividad}" [${codigo_act}]`, actor_nombre, 'Administrador', codigo_act);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// PERSONAL (base de datos ESSALUD)
// GET /api/personal-essalud?q=&page=1&limit=50
// ══════════════════════════════════════════════
app.get('/api/personal-essalud', async (req, res) => {
  try {
    const { q = '', red = '', regimen_laboral = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [],
      params = [],
      idx = 1;

    const search = `%${q || ''}%`;
    conditions.push(
      `(apellidos ILIKE $${idx} OR nombre ILIKE $${idx} OR dni_ce ILIKE $${idx} OR cargo ILIKE $${idx})`,
    );
    params.push(search);
    idx++;

    if (red) {
      // Expand abbreviations: RA XXXXX → RED ASISTENCIAL XXXXX, RP XXXXX → RED PRESTACIONAL XXXXX
      const expandirRed = (r) => {
        const u = r.trim().toUpperCase();
        if (u.startsWith('RA ')) return 'RED ASISTENCIAL ' + u.slice(3);
        if (u.startsWith('RP ')) return 'RED PRESTACIONAL ' + u.slice(3);
        return u;
      };
      const redes = red
        .split(',')
        .map((r) => expandirRed(r))
        .filter(Boolean);
      if (redes.length === 1) {
        conditions.push(`red ILIKE $${idx}`);
        params.push(`%${redes[0]}%`);
        idx++;
      } else if (redes.length > 1) {
        const redConds = redes.map((r, i) => {
          params.push(`%${r}%`);
          return `red ILIKE $${idx + i}`;
        });
        idx += redes.length;
        conditions.push(`(${redConds.join(' OR ')})`);
      }
    }
    if (regimen_laboral) {
      conditions.push(`regimen_laboral ILIKE $${idx}`);
      params.push(`%${regimen_laboral}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await pool.query(
      `SELECT * FROM personal ${where} ORDER BY apellidos, nombre LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset],
    );
    const { rows: c } = await pool.query(`SELECT COUNT(*) FROM personal ${where}`, params);
    res.json({ data: rows, total: parseInt(c[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar personal por DNI (para autocompletar al agregar participante)
app.get('/api/personal-essalud/dni/:dni', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM personal WHERE dni_ce = $1 LIMIT 1`, [
      req.params.dni,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'DNI no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar personal por código de planilla (para autocompletar)
app.get('/api/personal-essalud/planilla/:cod', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM personal WHERE cod_planilla = $1 LIMIT 1`, [
      req.params.cod,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Código no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// RESUMEN POR RED ASISTENCIAL (agrupado en BD)
// GET /api/resumen-redes?redes=Red1,Red2
// ══════════════════════════════════════════════
app.get('/api/resumen-redes', async (req, res) => {
  try {
    const { redes = '', eje_tematico = '', anio = '' } = req.query;
    const cacheKey = `resumen-redes:${redes}:${eje_tematico}:${anio}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let conditions = [], params = [], idx = 1;

    if (redes) {
      const lista = redes.split(',').map((r) => r.trim()).filter(Boolean);
      if (lista.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${lista[0]}%`);
        idx++;
      } else if (lista.length > 1) {
        const conds = lista.map((r) => { params.push(`%${r}%`); return `red_asistencial ILIKE $${idx++}`; });
        conditions.push(`(${conds.join(' OR ')})`);
      }
    }
    if (eje_tematico) {
      conditions.push(`unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${idx}))`);
      params.push(`%${eje_tematico}%`);
      idx++;
    }
    if (anio) {
      conditions.push(`EXTRACT(YEAR FROM COALESCE(fecha_fin, fecha_inicio)) = $${idx}`);
      params.push(parseInt(anio));
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         COALESCE(red_asistencial, 'Sin Red')      AS red,
         COUNT(*)::int                              AS capacitaciones,
         COALESCE(SUM(total_horas), 0)::numeric     AS horas,
         COALESCE(SUM(total_participantes), 0)::int AS participantes,
         COALESCE(SUM(presupuesto_ejecutado), 0)::numeric AS presupuesto
       FROM datos_actividad
       ${where}
       GROUP BY COALESCE(red_asistencial, 'Sin Red')
       ORDER BY capacitaciones DESC`,
      params,
    );
    setCache(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ESTADÍSTICAS
// ══════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const { red = '', eje_tematico = '', anio = '' } = req.query;
    const cacheKey = `stats:${red}:${eje_tematico}:${anio}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let actConds = [], actParams = [], idx = 1;
    let partConds = [], partParams = [];

    if (red) {
      actConds.push(`red_asistencial ILIKE $${idx}`);
      actParams.push(`%${red}%`);
      partConds.push(`red ILIKE $1`);
      partParams.push(`%${red}%`);
      idx++;
    }
    if (eje_tematico) {
      actConds.push(`unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${idx}))`);
      actParams.push(`%${eje_tematico}%`);
      idx++;
    }
    if (anio) {
      actConds.push(`EXTRACT(YEAR FROM COALESCE(fecha_fin, fecha_inicio)) = $${idx}`);
      actParams.push(parseInt(anio));
      idx++;
    }

    const actWhere = actConds.length ? `WHERE ${actConds.join(' AND ')}` : '';
    const partWhere = partConds.length ? `WHERE ${partConds.join(' AND ')}` : '';

    const queries = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM datos_actividad ${actWhere}`, actParams),
      pool.query(`SELECT COUNT(*) FROM lista_participantes ${partWhere}`, partParams),
      pool.query(`SELECT COALESCE(SUM(presupuesto_ejecutado),0) FROM datos_actividad ${actWhere}`, actParams),
      pool.query(`SELECT COUNT(DISTINCT red_asistencial) FROM datos_actividad ${actWhere}`, actParams),
      pool.query(`SELECT modalidad, COUNT(*) as total FROM datos_actividad ${actWhere} GROUP BY modalidad ORDER BY total DESC`, actParams),
    ]);

    const result = {
      actividades: parseInt(queries[0].rows[0].count),
      participantes: parseInt(queries[1].rows[0].count),
      presupuesto_total: parseFloat(queries[2].rows[0].coalesce),
      redes: parseInt(queries[3].rows[0].count),
      por_modalidad: queries[4].rows,
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    const red = req.query.red || '';
    const ejeTematico = req.query.eje_tematico || '';
    const anio = req.query.anio || '';

    const actConds = [], actParams = [];
    if (red) { actConds.push(`red_asistencial ILIKE $${actParams.length + 1}`); actParams.push(`%${red}%`); }
    if (ejeTematico) { actConds.push(`unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${actParams.length + 1}))`); actParams.push(`%${ejeTematico}%`); }
    if (anio) { actConds.push(`EXTRACT(YEAR FROM COALESCE(fecha_fin, fecha_inicio)) = $${actParams.length + 1}`); actParams.push(parseInt(anio)); }
    const whereActividad = actConds.length ? `WHERE ${actConds.join(' AND ')}` : '';

    const redBusqueda = red.replace(/^(RA|RP)\s+/i, '').trim();
    const whereParticipante = redBusqueda ? `WHERE red ILIKE $1` : '';
    const participanteParams = redBusqueda ? [`%${redBusqueda}%`] : [];

    const [
      personal,
      actividades,
      participantes,
      presupuesto,
      actividadesMes,
      participantesSexo,
      participantesRed,
      modalidad,
      topServicios,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) total FROM personal'),
      pool.query('SELECT COUNT(*) total FROM datos_actividad'),
      pool.query('SELECT COUNT(*) total FROM lista_participantes'),
      pool.query(`SELECT COALESCE(SUM(presupuesto_ejecutado),0) total FROM datos_actividad`),
      pool.query(`SELECT mes_termino, COUNT(*) total FROM datos_actividad ${whereActividad} GROUP BY mes_termino ORDER BY total DESC`, actParams),
      pool.query(`SELECT red, sexo, COUNT(*) total FROM lista_participantes ${whereParticipante} GROUP BY red, sexo`, participanteParams),
      pool.query(`SELECT red, COUNT(*) total FROM lista_participantes GROUP BY red ORDER BY total DESC LIMIT 10`),
      pool.query(`SELECT modalidad, COUNT(*) total FROM datos_actividad ${whereActividad} GROUP BY modalidad`, actParams),
      pool.query(`SELECT servicio_area, COUNT(*) total FROM datos_actividad GROUP BY servicio_area ORDER BY total DESC LIMIT 10`),
    ]);

    res.json({
      resumen: {
        personal: Number(personal.rows[0].total),
        actividades: Number(actividades.rows[0].total),
        participantes: Number(participantes.rows[0].total),
        presupuesto: Number(presupuesto.rows[0].total),
      },

      actividadesMes: actividadesMes.rows,
      participantesSexo: participantesSexo.rows,
      participantesRed: participantesRed.rows,
      modalidad: modalidad.rows,
      topServicios: topServicios.rows,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ══════════════════════════════════════════════
// SOLICITUDES DE REVISIÓN
// POST /api/solicitudes           — ejecutor envía formulario
// GET  /api/solicitudes?red=xxx   — sectorista consulta pendientes de su red
// GET  /api/solicitudes/mis-envios?dni=xxx — ejecutor consulta sus envíos
// PUT  /api/solicitudes/:id/revisar — sectorista aprueba o deniega
// ══════════════════════════════════════════════

app.post('/api/solicitudes', async (req, res) => {
  try {
    const { datos, ejecutor_nombre, ejecutor_dni } = req.body;
    const red = datos.redAsistencial || datos.red_asistencial || null;
    const { rows } = await pool.query(
      `INSERT INTO solicitudes_revision (datos, red_asistencial, ejecutor_nombre, ejecutor_dni)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [JSON.stringify(datos), red, ejecutor_nombre || null, ejecutor_dni || null]
    );
    res.status(201).json(rows[0]);

    const actNombre = datos.nombreActividad || datos.nombre_actividad || 'Sin nombre';
    logEvento(
      'solicitud_enviada',
      `${ejecutor_nombre || 'Ejecutor'} envió solicitud de capacitación "${actNombre}" — ${red || 'Sin red'}, a la espera de revisión del sectorista`,
      ejecutor_nombre,
      'Ejecutor',
      actNombre
    );

    // Notificar a sectoristas de la red (sin bloquear la respuesta)
    if (red) {
      const { rows: sectoristas } = await pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
        [`%${red}%`]
      );
      if (sectoristas.length) {
        const emails = sectoristas.map((s) => s.email);
        const html = htmlBase(
          '#005baa',
          '📋 Nueva solicitud de revisión',
          `<p>El ejecutor <strong>${ejecutor_nombre || 'Sin nombre'}</strong> ha enviado una nueva solicitud de capacitación.</p>
           <table style="width:100%;border-collapse:collapse;margin:16px 0">
             <tr><td style="padding:8px;color:#6b7280">Red Asistencial:</td><td style="padding:8px;font-weight:bold">${red}</td></tr>
             <tr><td style="padding:8px;color:#6b7280">Actividad:</td><td style="padding:8px;font-weight:bold">${datos.nombreActividad || datos.nombre_actividad || '-'}</td></tr>
             <tr><td style="padding:8px;color:#6b7280">DNI Ejecutor:</td><td style="padding:8px">${ejecutor_dni || '-'}</td></tr>
           </table>
           <p>Ingrese al <strong>Sistema PDP</strong> para revisar esta solicitud.</p>`
        );
        enviarCorreo(emails, '📋 Nueva solicitud de revisión — Sistema PDP', html);
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/solicitudes/mis-envios', async (req, res) => {
  try {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: 'dni requerido' });
    const { rows } = await pool.query(
      `SELECT id, datos, red_asistencial, estado, motivo_rechazo, created_at, reviewed_at,
              correccion_pendiente, seccion_correccion
       FROM solicitudes_revision WHERE ejecutor_dni = $1 ORDER BY created_at DESC LIMIT 50`,
      [dni]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/solicitudes', async (req, res) => {
  try {
    const { red, estado = 'pendiente' } = req.query;
    let conditions = [`estado = $1`];
    let params = [estado];
    let idx = 2;
    if (red) {
      const redes = String(red).split(',').map(r => r.trim()).filter(Boolean);
      if (redes.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${redes[0]}%`);
      } else {
        const orClauses = redes.map((_, i) => `red_asistencial ILIKE $${idx + i}`).join(' OR ');
        conditions.push(`(${orClauses})`);
        params.push(...redes.map(r => `%${r}%`));
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, datos, red_asistencial, ejecutor_nombre, ejecutor_dni, estado, motivo_rechazo, created_at
       FROM solicitudes_revision ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/solicitudes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM solicitudes_revision WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/solicitudes/:id/revisar', async (req, res) => {
  try {
    const { estado, motivo_rechazo, revisor_nombre, revisor_rol } = req.body;
    if (!['aprobado', 'observado', 'excluido', 'denegado'].includes(estado)) {
      return res.status(400).json({ error: 'estado no válido' });
    }
    const { rows } = await pool.query(
      `UPDATE solicitudes_revision
       SET estado=$1, motivo_rechazo=$2, reviewed_at=NOW()
       WHERE id=$3 RETURNING *`,
      [estado, motivo_rechazo || null, parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });

    if (estado === 'aprobado') {
      const f = rows[0].datos;
      await pool.query(
        `INSERT INTO datos_actividad
           (codigo_act, fecha_inicio, fecha_fin, mes_termino, red_asistencial,
            servicio_area, nombre_actividad, total_horas, horas_fuera_horario,
            frecuencia, hora_inicio, hora_termino, modalidad, publico,
            nivel_evaluacion, objetivo_estrategico, total_participantes,
            ruc_proveedor, nombre_proveedor, sector_proveedor,
            presupuesto_ejecutado, eje_tematico)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (codigo_act) DO UPDATE SET
           fecha_inicio=$2, fecha_fin=$3, mes_termino=$4, red_asistencial=$5,
           servicio_area=$6, nombre_actividad=$7, total_horas=$8, horas_fuera_horario=$9,
           frecuencia=$10, hora_inicio=$11, hora_termino=$12, modalidad=$13, publico=$14,
           nivel_evaluacion=$15, objetivo_estrategico=$16, total_participantes=$17,
           ruc_proveedor=$18, nombre_proveedor=$19, sector_proveedor=$20,
           presupuesto_ejecutado=$21, eje_tematico=$22`,
        [
          f.codigoAct, f.fechaInicio || null, f.fechaFin || null, f.mesTermino,
          f.redAsistencial, f.servicioArea, f.nombreActividad,
          f.totalHoras || null, f.horasFueraHorario || null, f.frecuencia,
          f.horaInicio || null, f.horaTermino || null, f.modalidad, f.publico,
          f.nivelEvaluacion, f.objetivoEstrategico || null, f.totalParticipantes || null,
          f.rucProveedor, f.nombreProveedor, f.sectorProveedor,
          f.presupuestoEjecutado || null, f.ejeTematico,
        ]
      );
      // Limpiar participantes previos del mismo código antes de reinsertar (evita duplicados en re-aprobación)
      if (f.codigoAct) {
        await pool.query('DELETE FROM lista_participantes WHERE codigo_act=$1', [f.codigoAct]);
      }
      // Insertar participantes en lista_participantes
      const participantes = Array.isArray(f.participantesDetalle) ? f.participantesDetalle : [];
      for (const p of participantes) {
        const redNorm = expandirRed(p.red || f.redAsistencial || '');
        await pool.query(
          `INSERT INTO lista_participantes
             (codigo_act, dni_ce, cod_planilla, apellidos, nombre,
              sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            p.codigo_act || f.codigoAct || null,
            p.dni_ce || null,
            p.cod_planilla || null,
            p.apellidos || null,
            p.nombre || null,
            p.sexo || null,
            redNorm || null,
            p.sub_programa || null,
            p.servicio_area || null,
            p.cargo || null,
            p.regimen_laboral || null,
          ]
        );
      }

      invalidarCache();
    }

    // Notificar al ejecutor y a los administradores
    const solicitud = rows[0];
    const esAprobado  = estado === 'aprobado';
    const esObservado = estado === 'observado';
    const esExcluido  = estado === 'excluido';
    const actividadNombre = solicitud.datos?.nombreActividad || solicitud.datos?.nombre_actividad || '-';
    const red = solicitud.red_asistencial || '-';

    // Configuración visual por estado
    const cfg = esAprobado
      ? { color: '#16a34a', icono: '✅', etiqueta: 'APROBADA' }
      : esObservado
        ? { color: '#d97706', icono: '🔍', etiqueta: 'OBSERVADA' }
        : { color: '#dc2626', icono: '🚫', etiqueta: 'EXCLUIDA' };

    const [{ rows: ejecutores }, { rows: admins }] = await Promise.all([
      pool.query(
        `SELECT email, nombre FROM usuarios_sistema WHERE dni=$1 AND email != ''`,
        [solicitud.ejecutor_dni]
      ),
      pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Administrador' AND estado='Activo' AND email != ''`
      ),
    ]);

    if (ejecutores.length) {
      const filaMotivo = esObservado
        ? `<tr><td style="padding:8px;color:#6b7280">Observación:</td><td style="padding:8px;color:#d97706">${motivo_rechazo || 'Sin detalle'}</td></tr>`
        : '';
      const htmlEjecutor = htmlBase(
        cfg.color,
        `${cfg.icono} Solicitud ${cfg.etiqueta}`,
        `<p>Estimado/a <strong>${ejecutores[0].nombre}</strong>,</p>
         <p>Su solicitud ha sido <strong style="color:${cfg.color}">${cfg.etiqueta}</strong>${esObservado ? '. Por favor revise la observación y corrija su solicitud.' : esExcluido ? '. Ha sido excluida del proceso.' : ' y registrada en el sistema.'}.</p>
         <table style="width:100%;border-collapse:collapse;margin:16px 0">
           <tr><td style="padding:8px;color:#6b7280">Actividad:</td><td style="padding:8px;font-weight:bold">${actividadNombre}</td></tr>
           <tr><td style="padding:8px;color:#6b7280">Red:</td><td style="padding:8px">${red}</td></tr>
           ${filaMotivo}
         </table>`
      );
      enviarCorreo(
        ejecutores[0].email,
        `${cfg.icono} Solicitud ${cfg.etiqueta.toLowerCase()} — Sistema PDP`,
        htmlEjecutor
      );
    }

    if (admins.length) {
      const htmlAdmin = htmlBase(
        '#005baa',
        `${cfg.icono} Solicitud ${estado.toUpperCase()}`,
        `<p>Un sectorista tomó una decisión sobre una solicitud de capacitación.</p>
         <table style="width:100%;border-collapse:collapse;margin:16px 0">
           <tr><td style="padding:8px;color:#6b7280">Estado:</td><td style="padding:8px;font-weight:bold;color:${cfg.color}">${cfg.etiqueta}</td></tr>
           <tr><td style="padding:8px;color:#6b7280">Ejecutor:</td><td style="padding:8px">${solicitud.ejecutor_nombre || '-'}</td></tr>
           <tr><td style="padding:8px;color:#6b7280">Actividad:</td><td style="padding:8px">${actividadNombre}</td></tr>
           <tr><td style="padding:8px;color:#6b7280">Red:</td><td style="padding:8px">${red}</td></tr>
           ${esObservado ? `<tr><td style="padding:8px;color:#6b7280">Observación:</td><td style="padding:8px;color:#d97706">${motivo_rechazo || '-'}</td></tr>` : ''}
         </table>`
      );
      enviarCorreo(
        admins.map((a) => a.email),
        `${cfg.icono} Solicitud ${estado} — Sistema PDP`,
        htmlAdmin
      );
    }

    // Audit log de la revisión
    const actor = revisor_nombre || 'Sectorista';
    const ejecutorNombre = solicitud.ejecutor_nombre || 'el ejecutor';
    const logDesc = esAprobado
      ? `${actor} aprobó la solicitud "${actividadNombre}" de ${ejecutorNombre} — Red: ${red}`
      : esObservado
        ? `${actor} observó la solicitud "${actividadNombre}" de ${ejecutorNombre}${motivo_rechazo ? ` — Observación: ${motivo_rechazo}` : ''}`
        : `${actor} excluyó la solicitud "${actividadNombre}" de ${ejecutorNombre} — Red: ${red}`;
    logEvento(`solicitud_${estado}`, logDesc, actor, revisor_rol || 'Sectorista', actividadNombre);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/solicitudes/:id/solicitar-edicion  — sectorista pide al ejecutor que corrija
app.post('/api/solicitudes/:id/solicitar-edicion', async (req, res) => {
  try {
    const { seccion, mensaje, sectorista_nombre } = req.body;
    const id = parseInt(req.params.id);

    if (!['formulario', 'participantes'].includes(seccion)) {
      return res.status(400).json({ error: 'seccion inválida' });
    }

    const { rows } = await pool.query(
      `SELECT s.*, u.email AS ejecutor_email, u.nombre AS ejecutor_nombre_real
       FROM solicitudes_revision s
       LEFT JOIN usuarios_sistema u ON u.dni = s.ejecutor_dni
       WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const sol = rows[0];
    const email = sol.ejecutor_email;
    const ejecutorNombre = sol.ejecutor_nombre || sol.ejecutor_nombre_real || 'Ejecutor';
    const actNombre = sol.datos?.nombreActividad || sol.datos?.nombre_actividad || 'Sin nombre';
    const seccionLabel = seccion === 'formulario' ? 'Formulario de Capacitación' : 'Registro de Participantes';

    // Marcar corrección pendiente en la solicitud
    await pool.query(
      `UPDATE solicitudes_revision SET correccion_pendiente=TRUE, seccion_correccion=$1 WHERE id=$2`,
      [seccion, id]
    );

    if (email) {
      const htmlEjecutor = htmlBase(
        '#d97706',
        `📝 Se requiere corrección — ${seccionLabel}`,
        `<p>Estimado/a <strong>${ejecutorNombre}</strong>,</p>
         <p>El sectorista <strong>${sectorista_nombre || 'Sectorista'}</strong> necesita que corrijas la siguiente sección de tu solicitud:</p>
         <p style="font-size:20px;font-weight:bold;color:#005baa;text-align:center;margin:20px 0">📋 ${seccionLabel}</p>
         <table style="width:100%;border-collapse:collapse;margin:16px 0">
           <tr><td style="padding:8px;color:#6b7280">Capacitación:</td><td style="padding:8px;font-weight:bold">${actNombre}</td></tr>
           <tr><td style="padding:8px;color:#6b7280">Red:</td><td style="padding:8px">${sol.red_asistencial || '-'}</td></tr>
           ${mensaje ? `<tr><td style="padding:8px;color:#6b7280">Indicaciones:</td><td style="padding:8px;color:#d97706">${mensaje}</td></tr>` : ''}
         </table>
         <p>Ingresa al <strong>Sistema PDP</strong> y realiza las correcciones en la sección indicada antes de reenviar tu solicitud.</p>`
      );
      enviarCorreo(email, `📝 Corrección requerida: ${seccionLabel} — Sistema PDP`, htmlEjecutor);
    }

    logEvento(
      'solicitud_correccion',
      `${sectorista_nombre || 'Sectorista'} solicitó corrección en "${seccionLabel}" de la capacitación "${actNombre}" al ejecutor ${ejecutorNombre}`,
      sectorista_nombre,
      'Sectorista',
      actNombre
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/solicitudes/:id/reenviar — ejecutor actualiza y limpia corrección pendiente
app.put('/api/solicitudes/:id/reenviar', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { datos, ejecutor_nombre } = req.body;

    const { rows } = await pool.query(
      `UPDATE solicitudes_revision
       SET datos=$1, estado='pendiente', correccion_pendiente=FALSE, seccion_correccion=NULL, reviewed_at=NULL, motivo_rechazo=NULL
       WHERE id=$2 RETURNING *`,
      [JSON.stringify(datos), id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const actNombre = datos.nombreActividad || datos.nombre_actividad || 'Sin nombre';
    const codigoAct = datos.codigoAct || datos.codigo_act || null;

    // Si ya existe en datos_actividad, actualizar directamente para que el Excel quede al día
    if (codigoAct) {
      await pool.query(
        `UPDATE datos_actividad SET
           fecha_inicio=$2, fecha_fin=$3, mes_termino=$4, red_asistencial=$5,
           servicio_area=$6, nombre_actividad=$7, total_horas=$8, horas_fuera_horario=$9,
           frecuencia=$10, hora_inicio=$11, hora_termino=$12, modalidad=$13, publico=$14,
           nivel_evaluacion=$15, objetivo_estrategico=$16, total_participantes=$17,
           ruc_proveedor=$18, nombre_proveedor=$19, sector_proveedor=$20,
           presupuesto_ejecutado=$21, eje_tematico=$22
         WHERE codigo_act=$1`,
        [
          codigoAct,
          datos.fechaInicio || null, datos.fechaFin || null, datos.mesTermino || null,
          datos.redAsistencial || null, datos.servicioArea || null, datos.nombreActividad || null,
          datos.totalHoras || null, datos.horasFueraHorario || null, datos.frecuencia || null,
          datos.horaInicio || null, datos.horaTermino || null, datos.modalidad || null,
          datos.publico || null, datos.nivelEvaluacion || null, datos.objetivoEstrategico || null,
          (Array.isArray(datos.participantesDetalle) ? datos.participantesDetalle.length : null) || datos.totalParticipantes || null, datos.rucProveedor || null,
          datos.nombreProveedor || null, datos.sectorProveedor || null,
          datos.presupuestoEjecutado || null, datos.ejeTematico || null,
        ]
      );
      invalidarCache();
    }

    logEvento('solicitud_reenviada', `${ejecutor_nombre || 'Ejecutor'} reenvió la solicitud corregida "${actNombre}"`, ejecutor_nombre, 'Ejecutor', actNombre);

    // Notificar sectoristas de la red
    const red = rows[0].red_asistencial;
    if (red) {
      const { rows: sectoristas } = await pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
        [`%${red}%`]
      );
      if (sectoristas.length) {
        const html = htmlBase('#16a34a', '✅ Solicitud corregida y reenviada',
          `<p>El ejecutor <strong>${ejecutor_nombre || 'Sin nombre'}</strong> ha reenviado una solicitud corregida.</p>
           <table style="width:100%;border-collapse:collapse;margin:16px 0">
             <tr><td style="padding:8px;color:#6b7280">Actividad:</td><td style="padding:8px;font-weight:bold">${actNombre}</td></tr>
             <tr><td style="padding:8px;color:#6b7280">Red:</td><td style="padding:8px">${red}</td></tr>
           </table>
           <p>Ingrese al Sistema PDP para revisar la solicitud actualizada.</p>`
        );
        enviarCorreo(sectoristas.map(s => s.email), '✅ Solicitud corregida — Sistema PDP', html);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// USUARIOS DEL SISTEMA
// POST /api/auth/login
// GET  /api/usuarios
// POST /api/usuarios
// PUT  /api/usuarios/:dni
// ══════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { dni, password } = req.body;
    const { rows } = await pool.query(
      'SELECT * FROM usuarios_sistema WHERE dni=$1 AND password=$2',
      [dni, password]
    );
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const u = rows[0];
    if (u.estado === 'Inactivo') return res.status(403).json({ error: 'Cuenta desactivada. Contacte al administrador.' });
    res.json({
      id: u.id,
      dni: u.dni,
      nombre: u.nombre,
      rol: u.rol,
      cargo: u.cargo,
      estado: u.estado,
      sedes: u.sedes ? u.sedes.split(',').filter(Boolean) : [],
      numeroPlantilla: u.numero_plantilla,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla,email FROM usuarios_sistema ORDER BY rol,nombre'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const { dni, nombre, password, rol, cargo, estado, sedes, numero_plantilla, email, actor_nombre, actor_rol } = req.body;
    if (!dni || !nombre || !password || !rol) return res.status(400).json({ error: 'dni, nombre, password y rol son requeridos' });
    const { rows } = await pool.query(
      `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla,email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla,email`,
      [dni, nombre, password, rol, cargo || '', estado || 'Activo', sedes || '', numero_plantilla || '', email || '']
    );
    logEvento('usuario_creado', `${actor_nombre || 'Administrador'} creó el usuario ${nombre} (${rol})`, actor_nombre, actor_rol || 'Administrador', nombre);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese DNI.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:dni', async (req, res) => {
  try {
    const { actor_nombre, actor_rol } = req.body;
    const campos = ['nombre','password','rol','cargo','estado','sedes','numero_plantilla','email'];
    const sets = [], params = [];
    let idx = 1;
    for (const campo of campos) {
      if (req.body[campo] !== undefined && !(campo === 'password' && !req.body[campo])) {
        sets.push(`${campo}=$${idx++}`);
        params.push(req.body[campo]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos a actualizar' });
    params.push(req.params.dni);
    const { rows } = await pool.query(
      `UPDATE usuarios_sistema SET ${sets.join(',')} WHERE dni=$${idx} RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla,email`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    logEvento('usuario_editado', `${actor_nombre || 'Administrador'} editó el usuario ${rows[0].nombre} (${rows[0].rol})`, actor_nombre, actor_rol || 'Administrador', rows[0].nombre);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// AUDIT LOG
// ──────────────────────────────────────────────
app.get('/api/audit-log', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const { rows } = await pool.query(
      `SELECT id, tipo, descripcion, actor_nombre, actor_rol, referencia, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Techo presupuestal por red
// ──────────────────────────────────────────────
app.get('/api/presupuesto-redes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT red, techo, anio FROM presupuesto_redes ORDER BY red'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/presupuesto-redes/:red', async (req, res) => {
  try {
    const red = decodeURIComponent(req.params.red);
    const { techo, anio } = req.body;
    if (!techo) return res.status(400).json({ error: 'techo requerido' });
    const { rows } = await pool.query(
      `INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1, $2, $3)
       ON CONFLICT (red) DO UPDATE SET techo = EXCLUDED.techo, anio = EXCLUDED.anio
       RETURNING *`,
      [red, techo, anio || 2025]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// SUNAT — consulta por RUC
// ──────────────────────────────────────────────
app.get('/api/sunat/ruc', async (req, res) => {
  const { numero } = req.query;
  if (!numero || String(numero).length !== 11) {
    return res.status(400).json({ error: 'RUC debe tener 11 dígitos' });
  }

  try {
    const token = process.env.DECOLECTA_TOKEN || process.env.APIS_NET_PE_TOKEN || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`https://api.decolecta.com/v1/sunat/ruc?numero=${numero}`, {
      headers,
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'No se encontró información para este RUC' });
  }
});

// ══════════════════════════════════════════════
// DOCUMENTOS (PDF / Word / Excel)
// POST   /api/documentos            (subir archivo)
// GET    /api/documentos?codigo_act=
// GET    /api/documentos/:id/descargar
// DELETE /api/documentos/:id
// ══════════════════════════════════════════════

app.post('/api/documentos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { codigo_act } = req.body;
    if (!codigo_act) return res.status(400).json({ error: 'codigo_act requerido' });

    const tipo = TIPOS_PERMITIDOS[req.file.mimetype];
    const nombreSeguro = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ruta = `${codigo_act}/${Date.now()}_${nombreSeguro}`;

    const { error: errSubida } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype });

    if (errSubida) throw errSubida;

    const { rows } = await pool.query(
      `INSERT INTO documentos (codigo_act, nombre_archivo, tipo_archivo, ruta_storage, tamano_kb)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [codigo_act, req.file.originalname, tipo, ruta, Math.round(req.file.size / 1024)]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documentos', async (req, res) => {
  try {
    const { codigo_act } = req.query;
    const where = codigo_act ? 'WHERE codigo_act = $1' : '';
    const params = codigo_act ? [codigo_act] : [];
    const { rows } = await pool.query(
      `SELECT * FROM documentos ${where} ORDER BY fecha_subida DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documentos/:id/descargar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documentos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

    const { data, error } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(rows[0].ruta_storage, 60);

    if (error) throw error;
    res.json({ url: data.signedUrl, nombre_archivo: rows[0].nombre_archivo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/documentos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documentos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([rows[0].ruta_storage]);
    await pool.query('DELETE FROM documentos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INICIAR SERVIDOR
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend PDP corriendo en http://localhost:${PORT}`);
});
