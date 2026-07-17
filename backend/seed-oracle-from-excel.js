require('dotenv').config();
const oracledb = require('oracledb');
const XLSX = require('xlsx');

const FILE =
  '/Users/victoracero/Downloads/FORMATO ESTADISTICO GENERAL -  CONSOLIDADO EJECUCION PLC 2025 OD-09.01.25.xlsx';

function s(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim();
}

function excelTimeToHHMM(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) {
    const hh = String(v.getUTCHours()).padStart(2, '0');
    const mm = String(v.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof v === 'number') {
    // fracción de día (0-1)
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  // strings tipo "8:00 a.m.", "2.00 PM", "14:00"
  const str = String(v).trim();
  const m = str.match(/^(\d{1,2})[:.](\d{2})\s*([apAP])\.?\s*[mM]\.?$/);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = m[2];
    const isPM = m[3].toLowerCase() === 'p';
    if (isPM && hh !== 12) hh += 12;
    if (!isPM && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  const m24 = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    return `${m24[1].padStart(2, '0')}:${m24[2]}`;
  }
  return null;
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

function parseIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

async function insertBatched(connection, sql, rows, bindDefs, batchSize = 2000) {
  let inserted = 0;
  const allErrors = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const result = await connection.executeMany(sql, batch, {
      autoCommit: false,
      batchErrors: true,
      bindDefs,
    });
    inserted += batch.length - (result.batchErrors ? result.batchErrors.length : 0);
    if (result.batchErrors && result.batchErrors.length) {
      for (const e of result.batchErrors) {
        allErrors.push({ row: batch[e.offset], message: e.message });
      }
    }
  }
  await connection.commit();
  return { inserted, errors: allErrors };
}

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });

  const connectString = `${process.env.DB_QA_HOST}:${process.env.DB_QA_PORT}/${process.env.DB_QA_SERVICE}`;
  const connection = await oracledb.getConnection({
    user: process.env.DB_QA_USER,
    password: process.env.DB_QA_PASSWORD,
    connectString,
  });

  try {
    // Amplía nombre_proveedor: una fila (2025PL705) trae varios proveedores
    // separados por saltos de línea y pasa los 256 caracteres originales.
    await connection.execute(
      `ALTER TABLE Pdp_datos_actividad MODIFY nombre_proveedor VARCHAR2(500)`,
    );
    // Amplía servicio_area: hay valores reales de hasta 108 caracteres
    // (áreas compuestas separadas por coma) que no caben en VARCHAR2(100).
    await connection.execute(
      `ALTER TABLE Pdp_datos_actividad MODIFY servicio_area VARCHAR2(200)`,
    );
    await connection.commit();
    console.log('nombre_proveedor ampliado a VARCHAR2(500), servicio_area a VARCHAR2(200).');

    // ---------------- PERSONAL ----------------
    const wsPersonal = wb.Sheets['PERSONAL'];
    const rawPersonal = XLSX.utils.sheet_to_json(wsPersonal, { header: 1, defval: null });
    const personalRows = rawPersonal.slice(1).filter((r) => r[0] !== null && r[0] !== '');

    const personalData = personalRows.map((r) => ({
      dni_ce: s(r[0]),
      cod_planilla: s(r[1]),
      apellidos: s(r[2]),
      nombre: s(r[3]),
      sexo: s(r[4]),
      red: s(r[5]),
      sub_programa: s(r[6]),
      servicio_area: s(r[7]),
      cargo: s(r[8]),
      regimen_laboral: s(r[9]),
    }));

    const countPersonal = await connection.execute('SELECT COUNT(*) FROM Pdp_personal');
    if (countPersonal.rows[0][0] > 0) {
      console.log('PERSONAL ya tiene', countPersonal.rows[0][0], 'filas, se omite (ya cargado en un intento previo).');
    } else {
      console.log('PERSONAL a insertar:', personalData.length);
      const resPersonal = await insertBatched(
        connection,
        `INSERT INTO Pdp_personal
           (dni_ce, cod_planilla, apellidos, nombre, sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
         VALUES (:dni_ce, :cod_planilla, :apellidos, :nombre, :sexo, :red, :sub_programa, :servicio_area, :cargo, :regimen_laboral)`,
        personalData,
        {
          dni_ce: { type: oracledb.STRING, maxSize: 15 },
          cod_planilla: { type: oracledb.STRING, maxSize: 15 },
          apellidos: { type: oracledb.STRING, maxSize: 100 },
          nombre: { type: oracledb.STRING, maxSize: 100 },
          sexo: { type: oracledb.STRING, maxSize: 20 },
          red: { type: oracledb.STRING, maxSize: 100 },
          sub_programa: { type: oracledb.STRING, maxSize: 100 },
          servicio_area: { type: oracledb.STRING, maxSize: 100 },
          cargo: { type: oracledb.STRING, maxSize: 256 },
          regimen_laboral: { type: oracledb.STRING, maxSize: 256 },
        },
      );
      console.log('PERSONAL insertados:', resPersonal.inserted, '| errores:', resPersonal.errors.length);
      if (resPersonal.errors.length) console.log(resPersonal.errors.slice(0, 10));
    }

    // ---------------- DATOS-ACTIVIDAD ----------------
    const wsAct = wb.Sheets['DATOS-ACTIVIDAD'];
    const rawAct = XLSX.utils.sheet_to_json(wsAct, { header: 1, defval: null });
    const actRows = rawAct.slice(8).filter((r) => r[1] !== null && r[1] !== '');

    const actData = actRows.map((r) => ({
      numero: parseIntOrNull(r[0]),
      codigo_act: s(r[1]),
      fecha_inicio: r[2] instanceof Date ? r[2] : null,
      fecha_fin: r[3] instanceof Date ? r[3] : null,
      mes_termino: s(r[4]),
      red_asistencial: s(r[5]),
      servicio_area: s(r[6]),
      nombre_actividad: s(r[7]),
      total_horas: parseIntOrNull(r[8]),
      horas_fuera_horario: parseIntOrNull(r[9]),
      frecuencia: s(r[10]),
      hora_inicio: excelTimeToHHMM(r[11]),
      hora_termino: excelTimeToHHMM(r[12]),
      modalidad: s(r[13]),
      publico: s(r[14]),
      nivel_evaluacion: s(r[15]),
      objetivo_estrategico: s(r[16]),
      total_participantes: parseIntOrNull(r[17]),
      ruc_proveedor: s(r[18]),
      nombre_proveedor: s(r[19]),
      sector_proveedor: s(r[20]),
      presupuesto_ejecutado: parseMoney(r[21]),
      eje_tematico: s(r[22]),
    }));

    const horasDescartadas = actRows.filter(
      (r, i) => (r[11] !== null && actData[i].hora_inicio === null) || (r[12] !== null && actData[i].hora_termino === null),
    ).length;
    console.log('DATOS-ACTIVIDAD a insertar:', actData.length, '| filas con hora_inicio/hora_termino no reconocida (quedan NULL):', horasDescartadas);
    const resAct = await insertBatched(
      connection,
      `INSERT INTO Pdp_datos_actividad
         (numero, codigo_act, fecha_inicio, fecha_fin, mes_termino, red_asistencial, servicio_area,
          nombre_actividad, total_horas, horas_fuera_horario, frecuencia, hora_inicio, hora_termino,
          modalidad, publico, nivel_evaluacion, objetivo_estrategico, total_participantes,
          ruc_proveedor, nombre_proveedor, sector_proveedor, presupuesto_ejecutado, eje_tematico)
       VALUES (:numero, :codigo_act, :fecha_inicio, :fecha_fin, :mes_termino, :red_asistencial, :servicio_area,
               :nombre_actividad, :total_horas, :horas_fuera_horario, :frecuencia, :hora_inicio, :hora_termino,
               :modalidad, :publico, :nivel_evaluacion, :objetivo_estrategico, :total_participantes,
               :ruc_proveedor, :nombre_proveedor, :sector_proveedor, :presupuesto_ejecutado, :eje_tematico)`,
      actData,
      {
        numero: { type: oracledb.NUMBER },
        codigo_act: { type: oracledb.STRING, maxSize: 256 },
        fecha_inicio: { type: oracledb.DATE },
        fecha_fin: { type: oracledb.DATE },
        mes_termino: { type: oracledb.STRING, maxSize: 100 },
        red_asistencial: { type: oracledb.STRING, maxSize: 100 },
        servicio_area: { type: oracledb.STRING, maxSize: 200 },
        nombre_actividad: { type: oracledb.STRING, maxSize: 256 },
        total_horas: { type: oracledb.NUMBER },
        horas_fuera_horario: { type: oracledb.NUMBER },
        frecuencia: { type: oracledb.STRING, maxSize: 100 },
        hora_inicio: { type: oracledb.STRING, maxSize: 8 },
        hora_termino: { type: oracledb.STRING, maxSize: 8 },
        modalidad: { type: oracledb.STRING, maxSize: 256 },
        publico: { type: oracledb.STRING, maxSize: 256 },
        nivel_evaluacion: { type: oracledb.STRING, maxSize: 256 },
        objetivo_estrategico: { type: oracledb.STRING, maxSize: 256 },
        total_participantes: { type: oracledb.NUMBER },
        ruc_proveedor: { type: oracledb.STRING, maxSize: 256 },
        nombre_proveedor: { type: oracledb.STRING, maxSize: 500 },
        sector_proveedor: { type: oracledb.STRING, maxSize: 256 },
        presupuesto_ejecutado: { type: oracledb.NUMBER },
        eje_tematico: { type: oracledb.STRING, maxSize: 256 },
      },
    );
    console.log('DATOS-ACTIVIDAD insertados:', resAct.inserted, '| errores:', resAct.errors.length);
    if (resAct.errors.length) console.log(resAct.errors.slice(0, 10));

    // ---------------- LISTA-PARTICIPANTES ----------------
    const codigosActOk = new Set(actData.map((a) => a.codigo_act));
    const dnisPersonalOk = new Set(personalData.map((p) => p.dni_ce));

    const wsPart = wb.Sheets['LISTA-PARTICIPANTES'];
    const rawPart = XLSX.utils.sheet_to_json(wsPart, { header: 1, defval: null });
    const partRows = rawPart.slice(8).filter((r) => r[1] !== null && r[1] !== '');

    const skipped = [];
    const partData = [];
    for (const r of partRows) {
      const codigo_act = s(r[1]);
      const dni_ce = s(r[2]);
      if (!codigosActOk.has(codigo_act) || !dnisPersonalOk.has(dni_ce)) {
        skipped.push({ codigo_act, dni_ce, motivo: !codigosActOk.has(codigo_act) ? 'codigo_act no existe' : 'dni_ce no existe en personal' });
        continue;
      }
      partData.push({
        codigo_act,
        dni_ce,
        cod_planilla: s(r[3]),
        apellidos: s(r[4]),
        nombre: s(r[5]),
        sexo: s(r[6]),
        red: s(r[7]),
        sub_programa: s(r[8]),
        servicio_area: s(r[9]),
        cargo: s(r[10]),
        regimen_laboral: s(r[11]),
      });
    }

    console.log('LISTA-PARTICIPANTES a insertar:', partData.length, '| omitidos (huérfanos):', skipped.length);
    const resPart = await insertBatched(
      connection,
      `INSERT INTO Pdp_lista_participantes
         (codigo_act, dni_ce, cod_planilla, apellidos, nombre, sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
       VALUES (:codigo_act, :dni_ce, :cod_planilla, :apellidos, :nombre, :sexo, :red, :sub_programa, :servicio_area, :cargo, :regimen_laboral)`,
      partData,
      {
        codigo_act: { type: oracledb.STRING, maxSize: 256 },
        dni_ce: { type: oracledb.STRING, maxSize: 15 },
        cod_planilla: { type: oracledb.STRING, maxSize: 100 },
        apellidos: { type: oracledb.STRING, maxSize: 255 },
        nombre: { type: oracledb.STRING, maxSize: 255 },
        sexo: { type: oracledb.STRING, maxSize: 20 },
        red: { type: oracledb.STRING, maxSize: 100 },
        sub_programa: { type: oracledb.STRING, maxSize: 100 },
        servicio_area: { type: oracledb.STRING, maxSize: 256 },
        cargo: { type: oracledb.STRING, maxSize: 256 },
        regimen_laboral: { type: oracledb.STRING, maxSize: 256 },
      },
    );
    console.log('LISTA-PARTICIPANTES insertados:', resPart.inserted, '| errores:', resPart.errors.length);
    if (resPart.errors.length) console.log(resPart.errors.slice(0, 10));

    console.log('\n--- Filas omitidas por huérfanas (primeras 20) ---');
    console.log(skipped.slice(0, 20));
    console.log('Total omitidas:', skipped.length);
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error('Fallo la carga:', err);
  process.exit(1);
});
