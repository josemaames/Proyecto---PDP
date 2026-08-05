require('dotenv').config();
const oracledb = require('oracledb');
const XLSX = require('xlsx');

const RUTA =
  '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx';

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const CATEGORIAS = [
  ['PASANTIA', 'PASANTÍA'], ['PASATIA', 'PASANTÍA'],
  ['CONGRESO', 'CONGRESO'], ['CONFERENCIA', 'CONFERENCIA'], ['SIMPOSIO', 'SIMPOSIO'],
  ['DIPLOMADO', 'DIPLOMADO'], ['SEMINARIO', 'SEMINARIO'], ['WEBINAR', 'WEBINAR'],
  ['TALLER', 'TALLER'], ['CURSO', 'CURSO'], ['JORNADA', 'JORNADA'], ['FORO', 'FORO'],
  ['ENTRENAMIENTO', 'ENTRENAMIENTO'], ['PROGRAMA', 'PROGRAMA'], ['REUNION', 'REUNIÓN'],
  ['ROTACION', 'ROTACIÓN'], ['ESTANCIA', 'ESTANCIA'], ['VISITA', 'VISITA'],
  ['PRACTICA', 'PRÁCTICA'], ['CAPACITACION', 'CAPACITACIÓN'],
];
const PAISES = [
  'ESTADOS UNIDOS', 'EE.UU', 'EEUU', 'ARGENTINA', 'CHILE', 'COLOMBIA', 'URUGUAY',
  'BRASIL', 'BRAZIL', 'MEXICO', 'ESPAÑA', 'PARAGUAY', 'BOLIVIA', 'ECUADOR',
  'VENEZUELA', 'PANAMA', 'CUBA', 'COSTA RICA', 'GUATEMALA', 'HONDURAS',
  'EL SALVADOR', 'NICARAGUA', 'REPUBLICA DOMINICANA', 'PUERTO RICO', 'CANADA',
  'FRANCIA', 'ALEMANIA', 'ITALIA', 'PORTUGAL', 'INGLATERRA', 'REINO UNIDO',
  'SUIZA', 'HOLANDA', 'PAISES BAJOS', 'BELGICA', 'SUECIA', 'NORUEGA',
  'DINAMARCA', 'AUSTRIA', 'RUSIA', 'CHINA', 'JAPON', 'COREA', 'INDIA',
  'ISRAEL', 'TURQUIA', 'SINGAPUR', 'SINGAPURE', 'AUSTRALIA', 'NUEVA ZELANDA',
  'SUDAFRICA', 'EGIPTO', 'MARRUECOS', 'MIAMI', 'BARCELONA',
];
// Corrección manual confirmada por el usuario.
const OVERRIDES = { '2025PL700': 'PASANTÍA INTERNACIONAL' };

function clasificar(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  let mejor = null, mejorIdx = Infinity;
  for (const [buscar, etiqueta] of CATEGORIAS) {
    const idx = n.indexOf(buscar);
    if (idx !== -1 && idx < mejorIdx) { mejorIdx = idx; mejor = etiqueta; }
  }
  return mejor;
}
function esInternacional(nombre) {
  const n = quitarTildes(nombre.toUpperCase());
  if (/\bINTERNACIONAL\b/.test(n)) return true;
  for (const pais of PAISES) {
    const re = new RegExp('\\b' + quitarTildes(pais).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(n)) return true;
  }
  return false;
}

async function main() {
  const wb = XLSX.readFile(RUTA, { cellDates: true });
  const hoja = wb.Sheets['DATOS-ACTIVIDAD'];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

  const rows = [];
  let conOverride = 0;
  for (let i = 8; i < filas.length; i++) {
    const f = filas[i];
    if (!f[1]) continue;
    const codigo = String(f[1]).trim();
    const nombre = String(f[7] || '').trim();
    let cat;
    if (OVERRIDES[codigo]) { cat = OVERRIDES[codigo]; conOverride++; }
    else {
      cat = clasificar(nombre);
      if (!cat) cat = esInternacional(nombre) ? 'PASANTÍA INTERNACIONAL' : 'CURSO';
      else if (cat === 'PASANTÍA' && esInternacional(nombre)) cat = 'PASANTÍA INTERNACIONAL';
    }
    rows.push({ codigo_act: codigo, tipo_actividad: cat });
  }

  console.log('Filas a actualizar:', rows.length, '| con override manual:', conOverride);

  const connectString = `${process.env.DB_QA_HOST}:${process.env.DB_QA_PORT}/${process.env.DB_QA_SERVICE}`;
  const connection = await oracledb.getConnection({
    user: process.env.DB_QA_USER,
    password: process.env.DB_QA_PASSWORD,
    connectString,
  });

  try {
    const result = await connection.executeMany(
      `UPDATE Pdp_datos_actividad SET tipo_actividad = :tipo_actividad WHERE codigo_act = :codigo_act`,
      rows.map((r) => ({ tipo_actividad: r.tipo_actividad, codigo_act: r.codigo_act })),
      {
        bindDefs: {
          tipo_actividad: { type: oracledb.STRING, maxSize: 50 },
          codigo_act: { type: oracledb.STRING, maxSize: 256 },
        },
      },
    );
    await connection.commit();
    console.log('Filas actualizadas (rowsAffected):', result.rowsAffected);

    // Verificación
    const countTotal = await connection.execute(
      `SELECT COUNT(*) FROM Pdp_datos_actividad WHERE tipo_actividad IS NOT NULL`,
    );
    console.log('Total con tipo_actividad asignado en BD:', countTotal.rows[0][0]);

    const check = await connection.execute(
      `SELECT codigo_act, tipo_actividad FROM Pdp_datos_actividad WHERE codigo_act = '2025PL700'`,
    );
    console.log('Verificación código 2025PL700:', check.rows);

    // Tally por tipo
    const tally = await connection.execute(
      `SELECT tipo_actividad, COUNT(*) FROM Pdp_datos_actividad GROUP BY tipo_actividad ORDER BY COUNT(*) DESC`,
    );
    console.log('Tally por tipo en BD:');
    for (const [tipo, cnt] of tally.rows) console.log(' ', tipo, '->', cnt);
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
