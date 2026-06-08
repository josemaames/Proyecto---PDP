require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Conexión PostgreSQL
// ──────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'pdp_essalud',
  user:     process.env.DB_USER || 'postgres',
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
    // Índice para filtrar y ordenar por red asistencial (actividades)
    `CREATE INDEX IF NOT EXISTS idx_actividad_red
       ON datos_actividad(red_asistencial)`,
    // Índice para filtrar y ordenar por red (personal y participantes)
    `CREATE INDEX IF NOT EXISTS idx_personal_red
       ON personal(red)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_red
       ON lista_participantes(red)`,
    // Índice para codigo_act en participantes (búsqueda frecuente)
    `CREATE INDEX IF NOT EXISTS idx_participantes_codigo
       ON lista_participantes(codigo_act)`,
    // Extensión y índices trigrama para búsquedas ILIKE eficientes
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE INDEX IF NOT EXISTS idx_actividad_nombre_trgm
       ON datos_actividad USING gin(nombre_actividad gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_personal_apellidos_trgm
       ON personal USING gin(apellidos gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_participantes_apellidos_trgm
       ON lista_participantes USING gin(apellidos gin_trgm_ops)`,
  ];

  for (const sql of indices) {
    try {
      await pool.query(sql);
    } catch (err) {
      // No detener el servidor si un índice falla (ej. tabla no existe aún)
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

    let conditions = [], params = [], idx = 1;

    if (q) {
      conditions.push(`(apellidos ILIKE $${idx} OR nombre ILIKE $${idx} OR dni_ce ILIKE $${idx} OR cargo ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }
    if (codigo_act) {
      conditions.push(`codigo_act ILIKE $${idx}`);
      params.push(`%${codigo_act}%`); idx++;
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
      `SELECT * FROM lista_participantes ${where} ORDER BY apellidos, nombre LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) FROM lista_participantes ${where}`, params
    );
    res.json({ data: rows, total: parseInt(c[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/participantes', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `INSERT INTO lista_participantes
         (codigo_act, dni_ce, cod_planilla, apellidos, nombre,
          sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [f.codigoAct || f.codigo_act, f.dniCe || f.dni_ce,
       f.codPlanilla || f.cod_planilla,
       f.apellidos, f.nombres || f.nombre,
       f.sexo, f.redAsist || f.red,
       f.subPrograma || f.sub_programa,
       f.servicioArea || f.servicio_area,
       f.cargo, f.regimenLaboral || f.regimen_laboral]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/participantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lista_participantes WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    let conditions = [], params = [], idx = 1;

    if (q) {
      conditions.push(`(nombre_actividad ILIKE $${idx} OR codigo_act ILIKE $${idx} OR red_asistencial ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }
    if (red) {
      conditions.push(`red_asistencial ILIKE $${idx}`);
      params.push(`%${red}%`); idx++;
    }
    if (modalidad) {
      conditions.push(`modalidad ILIKE $${idx}`);
      params.push(`%${modalidad}%`); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM datos_actividad ${where} ORDER BY numero NULLS LAST LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) FROM datos_actividad ${where}`, params
    );
    res.json({ data: rows, total: parseInt(c[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
      [f.codigo_act, f.fecha_inicio||null, f.fecha_fin||null, f.mes_termino,
       f.red_asistencial, f.servicio_area, f.nombre_actividad,
       f.total_horas||null, f.horas_fuera_horario||null, f.frecuencia,
       f.hora_inicio||null, f.hora_termino||null, f.modalidad, f.publico,
       f.nivel_evaluacion, f.objetivo_estrategico, f.total_participantes||null,
       f.ruc_proveedor, f.nombre_proveedor, f.sector_proveedor,
       f.presupuesto_ejecutado||null, f.eje_tematico]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
      [f.codigo_act, f.fecha_inicio||null, f.fecha_fin||null, f.mes_termino,
       f.red_asistencial, f.servicio_area, f.nombre_actividad,
       f.total_horas||null, f.modalidad, f.publico,
       f.total_participantes||null, f.presupuesto_ejecutado||null, f.eje_tematico,
       parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/actividades/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM datos_actividad WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await pool.query(
      `SELECT * FROM personal ${where} ORDER BY apellidos, nombre LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) FROM personal ${where}`, params
    );
    res.json({ data: rows, total: parseInt(c[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Buscar personal por DNI (para autocompletar al agregar participante)
app.get('/api/personal-essalud/dni/:dni', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM personal WHERE dni_ce = $1 LIMIT 1`,
      [req.params.dni]
    );
    if (!rows.length) return res.status(404).json({ error: 'DNI no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════
// RESUMEN POR RED ASISTENCIAL (agrupado en BD)
// GET /api/resumen-redes?redes=Red1,Red2
// ══════════════════════════════════════════════
app.get('/api/resumen-redes', async (req, res) => {
  try {
    const { redes = '' } = req.query;

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
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════
// ESTADÍSTICAS
// ══════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const queries = await Promise.all([
      pool.query('SELECT COUNT(*) FROM datos_actividad'),
      pool.query('SELECT COUNT(*) FROM lista_participantes'),
      pool.query('SELECT COALESCE(SUM(presupuesto_ejecutado),0) FROM datos_actividad'),
      pool.query('SELECT COUNT(DISTINCT red_asistencial) FROM datos_actividad'),
      pool.query(`SELECT modalidad, COUNT(*) as total FROM datos_actividad GROUP BY modalidad ORDER BY total DESC`),
    ]);
    res.json({
      actividades:      parseInt(queries[0].rows[0].count),
      participantes:    parseInt(queries[1].rows[0].count),
      presupuesto_total: parseFloat(queries[2].rows[0].coalesce),
      redes:            parseInt(queries[3].rows[0].count),
      por_modalidad:    queries[4].rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend PDP corriendo en http://localhost:${PORT}`);
});
