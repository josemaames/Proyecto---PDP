require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const pool = require('./db-oracle'); // adaptador Oracle, expone .query() estilo pg
const nodemailer = require('nodemailer');
const multer = require('multer');
const XLSX = require('xlsx');
const StorageSDK = require('./storage-sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // POST de formulario (SSO desde SOMOS)

// ──────────────────────────────────────────────
// File Server interno de EsSalud (Dotworkers) — comprobantes de pago.
// Reemplaza a Supabase Storage para /api/documentos. Por ahora el File Server
// solo tiene habilitado PDF para la app "PROVIDERS" (Excel/Word/imágenes dan
// 409 TYPE_FILE_NOT_CONFIGURATED) — falta que el equipo de TI de EsSalud
// habilite los demás tipos del lado de su servidor.
// ──────────────────────────────────────────────
const storageSdk = new StorageSDK({
  host: process.env.STORAGE_URL_API,
  api_key: process.env.STORAGE_API_KEY,
  app_name: process.env.STORAGE_APP_NAME,
});

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (comprobantes de pago)
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS[file.mimetype]) return cb(null, true);
    cb(
      new Error('Tipo de archivo no permitido. Solo PDF, Word, Excel o imágenes (JPG, PNG, WEBP).'),
    );
  },
});

// Padrones de personal (Excel) pueden pesar bastante más que un comprobante.
const uploadPadron = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    const esExcel =
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (esExcel) return cb(null, true);
    cb(new Error('Solo se aceptan archivos Excel (.xls/.xlsx) para el padrón de personal.'));
  },
});

// Documentos de convenios (marco / específico): solo PDF firmado, igual que el
// resto de documentos ante el File Server (por ahora QA solo tiene PDF habilitado).
const uploadConvenio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se aceptan archivos PDF para los documentos de convenios.'));
  },
});

// Carga masiva de convenios por Excel.
const uploadConveniosExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const esExcel =
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (esExcel) return cb(null, true);
    cb(new Error('Solo se aceptan archivos Excel (.xls/.xlsx) para la carga de convenios.'));
  },
});

// Búsqueda de texto libre por nombre/apellido: separa lo escrito en palabras
// y exige que CADA palabra aparezca en ALGUNO de los campos dados. Así
// "Amanda Santillán" encuentra a alguien sin importar si "Amanda" está en la
// columna nombre y "Santillán" en apellidos (o al revés), y buscar una sola
// palabra (solo el apellido, por ejemplo) sigue funcionando igual que antes.
function condicionBusquedaPalabras(campos, texto, params, idxInicial) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  let idx = idxInicial;
  if (!palabras.length) return { condicion: null, idx };
  const grupos = palabras.map((palabra) => {
    const grupo = campos.map((c) => `${c} ILIKE $${idx}`).join(' OR ');
    params.push(`%${palabra}%`);
    idx++;
    return `(${grupo})`;
  });
  return { condicion: `(${grupos.join(' AND ')})`, idx };
}

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

