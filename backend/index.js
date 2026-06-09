require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Caché en memoria (evita queries repetidas)
// ──────────────────────────────────────────────
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos
const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
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

pool.connect()
  .then(() => {
    console.log('✓ Conectado a PostgreSQL');
    crearIndices();
  })
  .catch(err => console.error('✗ Error de conexión:', err.message));

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

    // Trigramas para búsquedas ILIKE eficientes
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
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
    const { q = '', codigo_act = '', red = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [],
      params = [],
      idx = 1;

    if (q) {
      conditions.push(
        `(apellidos ILIKE $${idx} OR nombre ILIKE $${idx} OR dni_ce ILIKE $${idx} OR cargo ILIKE $${idx})`,
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
      const redes = red.split(',').map(r => r.trim()).filter(Boolean);
      if (redes.length === 1) {
        conditions.push(`red ILIKE $${idx}`);
        params.push(`%${redes[0]}%`); idx++;
      } else if (redes.length > 1) {
        const redConds = redes.map((r, i) => { params.push(`%${r}%`); return `red ILIKE $${idx + i}`; });
        idx += redes.length;
        conditions.push(`(${redConds.join(' OR ')})`);
      }
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
        f.redAsist || f.red,
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
    const { q = '', red = '', modalidad = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const cacheKey = `actividades:${q}:${red}:${modalidad}:${page}:${limit}`;
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
      const redList = red.split(',').map(r => r.trim()).filter(Boolean);
      if (redList.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${redList[0]}%`);
        idx++;
      } else {
        const orClauses = redList.map((_, i) => `red_asistencial ILIKE $${idx + i}`).join(' OR ');
        conditions.push(`(${orClauses})`);
        params.push(...redList.map(r => `%${r}%`));
        idx += redList.length;
      }
    }
    if (modalidad) {
      conditions.push(`modalidad ILIKE $${idx}`);
      params.push(`%${modalidad}%`);
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
    const { q = '', red = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [], params = [], idx = 1;

    const search = `%${q || ''}%`;
    conditions.push(`(apellidos ILIKE $${idx} OR nombre ILIKE $${idx} OR dni_ce ILIKE $${idx} OR cargo ILIKE $${idx})`);
    params.push(search); idx++;

    if (red) {
      // Expand abbreviations: RA XXXXX → RED ASISTENCIAL XXXXX, RP XXXXX → RED PRESTACIONAL XXXXX
      const expandirRed = (r) => {
        const u = r.trim().toUpperCase();
        if (u.startsWith('RA ')) return 'RED ASISTENCIAL ' + u.slice(3);
        if (u.startsWith('RP ')) return 'RED PRESTACIONAL ' + u.slice(3);
        return u;
      };
      const redes = red.split(',').map(r => expandirRed(r)).filter(Boolean);
      if (redes.length === 1) {
        conditions.push(`red ILIKE $${idx}`);
        params.push(`%${redes[0]}%`); idx++;
      } else if (redes.length > 1) {
        const redConds = redes.map((r, i) => { params.push(`%${r}%`); return `red ILIKE $${idx + i}`; });
        idx += redes.length;
        conditions.push(`(${redConds.join(' OR ')})`);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await pool.query(
      `SELECT * FROM personal ${where} ORDER BY apellidos, nombre LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) FROM personal ${where}`, params
    );
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
    const { redes = '' } = req.query;
    const cacheKey = `resumen-redes:${redes}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let where = '';
    const params = [];

    if (redes) {
      const lista = redes.split(',').map(r => r.trim()).filter(Boolean);
      if (lista.length === 1) {
        where = `WHERE red_asistencial ILIKE $1`;
        params.push(`%${lista[0]}%`);
      } else if (lista.length > 1) {
        const conds = lista.map((r, i) => { params.push(`%${r}%`); return `red_asistencial ILIKE $${i + 1}`; });
        where = `WHERE (${conds.join(' OR ')})`;
      }
    }

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
      params
    );
    setCache(cacheKey, rows);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════
// ESTADÍSTICAS
// ══════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const { red = '' } = req.query;
    const cacheKey = `stats:${red}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const actWhere  = red ? `WHERE red_asistencial ILIKE $1` : '';
    const partWhere = red ? `WHERE red ILIKE $1`             : '';
    const p         = red ? [`%${red}%`]                     : [];

    const queries = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM datos_actividad ${actWhere}`,  p),
      pool.query(`SELECT COUNT(*) FROM lista_participantes ${partWhere}`, p),
      pool.query(`SELECT COALESCE(SUM(presupuesto_ejecutado),0) FROM datos_actividad ${actWhere}`, p),
      pool.query(`SELECT COUNT(DISTINCT red_asistencial) FROM datos_actividad ${actWhere}`, p),
      pool.query(`
        SELECT modalidad, COUNT(*) as total
        FROM datos_actividad ${actWhere}
        GROUP BY modalidad ORDER BY total DESC
      `, p),
    ]);

    const result = {
      actividades:       parseInt(queries[0].rows[0].count),
      participantes:     parseInt(queries[1].rows[0].count),
      presupuesto_total: parseFloat(queries[2].rows[0].coalesce),
      redes:             parseInt(queries[3].rows[0].count),
      por_modalidad:     queries[4].rows,
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

      pool.query(`
        SELECT COALESCE(SUM(presupuesto_ejecutado),0) total
        FROM datos_actividad
      `),

      pool.query(`
        SELECT mes_termino, COUNT(*) total
        FROM datos_actividad
        GROUP BY mes_termino
        ORDER BY total DESC
      `),

      pool.query(`
        SELECT sexo, COUNT(*) total
        FROM lista_participantes
        GROUP BY sexo
      `),

      pool.query(`
        SELECT red, COUNT(*) total
        FROM lista_participantes
        GROUP BY red
        ORDER BY total DESC
        LIMIT 10
      `),

      pool.query(`
        SELECT modalidad, COUNT(*) total
        FROM datos_actividad
        GROUP BY modalidad
      `),

      pool.query(`
        SELECT servicio_area, COUNT(*) total
        FROM datos_actividad
        GROUP BY servicio_area
        ORDER BY total DESC
        LIMIT 10
      `),
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

// ──────────────────────────────────────────────
// INICIAR SERVIDOR
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend PDP corriendo en http://localhost:${PORT}`);
});
