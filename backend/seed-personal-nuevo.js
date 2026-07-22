// Carga el padrón nuevo de personal (PA_JUNIO2026-2.xlsx, mismas cabeceras que
// la hoja PERSONAL original) insertando solo los DNI que todavía no existen en
// Pdp_personal. No actualiza ni borra a nadie (eso es la función "Actualizar").
require('dotenv').config();
const XLSX = require('xlsx');
const db = require('./db-oracle');

const ARCHIVO =
  '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/PA_JUNIO2026-2.xlsx';

function s(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim();
}

function dni(v) {
  const str = s(v);
  if (!str) return null;
  return /^\d+$/.test(str) ? str.padStart(8, '0') : str;
}

async function main() {
  const wb = XLSX.readFile(ARCHIVO);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const filas = raw.slice(1).filter((r) => r[0] !== null && r[0] !== '');

  console.log('Filas en el Excel:', filas.length);

  const { rows: existentes } = await db.query('SELECT dni_ce FROM personal');
  const dnisExistentes = new Set(existentes.map((r) => r.dni_ce));
  console.log('DNIs ya en Pdp_personal:', dnisExistentes.size);

  const nuevos = [];
  const vistosEnArchivo = new Set();
  let duplicadosEnArchivo = 0;

  for (const r of filas) {
    const dniCe = dni(r[0]);
    if (!dniCe) continue;
    if (dnisExistentes.has(dniCe)) continue; // ya existe en la BD
    if (vistosEnArchivo.has(dniCe)) {
      duplicadosEnArchivo++;
      continue; // duplicado dentro del mismo Excel
    }
    vistosEnArchivo.add(dniCe);
    nuevos.push({
      dni_ce: dniCe,
      cod_planilla: s(r[1]),
      apellidos: s(r[2]),
      nombre: s(r[3]),
      sexo: s(r[4]),
      red: s(r[5]),
      sub_programa: s(r[6]),
      servicio_area: s(r[7]),
      cargo: s(r[8]),
      regimen_laboral: s(r[9]),
    });
  }

  console.log('Nuevos a insertar:', nuevos.length, '| duplicados dentro del propio Excel (omitidos):', duplicadosEnArchivo);

  let insertados = 0;
  const batchSize = 500;
  for (let i = 0; i < nuevos.length; i += batchSize) {
    const lote = nuevos.slice(i, i + batchSize);
    for (const p of lote) {
      await db.query(
        `INSERT INTO personal (dni_ce, cod_planilla, apellidos, nombre, sexo, red, sub_programa, servicio_area, cargo, regimen_laboral)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.dni_ce, p.cod_planilla, p.apellidos, p.nombre, p.sexo, p.red, p.sub_programa, p.servicio_area, p.cargo, p.regimen_laboral],
      );
      insertados++;
    }
    console.log(`  ... ${insertados}/${nuevos.length}`);
  }

  console.log('Listo. Insertados:', insertados);
}

main().catch((err) => {
  console.error('FALLÓ:', err.message);
  process.exit(1);
});