// Reduce cualquier variante del nombre de una red a su "núcleo" para comparar
// ("RP ALMENARA", "RA ALMENARA", "RED PRESTACIONAL ALMENARA" → "ALMENARA").
function normalizarRedKey(r) {
  if (!r) return '';
  return r
    .toString()
    .trim()
    .toUpperCase()
    .replace(/^RED (ASISTENCIAL|PRESTACIONAL)\s+/, '')
    .replace(/^(RA|RP)\s+/, '');
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
// Conexión Oracle (QA) — la conexión real vive en db-oracle.js, `pool` ya
// viene importado arriba. El schema (tablas Pdp_*) ya existe, se creó aparte
// con el script DDL, así que aquí no se auto-crea nada.
// ──────────────────────────────────────────────
console.log('Config DB (Oracle) ->', {
  host: process.env.DB_QA_HOST,
  port: process.env.DB_QA_PORT,
  service: process.env.DB_QA_SERVICE,
  user: process.env.DB_QA_USER,
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
  const to = Array.isArray(destinatarios) ? destinatarios.filter(Boolean).join(',') : destinatarios;
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

// El schema (tablas Pdp_*) ya existe en Oracle, se creó aparte con el script
// DDL — aquí solo se verifica que la conexión funcione al arrancar.
pool
  .query('SELECT 1 FROM DUAL')
  .then(() => console.log('✓ Conectado a Oracle'))
  .catch((err) => console.error('✗ Error de conexión:', err));


async function logEvento(
  tipo,
  descripcion,
  actor_nombre = null,
  actor_rol = null,
  referencia = null,
) {
  try {
    await pool.query(
      `INSERT INTO audit_log (tipo, descripcion, actor_nombre, actor_rol, referencia) VALUES ($1,$2,$3,$4,$5)`,
      [tipo, descripcion, actor_nombre, actor_rol, referencia],
    );
  } catch (e) {
    console.error('logEvento error:', e.message);
  }
}


// ══════════════════════════════════════════════
// PARTICIPANTES
// GET  /api/participantes?q=&codigo_act=&page=1&limit=50
// POST /api/participantes
// DEL  /api/participantes/:id
// ══════════════════════════════════════════════
app.get('/api/participantes', async (req, res) => {
  try {
    const {
      q = '',
      codigo_act = '',
      red = '',
      regimen_laboral = '',
      page = 1,
      limit = 50,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [],
      params = [],
      idx = 1;

    if (q) {
      const { condicion, idx: idxTrasBusqueda } = condicionBusquedaPalabras(
        ['apellidos', 'nombre', 'dni_ce', 'cargo', 'codigo_act'],
        q,
        params,
        idx,
      );
      if (condicion) conditions.push(condicion);
      idx = idxTrasBusqueda;
    }
    if (codigo_act) {
      conditions.push(`codigo_act ILIKE $${idx}`);
      params.push(`%${codigo_act}%`);
      idx++;
    }
    if (red) {
      // Para cada red buscamos tanto el formato largo ("RED PRESTACIONAL REBAGLIATI")
      // como el formato corto ("RP REBAGLIATI") para cubrir ambas variantes en la tabla
      const variants = red
        .split(',')
        .flatMap((r) => {
          const largo = expandirRed(r.trim());
          const corto = r.trim().toUpperCase();
          return largo !== corto ? [largo, corto] : [largo];
        })
        .filter(Boolean);

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

// Mantiene datos_actividad.total_participantes en línea con el conteo real de
// lista_participantes (se desincroniza si no se llama tras cada alta/baja).
async function recalcularTotalParticipantes(codigo_act) {
  if (!codigo_act) return;
  await pool.query(
    `UPDATE datos_actividad SET total_participantes =
       (SELECT COUNT(*) FROM lista_participantes WHERE codigo_act=$1)
     WHERE codigo_act=$1`,
    [codigo_act],
  );
}

app.post('/api/participantes', async (req, res) => {
  try {
    const f = req.body;
    const codigo_act = f.codigoAct || f.codigo_act;
    const { rows } = await pool.query(
      `INSERT INTO lista_participantes
         (codigo_act, dni_ce, cod_planilla, apellidos, nombre,
          sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        codigo_act,
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
    await recalcularTotalParticipantes(codigo_act);
    invalidarCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/participantes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query('SELECT codigo_act FROM lista_participantes WHERE id=$1', [id]);
    await pool.query('DELETE FROM lista_participantes WHERE id=$1', [id]);
    await recalcularTotalParticipantes(rows[0]?.codigo_act);
    invalidarCache();
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
    logEvento(
      'capacitacion_editada',
      `${actor_nombre || 'Usuario'} editó la capacitación "${f.nombre_actividad}" [${f.codigo_act}]`,
      actor_nombre,
      actor_rol || 'Sectorista',
      f.codigo_act,
    );
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
      [actId],
    );
    const map = {};
    rows.forEach(
      (r) => (map[r.paso_nombre] = { completado: r.completado === 'Y', completado_at: r.completado_at }),
    );
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

    const completadoDb = completado ? 'Y' : 'N';
    const completadoAt = completado ? new Date() : null;
    const updPaso = await pool.query(
      `UPDATE hoja_ruta_pasos SET completado=$1, completado_at=$2
       WHERE actividad_id=$3 AND paso_nombre=$4`,
      [completadoDb, completadoAt, actId, paso],
    );
    if (updPaso.rowCount === 0) {
      await pool.query(
        `INSERT INTO hoja_ruta_pasos (actividad_id, paso_nombre, completado, completado_at)
         VALUES ($1, $2, $3, $4)`,
        [actId, paso, completadoDb, completadoAt],
      );
    }

    // Notificar sectorista de la red si se marca como completado
    if (completado) {
      const { rows: act } = await pool.query(
        `SELECT nombre_actividad, codigo_act, red_asistencial FROM datos_actividad WHERE id=$1`,
        [actId],
      );
      if (act.length) {
        const { nombre_actividad, codigo_act, red_asistencial } = act[0];
        const { rows: sectoristas } = await pool.query(
          `SELECT email, nombre FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
          [`%${red_asistencial}%`],
        );
        if (sectoristas.length) {
          const emails = sectoristas.map((s) => s.email);
          const html = htmlBase(
            '#005baa',
            '📋 Actualización de Hoja de Ruta PDP',
            `<p>El administrador <strong>${actor_nombre}</strong> marcó el paso <strong>"${paso}"</strong> como completado en la siguiente capacitación:</p>
             <table style="width:100%;border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:8px;color:#6b7280">Capacitación:</td><td style="padding:8px;font-weight:bold">${nombre_actividad}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Código:</td><td style="padding:8px">${codigo_act}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Red asistencial:</td><td style="padding:8px">${red_asistencial}</td></tr>
               <tr><td style="padding:8px;color:#6b7280">Paso completado:</td><td style="padding:8px;color:#16a34a;font-weight:bold">✅ ${paso}</td></tr>
             </table>
             <p>Ingrese al Sistema PDP para ver el estado actualizado de la hoja de ruta.</p>`,
          );
          enviarCorreo(emails, `✅ Paso "${paso}" completado — ${nombre_actividad}`, html);
        }
        logEvento(
          'hoja_ruta',
          `${actor_nombre} marcó paso "${paso}" como ${completado ? 'completado' : 'pendiente'} en capacitación "${nombre_actividad}" [${codigo_act}]`,
          actor_nombre,
          'Administrador',
          codigo_act,
        );
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

    const { condicion: condicionBusqueda, idx: idxTrasBusqueda } = condicionBusquedaPalabras(
      ['apellidos', 'nombre', 'dni_ce', 'cargo'],
      q,
      params,
      idx,
    );
    if (condicionBusqueda) conditions.push(condicionBusqueda);
    idx = idxTrasBusqueda;

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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

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
// ACTUALIZAR PERSONAL (solo Administrador)
// Sube un padrón completo de personal (mismas cabeceras que la hoja PERSONAL)
// y lo compara contra la BD: DNI nuevo → alta, DNI existente con red distinta
// → actualiza red, DNI que ya no aparece → lo marca Cesado. Si la persona
// afectada está en una capacitación vigente, genera una alerta y notifica por
// correo al ejecutor/sectorista de esa red.
//
// Nota para el futuro: cuando exista la API real de personal, esta misma
// lógica de "aplicar cambios" (altas/cambios de red/ceses + alertas) se puede
// alimentar directo con una lista de cambios en vez de comparar un padrón
// completo — el bloque de "detectar capacitaciones afectadas y notificar" de
// abajo no depende de cómo se obtuvo la lista de cambios.
// ══════════════════════════════════════════════
app.post('/api/personal/actualizar', uploadPadron.single('archivo'), async (req, res) => {
  try {
    const { actor_nombre, actor_rol } = req.body;
    if (actor_rol !== 'Administrador') {
      return res.status(403).json({ error: 'Solo el Administrador puede actualizar el personal.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const strv = (v) => (v === undefined || v === null || v === '' ? null : String(v).trim());
    const dniv = (v) => {
      const s = strv(v);
      if (!s) return null;
      return /^\d+$/.test(s) ? s.padStart(8, '0') : s;
    };

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const filas = raw.slice(1).filter((r) => r[0] !== null && r[0] !== '');

    const enArchivo = new Map();
    for (const r of filas) {
      const d = dniv(r[0]);
      if (!d) continue;
      enArchivo.set(d, {
        cod_planilla: strv(r[1]),
        apellidos: strv(r[2]),
        nombre: strv(r[3]),
        sexo: strv(r[4]),
        red: strv(r[5]),
        sub_programa: strv(r[6]),
        servicio_area: strv(r[7]),
        cargo: strv(r[8]),
        regimen_laboral: strv(r[9]),
      });
    }

    const { rows: actuales } = await pool.query(
      `SELECT dni_ce, red, apellidos, nombre FROM personal WHERE estado='Activo'`,
    );
    const actualesMap = new Map(actuales.map((a) => [a.dni_ce, a]));

    let altas = 0;
    let cambiosRed = 0;
    let ceses = 0;
    const eventos = []; // { dni_ce, nombre_completo, tipo, red_anterior, red_nueva }

    for (const [dni_ce, datos] of enArchivo) {
      const existente = actualesMap.get(dni_ce);
      if (!existente) {
        await pool.query(
          `INSERT INTO personal (dni_ce, cod_planilla, apellidos, nombre, sexo, red, sub_programa, servicio_area, cargo, regimen_laboral, estado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Activo')`,
          [
            dni_ce, datos.cod_planilla, datos.apellidos, datos.nombre, datos.sexo,
            datos.red, datos.sub_programa, datos.servicio_area, datos.cargo, datos.regimen_laboral,
          ],
        );
        altas++;
      } else if (datos.red && normalizarRedKey(existente.red) !== normalizarRedKey(datos.red)) {
        await pool.query(`UPDATE personal SET red=$1 WHERE dni_ce=$2`, [datos.red, dni_ce]);
        cambiosRed++;
        eventos.push({
          dni_ce,
          nombre_completo: `${existente.apellidos || ''} ${existente.nombre || ''}`.trim(),
          tipo: 'CAMBIO_RED',
          red_anterior: existente.red,
          red_nueva: datos.red,
        });
      }
    }

    for (const a of actuales) {
      if (!enArchivo.has(a.dni_ce)) {
        await pool.query(`UPDATE personal SET estado='Cesado' WHERE dni_ce=$1`, [a.dni_ce]);
        ceses++;
        eventos.push({
          dni_ce: a.dni_ce,
          nombre_completo: `${a.apellidos || ''} ${a.nombre || ''}`.trim(),
          tipo: 'CESE',
          red_anterior: a.red,
          red_nueva: null,
        });
      }
    }

    // Detectar capacitaciones vigentes (sin terminar) donde participa alguien
    // afectado, generar la alerta, y agrupar para notificar por correo.
    let alertasGeneradas = 0;
    const porRed = new Map();

    for (const ev of eventos) {
      const { rows: participaciones } = await pool.query(
        `SELECT lp.codigo_act, da.nombre_actividad, da.fecha_fin, da.red_asistencial
         FROM lista_participantes lp
         JOIN datos_actividad da ON da.codigo_act = lp.codigo_act
         WHERE lp.dni_ce = $1 AND (da.fecha_fin IS NULL OR da.fecha_fin >= $2)`,
        [ev.dni_ce, new Date()],
      );
      for (const p of participaciones) {
        await pool.query(
          `INSERT INTO alertas_personal (dni_ce, codigo_act, tipo, nombre_completo, red_anterior, red_nueva)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ev.dni_ce, p.codigo_act, ev.tipo, ev.nombre_completo, ev.red_anterior, ev.red_nueva],
        );
        alertasGeneradas++;

        const clave = p.red_asistencial || '';
        if (!porRed.has(clave)) porRed.set(clave, []);
        porRed.get(clave).push({ ...ev, codigo_act: p.codigo_act, nombre_actividad: p.nombre_actividad });
      }
    }

    for (const [red, items] of porRed) {
      const key = normalizarRedKey(red);
      const { rows: destinatarios } = await pool.query(
        `SELECT email FROM usuarios_sistema
         WHERE rol IN ('Sectorista','Ejecutor') AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
        [`%${key}%`],
      );
      if (!destinatarios.length) continue;
      const emails = destinatarios.map((d) => d.email);
      const filasHtml = items
        .map(
          (it) =>
            `<tr><td style="padding:6px">${it.nombre_completo}</td><td style="padding:6px">${it.codigo_act} — ${it.nombre_actividad || ''}</td><td style="padding:6px">${
              it.tipo === 'CESE' ? 'Cesó' : `Cambió de red (${it.red_anterior} → ${it.red_nueva})`
            }</td></tr>`,
        )
        .join('');
      const html = htmlBase(
        '#dc2626',
        'Revisar participantes en capacitaciones',
        `<p>Se detectaron cambios en el personal que afectan capacitaciones vigentes de la red <strong>${red}</strong>:</p>
         <table style="width:100%;border-collapse:collapse;margin:16px 0">
           <tr style="background:#f3f4f6"><th style="padding:6px;text-align:left">Persona</th><th style="padding:6px;text-align:left">Capacitación</th><th style="padding:6px;text-align:left">Motivo</th></tr>
           ${filasHtml}
         </table>
         <p>Revisa si corresponde eliminarlos de la capacitación.</p>`,
      );
      enviarCorreo(emails, 'Personal desactualizado en capacitaciones — Sistema PDP', html);
    }

    logEvento(
      'personal_actualizado',
      `${actor_nombre || 'Administrador'} actualizó el padrón de personal: ${altas} altas, ${cambiosRed} cambios de red, ${ceses} ceses, ${alertasGeneradas} alertas generadas`,
      actor_nombre,
      'Administrador',
      null,
    );

    invalidarCache();
    res.json({ altas, cambiosRed, ceses, alertasGeneradas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alertas pendientes de revisión (filtrable por capacitación)
app.get('/api/personal/alertas', async (req, res) => {
  try {
    const { codigo_act, red } = req.query;
    const conditions = [`ap.resuelto='N'`];
    const params = [];
    let idx = 1;

    if (codigo_act) {
      conditions.push(`ap.codigo_act=$${idx}`);
      params.push(codigo_act);
      idx++;
    }
    if (red) {
      const redes = red
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      if (redes.length) {
        const redConds = redes.map((r, i) => {
          params.push(`%${r}%`);
          return `da.red_asistencial ILIKE $${idx + i}`;
        });
        idx += redes.length;
        conditions.push(`(${redConds.join(' OR ')})`);
      }
    }

    const { rows } = await pool.query(
      `SELECT ap.* FROM alertas_personal ap
       JOIN datos_actividad da ON da.codigo_act = ap.codigo_act
       WHERE ${conditions.join(' AND ')}
       ORDER BY ap.detectado_at DESC`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, resuelto: r.resuelto === 'Y' })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar una alerta como revisada (ej. ya se eliminó al participante)
app.put('/api/personal/alertas/:id/resolver', async (req, res) => {
  try {
    const { actor_nombre, motivo } = req.body;
    await pool.query(
      `UPDATE alertas_personal SET resuelto='Y', resuelto_at=NOW(), resuelto_por=$1, motivo=$2 WHERE id=$3`,
      [actor_nombre || '', motivo || null, req.params.id],
    );
    res.json({ ok: true });
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

    let conditions = [],
      params = [],
      idx = 1;

    if (redes) {
      const lista = redes
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      if (lista.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${lista[0]}%`);
        idx++;
      } else if (lista.length > 1) {
        const conds = lista.map((r) => {
          params.push(`%${r}%`);
          return `red_asistencial ILIKE $${idx++}`;
        });
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

    let actConds = [],
      actParams = [],
      idx = 1;
    let partConds = [],
      partParams = [];

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
      pool.query(
        `SELECT COALESCE(SUM(presupuesto_ejecutado),0) FROM datos_actividad ${actWhere}`,
        actParams,
      ),
      pool.query(
        `SELECT COUNT(DISTINCT red_asistencial) FROM datos_actividad ${actWhere}`,
        actParams,
      ),
      pool.query(
        `SELECT modalidad, COUNT(*) as total FROM datos_actividad ${actWhere} GROUP BY modalidad ORDER BY total DESC`,
        actParams,
      ),
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

    const actConds = [],
      actParams = [];
    if (red) {
      actConds.push(`red_asistencial ILIKE $${actParams.length + 1}`);
      actParams.push(`%${red}%`);
    }
    if (ejeTematico) {
      actConds.push(
        `unaccent(lower(eje_tematico)) ILIKE unaccent(lower($${actParams.length + 1}))`,
      );
      actParams.push(`%${ejeTematico}%`);
    }
    if (anio) {
      actConds.push(
        `EXTRACT(YEAR FROM COALESCE(fecha_fin, fecha_inicio)) = $${actParams.length + 1}`,
      );
      actParams.push(parseInt(anio));
    }
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
      pool.query(
        `SELECT mes_termino, COUNT(*) total FROM datos_actividad ${whereActividad} GROUP BY mes_termino ORDER BY total DESC`,
        actParams,
      ),
      pool.query(
        `SELECT red, sexo, COUNT(*) total FROM lista_participantes ${whereParticipante} GROUP BY red, sexo`,
        participanteParams,
      ),
      pool.query(
        `SELECT red, COUNT(*) total FROM lista_participantes GROUP BY red ORDER BY total DESC LIMIT 10`,
      ),
      pool.query(
        `SELECT modalidad, COUNT(*) total FROM datos_actividad ${whereActividad} GROUP BY modalidad`,
        actParams,
      ),
      pool.query(
        `SELECT servicio_area, COUNT(*) total FROM datos_actividad GROUP BY servicio_area ORDER BY total DESC LIMIT 10`,
      ),
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
      [JSON.stringify(datos), red, ejecutor_nombre || null, ejecutor_dni || null],
    );
    res.status(201).json({
      ...rows[0],
      datos: rows[0].datos ? JSON.parse(rows[0].datos) : null,
      correccion_pendiente: rows[0].correccion_pendiente === 'Y',
    });

    const actNombre = datos.nombreActividad || datos.nombre_actividad || 'Sin nombre';
    logEvento(
      'solicitud_enviada',
      `${ejecutor_nombre || 'Ejecutor'} envió solicitud de capacitación "${actNombre}" — ${red || 'Sin red'}, a la espera de revisión del sectorista`,
      ejecutor_nombre,
      'Ejecutor',
      actNombre,
    );

    // Notificar a sectoristas de la red (sin bloquear la respuesta)
    if (red) {
      const { rows: sectoristas } = await pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
        [`%${red}%`],
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
           <p>Ingrese al <strong>Sistema PDP</strong> para revisar esta solicitud.</p>`,
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
      [dni],
    );
    res.json(rows.map((r) => ({
      ...r,
      datos: r.datos ? JSON.parse(r.datos) : null,
      correccion_pendiente: r.correccion_pendiente === 'Y',
    })));
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
      const redes = String(red)
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      if (redes.length === 1) {
        conditions.push(`red_asistencial ILIKE $${idx}`);
        params.push(`%${redes[0]}%`);
      } else {
        const orClauses = redes.map((_, i) => `red_asistencial ILIKE $${idx + i}`).join(' OR ');
        conditions.push(`(${orClauses})`);
        params.push(...redes.map((r) => `%${r}%`));
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, datos, red_asistencial, ejecutor_nombre, ejecutor_dni, estado, motivo_rechazo, created_at
       FROM solicitudes_revision ${where} ORDER BY created_at DESC`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, datos: r.datos ? JSON.parse(r.datos) : null })));
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
      [estado, motivo_rechazo || null, parseInt(req.params.id)],
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });

    if (estado === 'aprobado') {
      const f = JSON.parse(rows[0].datos); // datos es CLOB en Oracle, viene como texto sin parsear
      const camposActividad = [
        f.fechaInicio || null,
        f.fechaFin || null,
        f.mesTermino,
        f.redAsistencial,
        f.servicioArea,
        f.nombreActividad,
        f.totalHoras || null,
        f.horasFueraHorario || null,
        f.frecuencia,
        f.horaInicio || null,
        f.horaTermino || null,
        f.modalidad,
        f.publico,
        f.nivelEvaluacion,
        f.objetivoEstrategico || null,
        f.totalParticipantes || null,
        f.rucProveedor,
        f.nombreProveedor,
        f.sectorProveedor,
        f.presupuestoEjecutado || null,
        f.ejeTematico,
      ];
      // Oracle no tiene ON CONFLICT: se intenta UPDATE por codigo_act y, si no
      // afectó ninguna fila (no existía), se hace el INSERT.
      const updAct = await pool.query(
        `UPDATE datos_actividad SET
           fecha_inicio=$1, fecha_fin=$2, mes_termino=$3, red_asistencial=$4,
           servicio_area=$5, nombre_actividad=$6, total_horas=$7, horas_fuera_horario=$8,
           frecuencia=$9, hora_inicio=$10, hora_termino=$11, modalidad=$12, publico=$13,
           nivel_evaluacion=$14, objetivo_estrategico=$15, total_participantes=$16,
           ruc_proveedor=$17, nombre_proveedor=$18, sector_proveedor=$19,
           presupuesto_ejecutado=$20, eje_tematico=$21
         WHERE codigo_act=$22`,
        [...camposActividad, f.codigoAct],
      );
      if (updAct.rowCount === 0) {
        await pool.query(
          `INSERT INTO datos_actividad
             (codigo_act, fecha_inicio, fecha_fin, mes_termino, red_asistencial,
              servicio_area, nombre_actividad, total_horas, horas_fuera_horario,
              frecuencia, hora_inicio, hora_termino, modalidad, publico,
              nivel_evaluacion, objetivo_estrategico, total_participantes,
              ruc_proveedor, nombre_proveedor, sector_proveedor,
              presupuesto_ejecutado, eje_tematico)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [f.codigoAct, ...camposActividad],
        );
      }
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
          ],
        );
      }

      invalidarCache();
    }

    // Notificar al ejecutor y a los administradores
    const solicitud = rows[0];
    const solicitudDatos = solicitud.datos ? JSON.parse(solicitud.datos) : {};
    const esAprobado = estado === 'aprobado';
    const esObservado = estado === 'observado';
    const esExcluido = estado === 'excluido';
    const actividadNombre =
      solicitudDatos.nombreActividad || solicitudDatos.nombre_actividad || '-';
    const red = solicitud.red_asistencial || '-';

    // Configuración visual por estado
    const cfg = esAprobado
      ? { color: '#16a34a', icono: '✅', etiqueta: 'APROBADA' }
      : esObservado
        ? { color: '#d97706', icono: '🔍', etiqueta: 'OBSERVADA' }
        : { color: '#dc2626', icono: '🚫', etiqueta: 'EXCLUIDA' };

    const [{ rows: ejecutores }, { rows: admins }] = await Promise.all([
      pool.query(`SELECT email, nombre FROM usuarios_sistema WHERE dni=$1 AND email != ''`, [
        solicitud.ejecutor_dni,
      ]),
      pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Administrador' AND estado='Activo' AND email != ''`,
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
         </table>`,
      );
      enviarCorreo(
        ejecutores[0].email,
        `${cfg.icono} Solicitud ${cfg.etiqueta.toLowerCase()} — Sistema PDP`,
        htmlEjecutor,
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
         </table>`,
      );
      enviarCorreo(
        admins.map((a) => a.email),
        `${cfg.icono} Solicitud ${estado} — Sistema PDP`,
        htmlAdmin,
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

    res.json({
      ...rows[0],
      datos: rows[0].datos ? JSON.parse(rows[0].datos) : null,
      correccion_pendiente: rows[0].correccion_pendiente === 'Y',
    });
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
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const sol = rows[0];
    const solDatos = sol.datos ? JSON.parse(sol.datos) : {};
    const email = sol.ejecutor_email;
    const ejecutorNombre = sol.ejecutor_nombre || sol.ejecutor_nombre_real || 'Ejecutor';
    const actNombre = solDatos.nombreActividad || solDatos.nombre_actividad || 'Sin nombre';
    const seccionLabel =
      seccion === 'formulario' ? 'Formulario de Capacitación' : 'Registro de Participantes';

    // Marcar corrección pendiente en la solicitud
    await pool.query(
      `UPDATE solicitudes_revision SET correccion_pendiente='Y', seccion_correccion=$1 WHERE id=$2`,
      [seccion, id],
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
         <p>Ingresa al <strong>Sistema PDP</strong> y realiza las correcciones en la sección indicada antes de reenviar tu solicitud.</p>`,
      );
      enviarCorreo(email, `📝 Corrección requerida: ${seccionLabel} — Sistema PDP`, htmlEjecutor);
    }

    logEvento(
      'solicitud_correccion',
      `${sectorista_nombre || 'Sectorista'} solicitó corrección en "${seccionLabel}" de la capacitación "${actNombre}" al ejecutor ${ejecutorNombre}`,
      sectorista_nombre,
      'Sectorista',
      actNombre,
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
       SET datos=$1, estado='pendiente', correccion_pendiente='N', seccion_correccion=NULL, reviewed_at=NULL, motivo_rechazo=NULL
       WHERE id=$2 RETURNING *`,
      [JSON.stringify(datos), id],
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
          datos.fechaInicio || null,
          datos.fechaFin || null,
          datos.mesTermino || null,
          datos.redAsistencial || null,
          datos.servicioArea || null,
          datos.nombreActividad || null,
          datos.totalHoras || null,
          datos.horasFueraHorario || null,
          datos.frecuencia || null,
          datos.horaInicio || null,
          datos.horaTermino || null,
          datos.modalidad || null,
          datos.publico || null,
          datos.nivelEvaluacion || null,
          datos.objetivoEstrategico || null,
          (Array.isArray(datos.participantesDetalle) ? datos.participantesDetalle.length : null) ||
            datos.totalParticipantes ||
            null,
          datos.rucProveedor || null,
          datos.nombreProveedor || null,
          datos.sectorProveedor || null,
          datos.presupuestoEjecutado || null,
          datos.ejeTematico || null,
        ],
      );
      invalidarCache();
    }

    logEvento(
      'solicitud_reenviada',
      `${ejecutor_nombre || 'Ejecutor'} reenvió la solicitud corregida "${actNombre}"`,
      ejecutor_nombre,
      'Ejecutor',
      actNombre,
    );

    // Notificar sectoristas de la red
    const red = rows[0].red_asistencial;
    if (red) {
      const { rows: sectoristas } = await pool.query(
        `SELECT email FROM usuarios_sistema WHERE rol='Sectorista' AND estado='Activo' AND sedes ILIKE $1 AND email != ''`,
        [`%${red}%`],
      );
      if (sectoristas.length) {
        const html = htmlBase(
          '#16a34a',
          '✅ Solicitud corregida y reenviada',
          `<p>El ejecutor <strong>${ejecutor_nombre || 'Sin nombre'}</strong> ha reenviado una solicitud corregida.</p>
           <table style="width:100%;border-collapse:collapse;margin:16px 0">
             <tr><td style="padding:8px;color:#6b7280">Actividad:</td><td style="padding:8px;font-weight:bold">${actNombre}</td></tr>
             <tr><td style="padding:8px;color:#6b7280">Red:</td><td style="padding:8px">${red}</td></tr>
           </table>
           <p>Ingrese al Sistema PDP para revisar la solicitud actualizada.</p>`,
        );
        enviarCorreo(
          sectoristas.map((s) => s.email),
          '✅ Solicitud corregida — Sistema PDP',
          html,
        );
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
      [dni, password],
    );
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const u = rows[0];
    if (u.estado === 'Inactivo')
      return res.status(403).json({ error: 'Cuenta desactivada. Contacte al administrador.' });
    const roles =
      u.roles && u.roles.trim()
        ? u.roles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [u.rol];
    res.json({
      id: u.id,
      dni: u.dni,
      nombre: u.nombre,
      rol: u.rol, // rol principal (compatibilidad)
      roles, // todos los roles del usuario
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
      'SELECT id,dni,nombre,rol,roles,cargo,estado,sedes,numero_plantilla,email FROM usuarios_sistema ORDER BY rol,nombre',
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const {
      dni,
      nombre,
      password,
      rol,
      roles,
      cargo,
      estado,
      sedes,
      numero_plantilla,
      email,
      actor_nombre,
      actor_rol,
    } = req.body;
    const rolesArr = (
      Array.isArray(roles) ? roles : roles ? String(roles).split(',') : rol ? [rol] : []
    )
      .map((s) => String(s).trim())
      .filter(Boolean);
    const rolesStr = rolesArr.join(',');
    const rolPrincipal = rolesArr[0] || '';
    if (!dni || !nombre || !password || !rolPrincipal)
      return res
        .status(400)
        .json({ error: 'dni, nombre, password y al menos un rol son requeridos' });
    const { rows } = await pool.query(
      `INSERT INTO usuarios_sistema (dni,nombre,password,rol,roles,cargo,estado,sedes,numero_plantilla,email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,dni,nombre,rol,roles,cargo,estado,sedes,numero_plantilla,email`,
      [
        dni,
        nombre,
        password,
        rolPrincipal,
        rolesStr,
        cargo || '',
        estado || 'Activo',
        sedes || '',
        numero_plantilla || '',
        email || '',
      ],
    );
    logEvento(
      'usuario_creado',
      `${actor_nombre || 'Administrador'} creó el usuario ${nombre} (${rolesStr})`,
      actor_nombre,
      actor_rol || 'Administrador',
      nombre,
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Ya existe un usuario con ese DNI.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:dni', async (req, res) => {
  try {
    const { actor_nombre, actor_rol } = req.body;
    // Multi-rol: si viene 'roles', se actualiza también 'rol' (principal = primero)
    if (req.body.roles !== undefined) {
      const rolesArr = (
        Array.isArray(req.body.roles) ? req.body.roles : String(req.body.roles).split(',')
      )
        .map((s) => String(s).trim())
        .filter(Boolean);
      req.body.roles = rolesArr.join(',');
      req.body.rol = rolesArr[0] || req.body.rol || '';
    }
    const campos = [
      'nombre',
      'password',
      'rol',
      'roles',
      'cargo',
      'estado',
      'sedes',
      'numero_plantilla',
      'email',
    ];
    const sets = [],
      params = [];
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
      `UPDATE usuarios_sistema SET ${sets.join(',')} WHERE dni=$${idx} RETURNING id,dni,nombre,rol,roles,cargo,estado,sedes,numero_plantilla,email`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    logEvento(
      'usuario_editado',
      `${actor_nombre || 'Administrador'} editó el usuario ${rows[0].nombre} (${rows[0].roles || rows[0].rol})`,
      actor_nombre,
      actor_rol || 'Administrador',
      rows[0].nombre,
    );
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
      [limit],
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
      'SELECT red, techo, anio FROM presupuesto_redes ORDER BY red',
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
    const upd = await pool.query(
      `UPDATE presupuesto_redes SET techo=$1, anio=$2 WHERE red=$3 RETURNING *`,
      [techo, anio || 2025, red],
    );
    const row = upd.rowCount === 0
      ? (await pool.query(
          `INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1,$2,$3) RETURNING *`,
          [red, techo, anio || 2025],
        )).rows[0]
      : upd.rows[0];
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// SOLICITUDES DE PRESUPUESTO (rol Presupuesto → Administrador aprueba/deniega)
// ──────────────────────────────────────────────
app.post('/api/solicitudes-presupuesto', async (req, res) => {
  try {
    const { tipo, red, red_destino, monto, motivo, solicitante_dni, solicitante_nombre } = req.body;
    if (!['aumento', 'reduccion', 'reasignacion'].includes(tipo))
      return res.status(400).json({ error: 'tipo inválido' });
    if (!red || !monto || Number(monto) <= 0)
      return res.status(400).json({ error: 'red y monto (>0) son requeridos' });
    if (tipo === 'reasignacion' && !red_destino)
      return res.status(400).json({ error: 'red_destino requerida para reasignación' });
    const { rows } = await pool.query(
      `INSERT INTO solicitud_presupuesto (tipo, red, red_destino, monto, motivo, solicitante_dni, solicitante_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        tipo,
        red,
        tipo === 'reasignacion' ? red_destino : null,
        monto,
        motivo || '',
        solicitante_dni || '',
        solicitante_nombre || '',
      ],
    );
    logEvento(
      'presupuesto_solicitado',
      `${solicitante_nombre || 'Presupuesto'} solicitó ${tipo} de S/ ${monto} en ${red}`,
      solicitante_nombre,
      'Presupuesto',
      red,
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/solicitudes-presupuesto', async (req, res) => {
  try {
    const { estado, solicitante_dni } = req.query;
    const cond = [],
      params = [];
    let i = 1;
    if (estado) {
      cond.push(`estado=$${i++}`);
      params.push(estado);
    }
    if (solicitante_dni) {
      cond.push(`solicitante_dni=$${i++}`);
      params.push(String(solicitante_dni));
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM solicitud_presupuesto ${where} ORDER BY created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/solicitudes-presupuesto/:id/revisar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { decision, revisor_dni, revisor_nombre, respuesta } = req.body; // 'aprobado' | 'denegado'
    if (!['aprobado', 'denegado'].includes(decision))
      return res.status(400).json({ error: 'decision inválida' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM solicitud_presupuesto WHERE id=$1 FOR UPDATE',
      [req.params.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    const s = rows[0];
    if (s.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La solicitud ya fue resuelta.' });
    }

    if (decision === 'aprobado') {
      const monto = Number(s.monto);
      const ajustar = async (red, delta) => {
        // Oracle no tiene ON CONFLICT: se intenta UPDATE y, si no existía la
        // red, se hace INSERT con el delta ya aplicado (arrancando desde 0).
        const updRed = await client.query(
          `UPDATE presupuesto_redes SET techo = GREATEST(techo + $1, 0) WHERE red=$2`,
          [delta, red],
        );
        if (updRed.rowCount === 0) {
          await client.query(
            `INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1, GREATEST($2,0), $3)`,
            [red, delta, new Date().getFullYear()],
          );
        }
      };
      if (s.tipo === 'aumento') await ajustar(s.red, monto);
      else if (s.tipo === 'reduccion') await ajustar(s.red, -monto);
      else if (s.tipo === 'reasignacion') {
        await ajustar(s.red, -monto);
        await ajustar(s.red_destino, monto);
      }
    }

    const upd = await client.query(
      `UPDATE solicitud_presupuesto
       SET estado=$1, revisor_dni=$2, revisor_nombre=$3, respuesta=$4, resolved_at=NOW()
       WHERE id=$5 RETURNING *`,
      [decision, revisor_dni || '', revisor_nombre || '', respuesta || '', req.params.id],
    );
    await client.query('COMMIT');
    logEvento(
      'presupuesto_revisado',
      `${revisor_nombre || 'Administrador'} ${decision} la solicitud de ${s.tipo} en ${s.red}`,
      revisor_nombre,
      'Administrador',
      s.red,
    );
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// MODIFICAR presupuesto directo (rol Presupuesto — ya no requiere aprobación del admin)
// ──────────────────────────────────────────────
app.post('/api/presupuesto/modificar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { tipo, red, red_destino, monto, motivo, actor_dni, actor_nombre } = req.body;
    if (!['aumento', 'reduccion', 'reasignacion'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    if (!red || !monto || Number(monto) <= 0) return res.status(400).json({ error: 'red y monto (>0) son requeridos' });
    if (tipo === 'reasignacion' && !red_destino) return res.status(400).json({ error: 'red_destino requerida para reasignación' });
    const m = Number(monto);

    await client.query('BEGIN');
    const ajustar = async (r, delta) => {
      const updRed = await client.query(
        `UPDATE presupuesto_redes SET techo = GREATEST(techo + $1, 0) WHERE red=$2`,
        [delta, r],
      );
      if (updRed.rowCount === 0) {
        await client.query(
          `INSERT INTO presupuesto_redes (red, techo, anio) VALUES ($1, GREATEST($2,0), $3)`,
          [r, delta, new Date().getFullYear()],
        );
      }
    };
    if (tipo === 'aumento') await ajustar(red, m);
    else if (tipo === 'reduccion') await ajustar(red, -m);
    else { await ajustar(red, -m); await ajustar(red_destino, m); }

    // Historial (queda como 'aplicado', sin paso de aprobación)
    await client.query(
      `INSERT INTO solicitud_presupuesto (tipo, red, red_destino, monto, motivo, estado, solicitante_dni, solicitante_nombre, revisor_nombre, resolved_at)
       VALUES ($1,$2,$3,$4,$5,'aplicado',$6,$7,$7,NOW())`,
      [tipo, red, tipo === 'reasignacion' ? red_destino : null, m, motivo || '', actor_dni || '', actor_nombre || ''],
    );
    await client.query('COMMIT');
    logEvento('presupuesto_modificado', `${actor_nombre || 'Presupuesto'} aplicó ${tipo} de S/ ${m} en ${red}${tipo === 'reasignacion' ? ' → ' + red_destino : ''}`, actor_nombre, 'Presupuesto', red);
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// NOTAS de participantes (el ejecutor sube al terminar la capacitación)
// ──────────────────────────────────────────────
const NOTA_MINIMA = 13;      // nota mínima aprobatoria (0–20). Cambiar aquí si varía.
const PLAZO_NOTAS_DIAS = 5;  // días de plazo tras fecha_fin para subir notas.
// TEMPORAL: ignora la ventana de fechas para poder probar la subida en cualquier actividad.
// Poner en false para producción.
const NOTAS_MODO_PRUEBA = true;

function ventanaNotas(fecha_fin) {
  if (NOTAS_MODO_PRUEBA) return { estado: 'abierto', puedeSubir: true, cierre: null, modoPrueba: true };
  // La existencia en datos_actividad = actividad aprobada (el reloj corre desde fecha_fin).
  if (!fecha_fin) return { estado: 'sin_fecha', puedeSubir: false, cierre: null };
  const hoy = new Date();
  const fin = new Date(fecha_fin);
  const cierre = new Date(fin);
  cierre.setDate(cierre.getDate() + PLAZO_NOTAS_DIAS);
  if (hoy < fin) return { estado: 'no_termina', puedeSubir: false, cierre };
  if (hoy <= cierre) return { estado: 'abierto', puedeSubir: true, cierre };
  return { estado: 'fuera_plazo', puedeSubir: true, cierre };
}

app.post('/api/actividades/:codigo_act/notas', async (req, res) => {
  const codigo_act = req.params.codigo_act;
  try {
    const { notas, ejecutor_nombre } = req.body;
    if (!Array.isArray(notas) || !notas.length) return res.status(400).json({ error: 'No hay notas para guardar.' });

    const act = await pool.query('SELECT fecha_fin FROM datos_actividad WHERE codigo_act=$1', [codigo_act]);
    if (!act.rows.length) return res.status(404).json({ error: 'La actividad no existe o aún no está aprobada.' });
    const v = ventanaNotas(act.rows[0].fecha_fin);
    if (!v.puedeSubir) return res.status(403).json({ error: 'La subida de notas aún no está habilitada (la capacitación no ha terminado).' });
    const fueraPlazo = v.estado === 'fuera_plazo';

    let actualizados = 0;
    const noEncontrados = [];
    for (const n of notas) {
      const nota = Number(n.nota);
      if (!n.dni || isNaN(nota) || nota < 0 || nota > 20) { noEncontrados.push({ dni: n.dni, motivo: 'nota inválida' }); continue; }
      const condicion = nota >= NOTA_MINIMA ? 'Aprobado' : 'Desaprobado';
      const upd = await pool.query(
        `UPDATE lista_participantes SET nota=$1, condicion=$2, nota_subida_at=NOW(), fuera_de_plazo=$3
         WHERE codigo_act=$4 AND dni_ce=$5`,
        [nota, condicion, fueraPlazo ? 'Y' : 'N', codigo_act, String(n.dni)],
      );
      if (upd.rowCount > 0) actualizados += upd.rowCount;
      else noEncontrados.push({ dni: n.dni, motivo: 'DNI no está entre los participantes' });
    }
    logEvento('notas_subidas', `${ejecutor_nombre || 'Ejecutor'} subió notas de ${codigo_act} (${actualizados} participantes${fueraPlazo ? ', fuera de plazo' : ''})`, ejecutor_nombre, 'Ejecutor', codigo_act);
    res.json({ ok: true, actualizados, noEncontrados, fueraPlazo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actividades/:codigo_act/resultados', async (req, res) => {
  const codigo_act = req.params.codigo_act;
  try {
    const act = await pool.query('SELECT nombre_actividad, fecha_fin, red_asistencial FROM datos_actividad WHERE codigo_act=$1', [codigo_act]);
    const fecha_fin = act.rows[0]?.fecha_fin || null;
    const ventana = ventanaNotas(fecha_fin);

    const { rows: partsRaw } = await pool.query(
      `SELECT dni_ce AS dni, TRIM(COALESCE(apellidos,'') || ' ' || COALESCE(nombre,'')) AS nombre, nota, condicion, fuera_de_plazo
       FROM lista_participantes WHERE codigo_act=$1 ORDER BY apellidos, nombre`,
      [codigo_act],
    );
    const parts = partsRaw.map((p) => ({ ...p, fuera_de_plazo: p.fuera_de_plazo === 'Y' }));
    const conNota = parts.filter((p) => p.nota !== null && p.nota !== undefined);
    const calificados = conNota.length;
    const aprobados = conNota.filter((p) => Number(p.nota) >= NOTA_MINIMA).length;
    const promedio = calificados ? conNota.reduce((s, p) => s + Number(p.nota), 0) / calificados : 0;
    const buckets = [['0-5', 0, 5], ['6-10', 6, 10], ['11-12', 11, 12], ['13-16', 13, 16], ['17-20', 17, 20]];
    const distribucion = buckets.map(([rango, min, max]) => ({
      rango,
      cantidad: conNota.filter((p) => Number(p.nota) >= min && Number(p.nota) <= max).length,
    }));
    res.json({
      nombre_actividad: act.rows[0]?.nombre_actividad || codigo_act,
      red_asistencial: act.rows[0]?.red_asistencial || null,
      notaMinima: NOTA_MINIMA,
      ventana,
      total: parts.length,
      calificados,
      aprobados,
      desaprobados: calificados - aprobados,
      promedio: Math.round(promedio * 100) / 100,
      pctAprobacion: calificados ? Math.round((aprobados / calificados) * 100) : 0,
      distribucion,
      participantes: parts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// ESTADÍSTICAS DE NOTAS (dashboard admin) — aprobados/desaprobados, filtrable
// ──────────────────────────────────────────────
app.get('/api/notas/stats', async (req, res) => {
  try {
    const { red = '', codigo_act = '', sexo = '' } = req.query;
    const cond = ['nota IS NOT NULL'], params = [];
    let idx = 1;
    if (red) { cond.push(`red ILIKE $${idx++}`); params.push(`%${red}%`); }
    if (codigo_act) { cond.push(`codigo_act = $${idx++}`); params.push(codigo_act); }
    if (sexo) { cond.push(`sexo = $${idx++}`); params.push(sexo); }
    const where = `WHERE ${cond.join(' AND ')}`;

    const [resumen, porRed, porCapacitacion, porSexo, distribucion, capacitaciones] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE condicion='Aprobado')::int AS aprobados,
                COUNT(*) FILTER (WHERE condicion='Desaprobado')::int AS desaprobados,
                COALESCE(AVG(nota),0)::numeric(4,2) AS promedio
         FROM lista_participantes ${where}`, params),
      pool.query(
        `SELECT COALESCE(red,'Sin Red') AS red,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE condicion='Aprobado')::int AS aprobados,
                COUNT(*) FILTER (WHERE condicion='Desaprobado')::int AS desaprobados
         FROM lista_participantes ${where}
         GROUP BY COALESCE(red,'Sin Red') ORDER BY total DESC LIMIT 15`, params),
      pool.query(
        `SELECT p.codigo_act, COALESCE(a.nombre_actividad, p.codigo_act) AS nombre_actividad,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE p.condicion='Aprobado')::int AS aprobados,
                COUNT(*) FILTER (WHERE p.condicion='Desaprobado')::int AS desaprobados
         FROM lista_participantes p
         LEFT JOIN datos_actividad a ON a.codigo_act = p.codigo_act
         ${where}
         GROUP BY p.codigo_act, COALESCE(a.nombre_actividad, p.codigo_act)
         ORDER BY total DESC LIMIT 15`, params),
      pool.query(
        `SELECT COALESCE(sexo,'No especificado') AS sexo,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE condicion='Aprobado')::int AS aprobados,
                COUNT(*) FILTER (WHERE condicion='Desaprobado')::int AS desaprobados
         FROM lista_participantes ${where}
         GROUP BY COALESCE(sexo,'No especificado')`, params),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE nota BETWEEN 0 AND 5)::int   AS b1,
           COUNT(*) FILTER (WHERE nota BETWEEN 6 AND 10)::int  AS b2,
           COUNT(*) FILTER (WHERE nota BETWEEN 11 AND 12)::int AS b3,
           COUNT(*) FILTER (WHERE nota BETWEEN 13 AND 16)::int AS b4,
           COUNT(*) FILTER (WHERE nota BETWEEN 17 AND 20)::int AS b5
         FROM lista_participantes ${where}`, params),
      // Para el <select> de capacitaciones del filtro (todas las que tienen notas, sin aplicar filtros)
      pool.query(
        `SELECT DISTINCT p.codigo_act, COALESCE(a.nombre_actividad, p.codigo_act) AS nombre_actividad
         FROM lista_participantes p
         LEFT JOIN datos_actividad a ON a.codigo_act = p.codigo_act
         WHERE p.nota IS NOT NULL ORDER BY 2`, []),
    ]);

    const r = resumen.rows[0];
    res.json({
      total: r.total,
      aprobados: r.aprobados,
      desaprobados: r.desaprobados,
      promedio: Number(r.promedio),
      pctAprobacion: r.total ? Math.round((r.aprobados / r.total) * 100) : 0,
      porRed: porRed.rows,
      porCapacitacion: porCapacitacion.rows,
      porSexo: porSexo.rows,
      distribucion: [
        { rango: '0-5', cantidad: distribucion.rows[0].b1 },
        { rango: '6-10', cantidad: distribucion.rows[0].b2 },
        { rango: '11-12', cantidad: distribucion.rows[0].b3 },
        { rango: '13-16', cantidad: distribucion.rows[0].b4 },
        { rango: '17-20', cantidad: distribucion.rows[0].b5 },
      ],
      capacitacionesDisponibles: capacitaciones.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// CARPETAS DE DRIVE por red (donde se guardan los certificados)
// ──────────────────────────────────────────────
app.get('/api/certificados/carpetas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM certificado_carpeta_drive ORDER BY red');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/certificados/carpetas/:red', async (req, res) => {
  try {
    const buscada = normalizarRedKey(decodeURIComponent(req.params.red));
    const { rows } = await pool.query('SELECT * FROM certificado_carpeta_drive');
    const match = rows.find((r) => normalizarRedKey(r.red) === buscada);
    if (!match) return res.json({ existe: false });
    res.json({ existe: true, ...match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/certificados/carpetas/:red', async (req, res) => {
  try {
    const red = decodeURIComponent(req.params.red);
    const { drive_url, actualizado_por } = req.body;
    if (!drive_url || !drive_url.trim()) return res.status(400).json({ error: 'drive_url requerido' });
    const upd = await pool.query(
      `UPDATE certificado_carpeta_drive SET drive_url=$1, actualizado_por=$2, actualizado_at=NOW()
       WHERE red=$3 RETURNING *`,
      [drive_url.trim(), actualizado_por || null, red],
    );
    const row = upd.rowCount === 0
      ? (await pool.query(
          `INSERT INTO certificado_carpeta_drive (red, drive_url, actualizado_por, actualizado_at)
           VALUES ($1,$2,$3,NOW()) RETURNING *`,
          [red, drive_url.trim(), actualizado_por || null],
        )).rows[0]
      : upd.rows[0];
    logEvento('carpeta_drive_actualizada', `${actualizado_por || 'Administrador'} actualizó la carpeta de Drive de ${red}`, actualizado_por, 'Administrador', red);
    res.json(row);
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

    const subida = await storageSdk.upload({
      file: req.file,
      identifier: codigo_act,
      trace: `pdp_documentos_upload_${codigo_act}`,
    });
    if (!subida.isOk) {
      const detalle = subida.result?.data?.message || subida.result?.error || 'error desconocido';
      return res.status(502).json({ error: `No se pudo subir el archivo al storage: ${detalle}` });
    }
    const ruta = subida.item?.newFilename || subida.item?.filename || subida.item?.nameFile;

    const { rows } = await pool.query(
      `INSERT INTO documentos (codigo_act, nombre_archivo, tipo_archivo, ruta_storage, tamano_kb)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [codigo_act, req.file.originalname, tipo, ruta, Math.round(req.file.size / 1024)],
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
      params,
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

    const link = await storageSdk.obtenerArchivoLink(rows[0].ruta_storage);
    res.json({ url: link.fileUrl, nombre_archivo: rows[0].nombre_archivo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/documentos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documentos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

    // El SDK del File Server (storage-sdk.js) que pasó el ingeniero solo expone
    // upload/obtenerArchivoPdf/obtenerArchivoLink — no hay método de borrado.
    // Por ahora solo se borra el registro de la BD; el archivo queda huérfano
    // en el File Server hasta que nos den un endpoint de delete.
    await pool.query('DELETE FROM documentos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// CONVENIOS (rol Convenios: Administrador + Sectoristas con ese sub-rol)
// Convenios marco (con una universidad) <- 1:N -> convenios específicos.
// GET    /api/convenios/kpis
// GET    /api/convenios-marco?q=&estado_vigencia=
// POST   /api/convenios-marco
// PUT    /api/convenios-marco/:id
// DELETE /api/convenios-marco/:id
// GET    /api/convenios-especifico?marco_id=
// POST   /api/convenios-especifico
// PUT    /api/convenios-especifico/:id
// DELETE /api/convenios-especifico/:id
// POST   /api/convenios/documentos          (subir PDF)
// GET    /api/convenios/documentos?convenio_tipo=&convenio_id=
// GET    /api/convenios/documentos/:id/descargar
// DELETE /api/convenios/documentos/:id
// POST   /api/convenios/cargar-excel        (carga masiva)
// ══════════════════════════════════════════════

const CONVENIOS_DIAS_POR_VENCER = 30;

// Clasifica una fila con fecha_fin en 'vigente' | 'por_vencer' | 'vencido' | 'sin_fecha'.
function estadoVigenciaConvenio(fechaFin) {
  if (!fechaFin) return 'sin_fecha';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin);
  fin.setHours(0, 0, 0, 0);
  const dias = Math.round((fin - hoy) / (1000 * 60 * 60 * 24));
  if (dias < 0) return 'vencido';
  if (dias <= CONVENIOS_DIAS_POR_VENCER) return 'por_vencer';
  return 'vigente';
}

app.get('/api/convenios/kpis', async (req, res) => {
  try {
    const [marcos, especificos] = await Promise.all([
      pool.query(`SELECT fecha_fin FROM convenios_marco WHERE estado='Activo'`),
      pool.query(`SELECT fecha_fin FROM convenios_especifico WHERE estado='Activo'`),
    ]);
    const contar = (rows) => {
      const kpi = { vigente: 0, por_vencer: 0, vencido: 0, sin_fecha: 0, total: rows.length };
      for (const r of rows) kpi[estadoVigenciaConvenio(r.fecha_fin)]++;
      return kpi;
    };
    res.json({ marco: contar(marcos.rows), especifico: contar(especificos.rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/convenios-marco', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const cond = [`estado='Activo'`];
    const params = [];
    if (q) {
      cond.push(`(LOWER(universidad) LIKE LOWER($1) OR LOWER(numero_convenio) LIKE LOWER($1))`);
      params.push(`%${q}%`);
    }
    const { rows } = await pool.query(
      `SELECT m.*,
        (SELECT COUNT(*) FROM convenios_especifico e WHERE e.marco_id = m.id AND e.estado='Activo') AS total_especificos
       FROM convenios_marco m WHERE ${cond.join(' AND ')} ORDER BY m.universidad`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, estado_vigencia: estadoVigenciaConvenio(r.fecha_fin) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/convenios-marco', async (req, res) => {
  try {
    const { universidad, numero_convenio, objeto, fecha_inicio, fecha_fin, tipo, sede_principal, created_by } = req.body;
    if (!universidad?.trim()) return res.status(400).json({ error: 'La universidad es obligatoria.' });
    const { rows } = await pool.query(
      `INSERT INTO convenios_marco (universidad, numero_convenio, objeto, fecha_inicio, fecha_fin, tipo, sede_principal, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        universidad.trim(), numero_convenio || null, objeto || null, fecha_inicio || null, fecha_fin || null,
        tipo || 'Universidad', sede_principal || null, created_by || null,
      ],
    );
    logEvento('convenio_marco_creado', `${created_by || 'Usuario'} registró el convenio marco con ${universidad}`, created_by, 'Convenios', numero_convenio);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/convenios-marco/:id', async (req, res) => {
  try {
    const { universidad, numero_convenio, objeto, fecha_inicio, fecha_fin, tipo, sede_principal, estado, actor_nombre } = req.body;
    const { rows } = await pool.query(
      `UPDATE convenios_marco
       SET universidad=$1, numero_convenio=$2, objeto=$3, fecha_inicio=$4, fecha_fin=$5, estado=$6, tipo=$7, sede_principal=$8
       WHERE id=$9 RETURNING *`,
      [
        universidad, numero_convenio || null, objeto || null, fecha_inicio || null, fecha_fin || null,
        estado || 'Activo', tipo || 'Universidad', sede_principal || null, req.params.id,
      ],
    );
    if (!rows.length) return res.status(404).json({ error: 'Convenio marco no encontrado' });
    logEvento('convenio_marco_actualizado', `${actor_nombre || 'Usuario'} actualizó el convenio marco con ${universidad}`, actor_nombre, 'Convenios', numero_convenio);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/convenios-marco/:id', async (req, res) => {
  try {
    const { rows: hijos } = await pool.query(
      `SELECT COUNT(*) AS total FROM convenios_especifico WHERE marco_id=$1`,
      [req.params.id],
    );
    if (Number(hijos[0].total) > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: tiene convenios específicos asociados.' });
    }
    await pool.query('DELETE FROM convenios_marco WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/convenios-especifico', async (req, res) => {
  try {
    const { marco_id } = req.query;
    const where = marco_id ? `WHERE marco_id=$1 AND estado='Activo'` : `WHERE estado='Activo'`;
    const params = marco_id ? [marco_id] : [];
    const { rows } = await pool.query(
      `SELECT * FROM convenios_especifico ${where} ORDER BY fecha_fin ASC NULLS LAST`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, estado_vigencia: estadoVigenciaConvenio(r.fecha_fin) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/convenios-especifico', async (req, res) => {
  try {
    const { marco_id, nombre, numero_convenio, fecha_inicio, fecha_fin, created_by } = req.body;
    if (!marco_id) return res.status(400).json({ error: 'marco_id requerido' });
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre/objeto del convenio específico es obligatorio.' });
    const { rows } = await pool.query(
      `INSERT INTO convenios_especifico (marco_id, nombre, numero_convenio, fecha_inicio, fecha_fin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [marco_id, nombre.trim(), numero_convenio || null, fecha_inicio || null, fecha_fin || null, created_by || null],
    );
    logEvento('convenio_especifico_creado', `${created_by || 'Usuario'} registró el convenio específico "${nombre}"`, created_by, 'Convenios', numero_convenio);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/convenios-especifico/:id', async (req, res) => {
  try {
    const { nombre, numero_convenio, fecha_inicio, fecha_fin, estado, actor_nombre } = req.body;
    const { rows } = await pool.query(
      `UPDATE convenios_especifico
       SET nombre=$1, numero_convenio=$2, fecha_inicio=$3, fecha_fin=$4, estado=$5
       WHERE id=$6 RETURNING *`,
      [nombre, numero_convenio || null, fecha_inicio || null, fecha_fin || null, estado || 'Activo', req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Convenio específico no encontrado' });
    logEvento('convenio_especifico_actualizado', `${actor_nombre || 'Usuario'} actualizó el convenio específico "${nombre}"`, actor_nombre, 'Convenios', numero_convenio);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/convenios-especifico/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM convenio_documentos WHERE convenio_tipo=$1 AND convenio_id=$2', ['especifico', req.params.id]);
    await pool.query('DELETE FROM convenios_especifico WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Documentos de convenios (PDF del convenio marco o específico firmado)
// ──────────────────────────────────────────────
app.post('/api/convenios/documentos', uploadConvenio.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { convenio_tipo, convenio_id, subido_por } = req.body;
    if (!['marco', 'especifico'].includes(convenio_tipo)) {
      return res.status(400).json({ error: 'convenio_tipo debe ser "marco" o "especifico"' });
    }
    if (!convenio_id) return res.status(400).json({ error: 'convenio_id requerido' });

    const subida = await storageSdk.upload({
      file: req.file,
      identifier: `convenio_${convenio_tipo}_${convenio_id}`,
      trace: `pdp_convenio_upload_${convenio_tipo}_${convenio_id}`,
    });
    if (!subida.isOk) {
      const detalle = subida.result?.data?.message || subida.result?.error || 'error desconocido';
      return res.status(502).json({ error: `No se pudo subir el archivo al storage: ${detalle}` });
    }
    const ruta = subida.item?.newFilename || subida.item?.filename || subida.item?.nameFile;

    const { rows } = await pool.query(
      `INSERT INTO convenio_documentos (convenio_tipo, convenio_id, nombre_archivo, tipo_archivo, ruta_storage, tamano_kb, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [convenio_tipo, convenio_id, req.file.originalname, 'pdf', ruta, Math.round(req.file.size / 1024), subido_por || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/convenios/documentos', async (req, res) => {
  try {
    const { convenio_tipo, convenio_id } = req.query;
    if (!convenio_tipo || !convenio_id) return res.json([]);
    const { rows } = await pool.query(
      `SELECT * FROM convenio_documentos WHERE convenio_tipo=$1 AND convenio_id=$2 ORDER BY fecha_subida DESC`,
      [convenio_tipo, convenio_id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/convenios/documentos/:id/descargar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM convenio_documentos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });
    const link = await storageSdk.obtenerArchivoLink(rows[0].ruta_storage);
    res.json({ url: link.fileUrl, nombre_archivo: rows[0].nombre_archivo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/convenios/documentos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM convenio_documentos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// CONTRAPRESTACIONES (informe memoria por universidad — "CONTRAPRESTACIONES
// OTORGADAS A ESSALUD EN CUMPLIMIENTO DE LOS CONVENIOS ESPECÍFICOS SUSCRITOS").
// Es información puramente informativa por universidad: NO debe tocar
// presupuesto_redes, datos_actividad ni ningún KPI/dashboard del sistema.
// Se sube manualmente dentro del panel de cada convenio marco (el marco_id ya
// viene del contexto, no hace falta adivinar la universidad por nombre).
// ──────────────────────────────────────────────
function extraerEncabezadoContraprestaciones(filas) {
  let universidad = null, facultad = null, periodo = null;
  for (const fila of filas) {
    const texto = String(fila[0] || '').trim();
    if (/^UNIVERSIDAD\s*:/i.test(texto)) universidad = texto.replace(/^UNIVERSIDAD\s*:/i, '').trim();
    else if (/^FACULTAD\s*:/i.test(texto)) facultad = texto.replace(/^FACULTAD\s*:/i, '').trim();
    else if (/^PER[IÍ]ODO\s*:/i.test(texto)) periodo = texto.replace(/^PER[IÍ]ODO\s*:/i, '').trim();
  }
  return { universidad, facultad, periodo };
}

function parseFechaDDMMYYYY(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

// Soporta números planos y textos con prefijo de moneda ("S/. 8640") — el prefijo
// "S/." trae un punto que si no se retira primero se cuela como parte del número.
function parseValorizacion(v) {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim().replace(/S\/\.?/gi, '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

const RE_PLAN = /^PLAN\b.*?(\d{4})/i; // cubre "PLAN 2023", "PLAN DE TRABAJO 2023", "PLAN DE TRBAJO 2023" (typo del original), etc.
const RE_SUBTOTAL = /^SUBTOTAL\s*(\d{4})/i;
const RE_TOTAL_RED = /^TOTAL DEL COMPROMISO CONTRAPRESTACIONAL/i;
const RE_TOTAL_GENERAL = /^TOTAL DEL COMPROMISO ESSALUD/i;
function esFilaMarcador(texto) {
  return RE_PLAN.test(texto) || RE_SUBTOTAL.test(texto) || RE_TOTAL_RED.test(texto) || RE_TOTAL_GENERAL.test(texto);
}

// Este informe agrupa por RED, y dentro de cada red por año ("PLAN <año>"),
// cerrando cada año con una fila "SUBTOTAL <año>" y cada red con una fila
// "TOTAL DEL COMPROMISO CONTRAPRESTACIONAL". Al final del documento va el
// "TOTAL DEL COMPROMISO ESSALUD" general. La posición de columna de estos
// marcadores varía fila a fila (datos cargados a mano), así que se buscan en
// cualquier columna, no en una posición fija.
function parseContraprestacionesExcel(wb) {
  const nombreHoja = wb.SheetNames.find((n) => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
    return filas.some((f) => /DETALLE DE LA CONTRAPRESTACION/i.test(String(f[2] || f[1] || '')));
  });
  if (!nombreHoja) return { items: [], resumen: [], universidad: null, facultad: null, periodo: null };

  const todas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '', raw: true });
  const { universidad, facultad, periodo } = extraerEncabezadoContraprestaciones(todas);

  const idxHeader = todas.findIndex((f) => f.some((c) => /DETALLE DE LA CONTRAPRESTACION/i.test(String(c || ''))));
  if (idxHeader === -1) return { items: [], resumen: [], universidad, facultad, periodo };
  const header = todas[idxHeader];
  const col = (patron) => header.findIndex((c) => patron.test(String(c || '').trim()));
  const colUnidad = col(/UNIDAD ORGANICA/i);
  const colDetalle = col(/DETALLE DE LA CONTRAPRESTACION/i);
  const colDuracion = col(/^DURACION/i);
  const colBenef = col(/BENEFICIARIOS/i);
  const colGrupo = col(/GRUPO OCUPAC/i);
  const colFecha = col(/FECHA DE EJECUCION/i);
  const colValor = col(/VALORIZACION/i);
  const colObs = col(/OBSERVACIONES/i);

  let redActual = '';
  let anioActual = null;
  const items = [];
  const resumen = [];

  for (const fila of todas.slice(idxHeader + 1)) {
    const vacia = fila.every((c) => String(c || '').trim() === '');
    if (vacia) continue;

    const textos = fila.map((c) => String(c || '').trim());
    const monto = colValor !== -1 ? parseValorizacion(fila[colValor]) : null;
    const celdaUnidad = colUnidad !== -1 ? String(fila[colUnidad] || '').trim() : '';
    // La celda de "unidad" a veces trae el propio texto del marcador (fila corrida) — en ese caso no sirve como nombre de red.
    const unidadValida = celdaUnidad && !esFilaMarcador(celdaUnidad);

    const tPlan = textos.find((t) => RE_PLAN.test(t));
    if (tPlan) {
      anioActual = tPlan.match(RE_PLAN)[1];
      if (unidadValida) redActual = celdaUnidad;
      continue;
    }

    const tSubtotal = textos.find((t) => RE_SUBTOTAL.test(t));
    if (tSubtotal) {
      resumen.push({ tipo: 'subtotal', red: unidadValida ? celdaUnidad : redActual, anio: tSubtotal.match(RE_SUBTOTAL)[1], monto });
      continue;
    }

    const tTotalRed = textos.find((t) => RE_TOTAL_RED.test(t));
    if (tTotalRed) {
      resumen.push({ tipo: 'total_red', red: unidadValida ? celdaUnidad : redActual, anio: null, monto });
      continue;
    }

    const tTotalGeneral = textos.find((t) => RE_TOTAL_GENERAL.test(t));
    if (tTotalGeneral) {
      resumen.push({ tipo: 'total_general', red: null, anio: null, monto });
      continue;
    }

    const detalle = colDetalle !== -1 ? String(fila[colDetalle] || '').trim() : '';
    if (!detalle) continue; // fila sin contenido real reconocible

    if (unidadValida) redActual = celdaUnidad;

    items.push({
      plan_anio: anioActual,
      unidad_organica: redActual || null,
      detalle,
      duracion: colDuracion !== -1 ? String(fila[colDuracion] || '').trim() || null : null,
      num_beneficiarios: colBenef !== -1 ? String(fila[colBenef] || '').trim() || null : null,
      grupo_ocupacional: colGrupo !== -1 ? String(fila[colGrupo] || '').trim() || null : null,
      fecha_ejecucion: colFecha !== -1 ? parseFechaDDMMYYYY(fila[colFecha]) : null,
      valorizacion: monto,
      observaciones: colObs !== -1 ? String(fila[colObs] || '').trim() || null : null,
    });
  }

  return { items, resumen, universidad, facultad, periodo };
}

app.post('/api/convenios-marco/:id/contraprestaciones/cargar-excel', uploadConveniosExcel.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const marcoId = req.params.id;
    const { actor_nombre } = req.body;

    const { rows: marcoRows } = await pool.query('SELECT id FROM convenios_marco WHERE id=$1', [marcoId]);
    if (!marcoRows.length) return res.status(404).json({ error: 'Convenio marco no encontrado' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const { items, resumen, universidad, facultad, periodo } = parseContraprestacionesExcel(wb);
    if (!items.length) {
      return res.status(400).json({ error: 'No se encontraron filas de contraprestaciones reconocibles en el archivo (se busca la columna "DETALLE DE LA CONTRAPRESTACION OTORGADA").' });
    }

    // Reemplaza el detalle anterior de esta universidad (evita duplicar si se vuelve a subir el mismo informe).
    await pool.query('DELETE FROM convenio_contraprestaciones WHERE marco_id=$1', [marcoId]);
    await pool.query('DELETE FROM convenio_contrap_resumen WHERE marco_id=$1', [marcoId]);

    for (const f of items) {
      await pool.query(
        `INSERT INTO convenio_contraprestaciones
           (marco_id, facultad, periodo, plan_anio, unidad_organica, detalle, duracion,
            num_beneficiarios, grupo_ocupacional, fecha_ejecucion, valorizacion, observaciones, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          marcoId, facultad, periodo, f.plan_anio, f.unidad_organica, f.detalle, f.duracion,
          f.num_beneficiarios, f.grupo_ocupacional, f.fecha_ejecucion, f.valorizacion, f.observaciones,
          actor_nombre || null,
        ],
      );
    }
    for (const r of resumen) {
      await pool.query(
        `INSERT INTO convenio_contrap_resumen (marco_id, tipo, red, anio, monto) VALUES ($1,$2,$3,$4,$5)`,
        [marcoId, r.tipo, r.red, r.anio, r.monto],
      );
    }

    logEvento('convenio_contraprestaciones_cargadas', `${actor_nombre || 'Usuario'} cargó ${items.length} contraprestaciones (informe memoria)`, actor_nombre, 'Convenios', String(marcoId));
    res.json({ filas: items.length, universidadDetectada: universidad, facultad, periodo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/convenios-marco/:id/contraprestaciones', async (req, res) => {
  try {
    const { rows: data } = await pool.query(
      `SELECT * FROM convenio_contraprestaciones WHERE marco_id=$1 ORDER BY unidad_organica, plan_anio, id`,
      [req.params.id],
    );
    const { rows: resumen } = await pool.query(
      `SELECT * FROM convenio_contrap_resumen WHERE marco_id=$1 ORDER BY red, anio`,
      [req.params.id],
    );
    const totalGeneral = resumen.find((r) => r.tipo === 'total_general');
    const totalValorizado = totalGeneral ? Number(totalGeneral.monto) : data.reduce((s, r) => s + (Number(r.valorizacion) || 0), 0);
    res.json({ data, resumen, total: data.length, totalValorizado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Carga masiva de convenios marco por Excel.
// Formato real de EsSalud ("RELACION DE CONVENIOS MARCO..."): 1+ hojas, cada una
// con una fila de título, una fila de encabezado (Nº / INSTITUCION EDUCATIVA /
// SEDE PRINCIPAL / SUSCRITO / VIGENTE HASTA o VENCIMIENTO — el orden de columnas
// varía entre hojas) y luego las filas de datos. No trae número de convenio
// formal ni objeto, ni convenios específicos (esos se siguen cargando a mano).
// Las hojas a leer y su "tipo" (Universidad/Instituto) se definen en
// HOJAS_CONVENIOS_EXCEL — si el archivo trae hojas nuevas hay que agregarlas ahí.
// ──────────────────────────────────────────────
// Solo estas dos hojas son la fuente oficial (confirmado con los encargados de
// EsSalud); otras hojas del archivo (ej. "Hoja1", "Hoja2") no se consideran.
const HOJAS_CONVENIOS_EXCEL = [
  { nombre: 'UNIVERSIDADES', tipo: 'Universidad' },
  { nombre: 'INSTITUTOS', tipo: 'Instituto' },
];

function buscarColumna(headerRow, patron) {
  return headerRow.findIndex((c) => patron.test(String(c || '').trim()));
}

function parseFechaExcelCelda(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Extrae {universidad, sede_principal, fecha_inicio, fecha_fin}[] de una hoja,
// detectando la fila de encabezado por texto (no por posición fija) porque el
// orden de columnas difiere entre UNIVERSIDADES/INSTITUTOS.
function parseHojaConvenioMarco(hoja) {
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true });
  const idxHeader = filas.findIndex((f) => f.some((c) => /INSTITUCION EDUCATIVA/i.test(String(c || ''))));
  if (idxHeader === -1) return [];
  const header = filas[idxHeader];

  const colUniversidad = buscarColumna(header, /INSTITUCION EDUCATIVA/i);
  const colSede = buscarColumna(header, /SEDE PRINCIPAL/i);
  const colInicio = buscarColumna(header, /^SUSCRITO/i);
  const colFin = buscarColumna(header, /VIGENTE HASTA|VENCIMIENTO/i);
  if (colUniversidad === -1) return [];

  const resultado = [];
  for (const fila of filas.slice(idxHeader + 1)) {
    const universidad = String(fila[colUniversidad] || '').replace(/\s*\(renovaci[oó]n\)\s*$/i, '').trim();
    if (!universidad) continue;
    resultado.push({
      universidad,
      sede_principal: colSede !== -1 ? String(fila[colSede] || '').trim() || null : null,
      fecha_inicio: colInicio !== -1 ? parseFechaExcelCelda(fila[colInicio]) : null,
      fecha_fin: colFin !== -1 ? parseFechaExcelCelda(fila[colFin]) : null,
    });
  }
  return resultado;
}

app.post('/api/convenios/cargar-excel', uploadConveniosExcel.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { actor_nombre } = req.body;

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    const { rows: existentes } = await pool.query('SELECT universidad, tipo FROM convenios_marco');
    const yaExisten = new Set(existentes.map((r) => `${r.tipo}|${r.universidad}`.toLowerCase()));

    let marcosCreados = 0;
    let duplicados = 0;
    const errores = [];

    for (const { nombre: nombreHoja, tipo } of HOJAS_CONVENIOS_EXCEL) {
      const hoja = wb.Sheets[nombreHoja];
      if (!hoja) continue; // el archivo puede no traer todas las hojas esperadas

      const filas = parseHojaConvenioMarco(hoja);
      for (const f of filas) {
        const clave = `${tipo}|${f.universidad}`.toLowerCase();
        if (yaExisten.has(clave)) {
          duplicados++;
          continue;
        }
        await pool.query(
          `INSERT INTO convenios_marco (universidad, tipo, sede_principal, fecha_inicio, fecha_fin, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [f.universidad, tipo, f.sede_principal, f.fecha_inicio, f.fecha_fin, actor_nombre || null],
        );
        yaExisten.add(clave);
        marcosCreados++;
      }
    }

    if (marcosCreados === 0 && duplicados === 0) {
      errores.push('No se encontraron filas reconocibles. Verifica que el archivo tenga hojas UNIVERSIDADES/INSTITUTOS con una fila de encabezado que incluya "INSTITUCION EDUCATIVA".');
    }

    logEvento('convenios_carga_excel', `${actor_nombre || 'Usuario'} cargó ${marcosCreados} convenios marco por Excel (${duplicados} ya existían)`, actor_nombre, 'Convenios', null);
    res.json({ marcosCreados, especificosCreados: 0, duplicados, errores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// SSO con SOMOS — ingreso sin volver a iniciar sesión
// El usuario llega ya autenticado desde SOMOS con un token de un solo uso (60s).
// Flujo: SOMOS-frontend genera token -> POST aquí -> validamos contra SOMOS
//        -> resolvemos rol PDP por DNI -> redirigimos al frontend con la sesión.
// ──────────────────────────────────────────────
const SOMOS_API_URL =
  process.env.SOMOS_API_URL || 'https://appsqa.essalud.gob.pe/marcaciones-service/api';
const PDP_FRONTEND_URL = process.env.PDP_FRONTEND_URL || 'http://localhost:4200';
// FASE DE PRUEBAS: si el DNI no existe como usuario PDP, entra como 'Administrador'.
// Cambiar a 'denegar' cuando exista el Administrador General que asigna roles.
const SSO_USUARIO_NO_REGISTRADO = process.env.SSO_USUARIO_NO_REGISTRADO || 'Administrador';

app.post('/api/sso/ingreso', async (req, res) => {
  try {
    const token = req.body.token;
    if (!token) return res.status(400).send('Falta el token de ingreso.');

    // 1. Validar el token contra SOMOS y obtener los datos del trabajador
    const resp = await fetch(
      `${SOMOS_API_URL}/personal/validar-token?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
      },
    );
    const datos = await resp.json();
    if (!datos || !datos.success) {
      return res
        .status(401)
        .send(
          'No se pudo validar la sesión de SOMOS: ' +
            (datos && datos.mensaje ? datos.mensaje : 'token inválido'),
        );
    }

    const dni = datos.dni;

    // 2. Resolver el rol de PDP a partir del DNI
    let usuarioPdp;
    const { rows } = await pool.query('SELECT * FROM usuarios_sistema WHERE dni=$1', [dni]);

    if (rows.length) {
      usuarioPdp = rows[0];
      if (usuarioPdp.estado === 'Inactivo') {
        return res
          .status(403)
          .send('Su cuenta de PDP está desactivada. Contacte al administrador.');
      }
    } else {
      if (SSO_USUARIO_NO_REGISTRADO === 'denegar') {
        return res
          .status(403)
          .send('No tiene acceso a PDP. Solicite al administrador que le asigne un rol.');
      }
      // Alta automática (solo fase de pruebas)
      const nombre = `${datos.nombres || ''} ${datos.apellidos || ''}`.trim() || dni;
      const ins = await pool.query(
        `INSERT INTO usuarios_sistema (dni,nombre,password,rol,cargo,estado,sedes,numero_plantilla,email)
         VALUES ($1,$2,$3,$4,$5,'Activo',$6,$7,$8)
         RETURNING id,dni,nombre,rol,cargo,estado,sedes,numero_plantilla,email`,
        [
          dni,
          nombre,
          '__sso__',
          SSO_USUARIO_NO_REGISTRADO,
          datos.cargo || '',
          datos.dependencia || '',
          datos.codigoPlanilla || '',
          datos.correo || '',
        ],
      );
      usuarioPdp = ins.rows[0];
      logEvento(
        'usuario_creado',
        `Alta automática por SSO: ${nombre} (${SSO_USUARIO_NO_REGISTRADO})`,
        'SSO SOMOS',
        'Sistema',
        nombre,
      );
    }

    // 3. Construir la sesión que el frontend guardará en localStorage.usuario
    const sesion = {
      id: usuarioPdp.id,
      dni: usuarioPdp.dni,
      nombre: usuarioPdp.nombre,
      rol: usuarioPdp.rol,

      roles:
        usuarioPdp.roles && String(usuarioPdp.roles).trim()
          ? String(usuarioPdp.roles)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [usuarioPdp.rol],

      cargo: usuarioPdp.cargo,
      estado: usuarioPdp.estado,
      sedes: usuarioPdp.sedes ? String(usuarioPdp.sedes).split(',').filter(Boolean) : [],
      numeroPlantilla: usuarioPdp.numero_plantilla,
      somos: {
        correo: datos.correo,
        codigoPlanilla: datos.codigoPlanilla,
        regimen: datos.regimen,
        dependencia: datos.dependencia,
        numeroPlaza: datos.numeroPlaza,
      },
    };

    // 4. Redirigir al frontend con la sesión codificada en base64 (un solo salto)
    const payload = Buffer.from(JSON.stringify(sesion), 'utf8').toString('base64');
    return res.redirect(`${PDP_FRONTEND_URL}/sso?u=${encodeURIComponent(payload)}`);
  } catch (err) {
    console.error('Error en SSO ingreso:', err);
    return res.status(500).send('Error al procesar el ingreso SSO.');
  }
});

// ──────────────────────────────────────────────
// INICIAR SERVIDOR
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend PDP corriendo en http://localhost:${PORT}`);
});
