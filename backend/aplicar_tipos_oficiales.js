require('dotenv').config();
const oracledb = require('oracledb');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const RUTA_ORIGEN =
  '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL - CORREGIDO (Tipo de Actividad).xlsx';
const RUTA_SALIDA =
  '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/FORMATO ESTADISTICO GENERAL - CORREGIDO (Tipos Oficiales).xlsx';

// Mapeo directo tipo actual (17) -> grupo oficial (6), donde es inequívoco.
const MAPEO_DIRECTO = {
  CURSO: 'Curso, Taller o Curso-Taller',
  TALLER: 'Curso, Taller o Curso-Taller',
  DIPLOMADO: 'Diplomado o Programa de Especialización',
  CONGRESO: 'Congreso',
  PASANTÍA: 'Pasantía',
  'PASANTÍA INTERNACIONAL': 'Pasantía',
  CONFERENCIA: 'Conferencia (seminarios, simposios), entre otros',
  SIMPOSIO: 'Conferencia (seminarios, simposios), entre otros',
  SEMINARIO: 'Conferencia (seminarios, simposios), entre otros',
};

// Decisiones puntuales del usuario para las 28 filas que no tenían equivalencia clara.
const DECISIONES_USUARIO = {
  '2025PL694': 'Congreso',
  '2025PL310': 'Capacitación Interinstitucional',
  '2025PL759': 'Pasantía',
  '2025PL382': 'Curso, Taller o Curso-Taller',
  '2025PL408': 'Curso, Taller o Curso-Taller',
  '2025PL420': 'Curso, Taller o Curso-Taller',
  '2025PL504': 'Curso, Taller o Curso-Taller',
  '2025PL533': 'Curso, Taller o Curso-Taller',
  '2025PL197': 'Diplomado o Programa de Especialización',
  '2025PL521': 'Curso, Taller o Curso-Taller',
  '2025PL636': 'Pasantía',
  '2025PL076': 'Diplomado o Programa de Especialización',
  '2025PL403': 'Curso, Taller o Curso-Taller',
  '2025PL285': 'Diplomado o Programa de Especialización',
  '2025PL322': 'Pasantía',
  '2025PL511': 'Curso, Taller o Curso-Taller',
  '2025PL549': 'Curso, Taller o Curso-Taller',
  '2025PL821': 'Congreso',
  '2025PL840': 'Pasantía',
  '2025PL198': 'Diplomado o Programa de Especialización',
  '2025PL170': 'Curso, Taller o Curso-Taller',
  '2025PL637': 'Curso, Taller o Curso-Taller',
  '2025PL836': 'Pasantía',
  '2025PL666': 'Curso, Taller o Curso-Taller',
  '2025PL220': 'Curso, Taller o Curso-Taller',
  '2025PL570': 'Curso, Taller o Curso-Taller',
  '2025PL766': 'Congreso',
  '2025PL516': 'Curso, Taller o Curso-Taller',
};

function construirMapeo() {
  const wbRead = XLSX.readFile(RUTA_ORIGEN, { cellDates: true });
  const hojaRead = wbRead.Sheets['DATOS-ACTIVIDAD'];
  const filas = XLSX.utils.sheet_to_json(hojaRead, { header: 1, defval: '' });

  const resultado = new Map(); // fila Excel (1-based) -> { codigo, tipo }
  const porCodigo = new Map(); // codigo_act -> tipo
  const sinMapeo = [];

  for (let i = 8; i < filas.length; i++) {
    const f = filas[i];
    if (!f[1]) continue;
    const codigo = String(f[1]).trim();
    const tipoActual = String(f[8] || '').trim();

    let tipo;
    if (DECISIONES_USUARIO[codigo]) tipo = DECISIONES_USUARIO[codigo];
    else if (MAPEO_DIRECTO[tipoActual]) tipo = MAPEO_DIRECTO[tipoActual];
    else {
      sinMapeo.push({ codigo, tipoActual });
      continue;
    }

    resultado.set(i + 1, { codigo, tipo });
    porCodigo.set(codigo, tipo);
  }

  if (sinMapeo.length) {
    console.error('ERROR: filas sin mapeo, abortando:', sinMapeo);
    process.exit(1);
  }

  return { resultado, porCodigo };
}

async function actualizarExcel(resultado) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(RUTA_ORIGEN);
  const hoja = wb.getWorksheet('DATOS-ACTIVIDAD');
  for (const [filaExcel, { tipo }] of resultado.entries()) {
    hoja.getCell(filaExcel, 9).value = tipo;
  }
  await wb.xlsx.writeFile(RUTA_SALIDA);
  console.log('Excel actualizado ->', RUTA_SALIDA);
}

async function actualizarOracle(porCodigo) {
  const rows = [...porCodigo.entries()].map(([codigo_act, tipo_actividad]) => ({
    codigo_act,
    tipo_actividad,
  }));

  const connectString = `${process.env.DB_QA_HOST}:${process.env.DB_QA_PORT}/${process.env.DB_QA_SERVICE}`;
  const connection = await oracledb.getConnection({
    user: process.env.DB_QA_USER,
    password: process.env.DB_QA_PASSWORD,
    connectString,
  });

  try {
    const result = await connection.executeMany(
      `UPDATE Pdp_datos_actividad SET tipo_actividad = :tipo_actividad WHERE codigo_act = :codigo_act`,
      rows,
      {
        bindDefs: {
          tipo_actividad: { type: oracledb.STRING, maxSize: 50 },
          codigo_act: { type: oracledb.STRING, maxSize: 256 },
        },
      },
    );
    await connection.commit();
    console.log('Filas actualizadas en Oracle QA (rowsAffected):', result.rowsAffected);

    const tally = await connection.execute(
      `SELECT tipo_actividad, COUNT(*) FROM Pdp_datos_actividad GROUP BY tipo_actividad ORDER BY COUNT(*) DESC`,
    );
    console.log('Tally final en BD:');
    for (const [tipo, cnt] of tally.rows) console.log(' ', tipo, '->', cnt);

    const check = await connection.execute(
      `SELECT codigo_act, tipo_actividad FROM Pdp_datos_actividad WHERE codigo_act = '2025PL310'`,
    );
    console.log('Verificación 2025PL310 (Capacitación Interinstitucional):', check.rows);
  } finally {
    await connection.close();
  }
}

(async () => {
  const { resultado, porCodigo } = construirMapeo();
  console.log('Filas a aplicar:', resultado.size);
  await actualizarExcel(resultado);
  await actualizarOracle(porCodigo);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
