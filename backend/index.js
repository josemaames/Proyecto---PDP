require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

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
});

pool
  .connect()
  .then(() => {
    console.log('✓ Conectado a PostgreSQL');
    crearTablas().then(crearIndices);
  })
  .catch((err) => console.error('✗ Error de conexión:', err.message));

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

  const { rows: cnt } = await pool.query('SELECT COUNT(*) FROM usuarios_sistema');
  if (parseInt(cnt[0].count) === 0) {
    const seed = [
      ['90642735', 'José Manuel Ames Anapán',       'admin123',    'Administrador', 'Analista PDP',               'Activo',   '',                              'PL-0001'],
      ['70435255', 'Víctor Gabriel Acero Garay',     'admin123',    'Administrador', 'Analista PDP',               'Activo',   '',                              'PL-0002'],
      ['73456264', 'Fernando David Campos Quiroz',   'admin123',    'Administrador', 'Especialista PDP',           'Activo',   '',                              'PL-0003'],
      ['45611148', 'Sthywen Javier Muñoz Ruiz',      'admin123',    'Administrador', 'Especialista PDP',           'Activo',   '',                              'PL-0004'],
      ['11111111', 'María Torres Quispe',             'sector123',   'Sectorista',    'Sectorista Red Arequipa',    'Activo',   'RA AREQUIPA',                   'PL-0005'],
      ['33333333', 'Ana Sofía Paredes Quispe',        'sector123',   'Sectorista',    'Sectorista Redes Sur-Centro','Activo',   'RA CUSCO,RA AREQUIPA,RA PIURA', 'PL-0007'],
      ['48562134', 'María Elena Torres Salazar',      'sector123',   'Sectorista',    'Sectorista Red Rebagliati',  'Activo',   'RP REBAGLIATI',                 ''],
      ['71234589', 'Luis Alberto Sánchez Rojas',      'sector123',   'Sectorista',    'Sectorista Red Almenara',    'Activo',   'RP ALMENARA',                   ''],
      ['22222222', 'Ricardo Mendoza García',          'ejecutor123', 'Ejecutor',      'Ejecutor Red Rebagliati',    'Activo',   'RP REBAGLIATI',                 'PL-0006'],
      ['44444444', 'Carlos Alberto Huanca Torres',    'ejecutor123', 'Ejecutor',      'Ejecutor Red Arequipa',      'Activo',   'RA AREQUIPA',                   'PL-0008'],
      ['59874123', 'Ana Lucía Rodríguez Vargas',      'ejecutor123', 'Ejecutor',      'Ejecutor de Capacitación',   'Activo',   '',                              ''],
      ['74125896', 'Carmen Rosa Delgado Silva',       'ejecutor123', 'Ejecutor',      'Ejecutor Administrativo',    'Inactivo', '',                              ''],
    ];
    for (const u of seed) {
      await pool.query(
        `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (dni) DO NOTHING`,
        u
      );
    }
    console.log('✓ Usuarios iniciales creados');
  }

  console.log('✓ Tablas verificadas');
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
    const f = req.body;
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

// ══════════════════════════════════════════════
// RESUMEN POR RED ASISTENCIAL (agrupado en BD)
// GET /api/resumen-redes?redes=Red1,Red2
// ══════════════════════════════════════════════
app.get('/api/resumen-redes', async (req, res) => {
  try {
    const { redes = '', eje_tematico = '' } = req.query;
    const cacheKey = `resumen-redes:${redes}:${eje_tematico}`;
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
    const { red = '', eje_tematico = '' } = req.query;
    const cacheKey = `stats:${red}:${eje_tematico}`;
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

    const actConds = [], actParams = [];
    if (red) { actConds.push(`red_asistencial ILIKE $${actParams.length + 1}`); actParams.push(`%${red}%`); }
    if (ejeTematico) { actConds.push(`unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${actParams.length + 1}))`); actParams.push(`%${ejeTematico}%`); }
    const whereActividad = actConds.length ? `WHERE ${actConds.join(' AND ')}` : '';

    const redBusqueda = red.replace(/^RA\s+/i, '').trim();
    const whereParticipante = redBusqueda ? `WHERE red ILIKE '%${redBusqueda}%'` : '';

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
      pool.query(`SELECT red, sexo, COUNT(*) total FROM lista_participantes ${whereParticipante} GROUP BY red, sexo`),
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
    const { rows } = await pool.query(
      `INSERT INTO solicitudes_revision (datos, red_asistencial, ejecutor_nombre, ejecutor_dni)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [JSON.stringify(datos), datos.redAsistencial || datos.red_asistencial || null, ejecutor_nombre || null, ejecutor_dni || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/solicitudes/mis-envios', async (req, res) => {
  try {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: 'dni requerido' });
    const { rows } = await pool.query(
      `SELECT id, datos, red_asistencial, estado, motivo_rechazo, created_at, reviewed_at
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
    const { estado, motivo_rechazo } = req.body;
    if (!['aprobado', 'denegado'].includes(estado)) {
      return res.status(400).json({ error: 'estado debe ser aprobado o denegado' });
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
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

    res.json(rows[0]);
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
      'SELECT id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla FROM usuarios_sistema ORDER BY rol,nombre'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const { dni, nombre, password, rol, cargo, estado, sedes, numero_plantilla } = req.body;
    if (!dni || !nombre || !password || !rol) return res.status(400).json({ error: 'dni, nombre, password y rol son requeridos' });
    const { rows } = await pool.query(
      `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla`,
      [dni, nombre, password, rol, cargo || '', estado || 'Activo', sedes || '', numero_plantilla || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese DNI.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:dni', async (req, res) => {
  try {
    const campos = ['nombre','password','rol','cargo','estado','sedes','numero_plantilla'];
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
      `UPDATE usuarios_sistema SET ${sets.join(',')} WHERE dni=$${idx} RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
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

// INICIAR SERVIDOR
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend PDP corriendo en http://localhost:${PORT}`);
});
